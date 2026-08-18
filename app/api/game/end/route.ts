import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, setDoc, serverTimestamp, increment } from 'firebase/firestore';

import {
  getAuthenticatedWallet,
  verifySessionToken,
  calculateVerifiedReward,
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
 * 6. Verify HMAC token (constant-time, reconstructed — not read from DB)
 * 7. Server-side reward calculation with hard caps
 * 8. Persist results with server-calculated values
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
    // Token is reconstructed from session data + server secret, NOT read from DB
    const tokenValid = verifySessionToken(token, sessionId, walletAddress, session.expiresAt);
    if (!tokenValid) {
      return NextResponse.json({ error: 'Invalid session token' }, { status: 403 });
    }

    // 7. SERVER-SIDE REWARD CALCULATION
    const elapsedSeconds = Math.max(1, Math.round((now - session.createdAt) / 1000));

    const { verifiedScore, verifiedCoins, flagReason } = calculateVerifiedReward(
      score,
      coins,
      elapsedSeconds
    );

    if (flagReason) {
      console.warn(`[ANTI-CHEAT FLAGGED] User ${walletAddress} flagged: ${flagReason}`);
      await updateDoc(sessionRef, {
        status: 'FLAGGED',
        flagReason,
        attemptedScore: score,
        attemptedCoins: coins,
        durationSeconds: elapsedSeconds,
        flaggedAt: serverTimestamp(),
      });

      return NextResponse.json(
        { error: 'Anti-cheat verification failed', details: flagReason },
        { status: 400 }
      );
    }

    // 8. PERSIST RESULTS — using server-calculated values, not client-claimed values
    await updateDoc(sessionRef, {
      status: 'COMPLETED',
      finalScore: verifiedScore,
      finalCoins: verifiedCoins,
      claimedScore: score,
      claimedCoins: coins,
      durationSeconds: elapsedSeconds,
      completedAt: serverTimestamp(),
    });

    // Log verified run to game_history
    await addDoc(collection(db, 'game_history'), {
      userAddress: walletAddress,
      score: verifiedScore,
      coins: verifiedCoins,
      durationSeconds: elapsedSeconds,
      sessionId,
      verified: true,
      createdAt: serverTimestamp(),
    });

    // Deposit server-verified coins into user bank in Firestore
    if (verifiedCoins > 0) {
      const userRef = doc(db, 'users', walletAddress);
      try {
        await updateDoc(userRef, {
          totalCoins: increment(verifiedCoins),
          updatedAt: serverTimestamp(),
        });
      } catch {
        await setDoc(userRef, {
          address: walletAddress,
          totalCoins: verifiedCoins,
          createdAt: serverTimestamp(),
        }, { merge: true });
      }
    }

    return NextResponse.json({
      success: true,
      verifiedScore,
      verifiedCoins,
      durationSeconds: elapsedSeconds,
    });
  } catch (error: any) {
    console.error('Error ending game session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
