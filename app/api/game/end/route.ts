import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, token, score, coins } = body;

    if (!sessionId || !token || typeof score !== 'number' || typeof coins !== 'number') {
      return NextResponse.json({ error: 'Invalid parameters provided' }, { status: 400 });
    }

    if (score < 0 || coins < 0) {
      return NextResponse.json({ error: 'Score and coins must be non-negative' }, { status: 400 });
    }

    const sessionRef = doc(db, 'game_sessions', sessionId);
    const sessionSnap = await getDoc(sessionRef);

    if (!sessionSnap.exists()) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionSnap.data();

    // Single-use token / status verification
    if (session.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Game session has already ended or expired' }, { status: 400 });
    }

    // Token authenticity check
    if (session.token !== token) {
      return NextResponse.json({ error: 'Session token mismatch' }, { status: 403 });
    }

    const now = Date.now();
    const elapsedSeconds = Math.max(1, Math.round((now - session.startTime) / 1000));

    // Anti-cheat verification checks
    const MAX_SCORE_PER_SEC = 120; // Realistic maximum climb score per second
    const MAX_COINS_PER_SEC = 3.0; // Realistic maximum coins collected per second

    let flagReason: string | null = null;

    if (score > 0 && elapsedSeconds < 2) {
      flagReason = `Impossible run time (${elapsedSeconds}s for score ${score})`;
    } else if (score / elapsedSeconds > MAX_SCORE_PER_SEC) {
      flagReason = `Score rate threshold exceeded (${(score / elapsedSeconds).toFixed(1)} pts/sec > ${MAX_SCORE_PER_SEC} max)`;
    } else if (coins / elapsedSeconds > MAX_COINS_PER_SEC) {
      flagReason = `Coin rate threshold exceeded (${(coins / elapsedSeconds).toFixed(1)} coins/sec > ${MAX_COINS_PER_SEC} max)`;
    }

    if (flagReason) {
      console.warn(`[ANTI-CHEAT TRIGGERED] User ${session.userAddress} flagged: ${flagReason}`);
      await updateDoc(sessionRef, {
        status: 'FLAGGED_CHEATING',
        flagReason,
        attemptedScore: score,
        attemptedCoins: coins,
        endedAt: serverTimestamp(),
      });

      return NextResponse.json(
        { error: 'Anti-cheat verification failed', details: flagReason },
        { status: 400 }
      );
    }

    // Mark session as completed
    await updateDoc(sessionRef, {
      status: 'COMPLETED',
      finalScore: score,
      finalCoins: coins,
      durationSeconds: elapsedSeconds,
      endedAt: serverTimestamp(),
    });

    // Log verified run to game_history
    await addDoc(collection(db, 'game_history'), {
      userAddress: session.userAddress,
      score,
      coins,
      durationSeconds: elapsedSeconds,
      sessionId,
      verified: true,
      createdAt: serverTimestamp(),
    });

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
