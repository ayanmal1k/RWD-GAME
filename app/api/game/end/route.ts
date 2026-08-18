import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, serverTimestamp, increment } from 'firebase/firestore';

import {
  getAuthenticatedWallet,
  verifySessionToken,
} from '@/lib/auth';

/**
 * POST /api/game/end
 *
 * Requires:
 * - Auth cookie (wallet ownership proof)
 * - Body: { sessionId, token, score, coins }
 *
 * Flow:
 * 1. Authenticate wallet from cookie
 * 2. Load session from gameSessions collection
 * 3. Verify session ownership (wallet matches)
 * 4. Verify session is ACTIVE
 * 5. Verify session not expired
 * 6. Verify HMAC token (constant-time)
 * 7. Anti-cheat validation
 * 8. Persist results
 */
export async function POST(request: Request) {
  try {
    // 1. AUTHENTICATE
    const walletAddress = getAuthenticatedWallet(request);
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Authentication required. Please connect and verify your wallet.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { sessionId, token, score, coins } = body;

    if (!sessionId || !token || typeof score !== 'number' || typeof coins !== 'number') {
      return NextResponse.json({ error: 'Invalid parameters provided' }, { status: 400 });
    }

    if (score < 0 || coins < 0) {
      return NextResponse.json({ error: 'Score and coins must be non-negative' }, { status: 400 });
    }

    // 2. LOAD SESSION
    const sessionRef = doc(db, 'gameSessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionSnap.data();

    // 3. VERIFY SESSION OWNERSHIP — wallet from cookie must match session
    if (session.userAddress !== walletAddress) {
      return NextResponse.json({ error: 'Session does not belong to this wallet' }, { status: 403 });
    }

    // 4. VERIFY SESSION STATE
    if (session.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Game session has already ended or expired' },
        { status: 400 }
      );
    }

    // 5. VERIFY SESSION NOT EXPIRED
    const now = Date.now();
    if (now > session.expiresAt) {
      // Mark as expired
      await updateDoc(sessionRef, {
        status: 'EXPIRED',
        expiredAt: serverTimestamp(),
      });
      return NextResponse.json(
        { error: 'Game session has expired (30 minute limit)' },
        { status: 400 }
      );
    }

    // 6. VERIFY HMAC TOKEN (constant-time comparison)
    const tokenValid = verifySessionToken(token, sessionId, walletAddress, session.expiresAt);
    if (!tokenValid) {
      return NextResponse.json({ error: 'Invalid session token' }, { status: 403 });
    }

    // 7. ANTI-CHEAT VALIDATION
    const elapsedSeconds = Math.max(1, Math.round((now - session.createdAt) / 1000));

    const MAX_SCORE_PER_SEC = 120;
    const MAX_COINS_PER_SEC = 3.0;
    const MAX_TOTAL_SCORE_FOR_DURATION = MAX_SCORE_PER_SEC * elapsedSeconds;
    const MAX_TOTAL_COINS_FOR_DURATION = MAX_COINS_PER_SEC * elapsedSeconds;

    let flagReason: string | null = null;

    if (score > 0 && elapsedSeconds < 2) {
      flagReason = `Impossible run time (${elapsedSeconds}s for score ${score})`;
    } else if (score / elapsedSeconds > MAX_SCORE_PER_SEC) {
      flagReason = `Score rate exceeded (${(score / elapsedSeconds).toFixed(1)} pts/sec > ${MAX_SCORE_PER_SEC} max)`;
    } else if (coins / elapsedSeconds > MAX_COINS_PER_SEC) {
      flagReason = `Coin rate exceeded (${(coins / elapsedSeconds).toFixed(1)} coins/sec > ${MAX_COINS_PER_SEC} max)`;
    } else if (score > MAX_TOTAL_SCORE_FOR_DURATION) {
      flagReason = `Score exceeds maximum for duration (${score} > ${MAX_TOTAL_SCORE_FOR_DURATION} for ${elapsedSeconds}s)`;
    } else if (coins > MAX_TOTAL_COINS_FOR_DURATION) {
      flagReason = `Coins exceed maximum for duration (${coins} > ${Math.round(MAX_TOTAL_COINS_FOR_DURATION)} for ${elapsedSeconds}s)`;
    }

    if (flagReason) {
      console.warn(`[ANTI-CHEAT FLAGGED] User ${walletAddress} flagged: ${flagReason}`);
      await updateDoc(sessionRef, {
        status: 'FLAGGED',
        flagReason,
        attemptedScore: score,
        attemptedCoins: coins,
        flaggedAt: serverTimestamp(),
      });

      return NextResponse.json(
        { error: 'Anti-cheat verification failed', details: flagReason },
        { status: 400 }
      );
    }

    // 8. PERSIST RESULTS
    // Mark session as completed
    await updateDoc(sessionRef, {
      status: 'COMPLETED',
      finalScore: score,
      finalCoins: coins,
      durationSeconds: elapsedSeconds,
      completedAt: serverTimestamp(),
    });

    // Log verified run to game_history
    await addDoc(collection(db, 'game_history'), {
      userAddress: walletAddress,
      score,
      coins,
      durationSeconds: elapsedSeconds,
      sessionId,
      verified: true,
      createdAt: serverTimestamp(),
    });

    // Deposit verified coins into user bank in Firestore
    if (coins > 0) {
      const userRef = doc(db, 'users', walletAddress);
      try {
        await updateDoc(userRef, {
          totalCoins: increment(coins),
          updatedAt: serverTimestamp(),
        });
      } catch {
        await setDoc(userRef, {
          address: walletAddress,
          totalCoins: coins,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
    }

    return NextResponse.json({
      success: true,
      verifiedScore: score,
      verifiedCoins: coins,
      durationSeconds: elapsedSeconds,
    });
  } catch (error: any) {
    console.error('Error ending game session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
