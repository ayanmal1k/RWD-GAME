import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

import { fetchRealTokenBalance, MIN_REAL_REQUIRED } from '@/lib/solana';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userAddress } = body;

    if (!userAddress || typeof userAddress !== 'string') {
      return NextResponse.json({ error: 'Valid userAddress is required' }, { status: 400 });
    }

    // Verify $RWD token balance on-chain
    const rwdBalance = await fetchRealTokenBalance(userAddress);
    if (rwdBalance < MIN_REAL_REQUIRED) {
      return NextResponse.json(
        {
          error: `Access Denied: Wallet must hold at least ${MIN_REAL_REQUIRED.toLocaleString()} $RWD tokens to play. Current holdings: ${rwdBalance.toLocaleString()} $RWD.`
        },
        { status: 403 }
      );
    }

    const sessionId = crypto.randomUUID();
    const token = crypto.randomBytes(24).toString('hex');
    const now = Date.now();

    // Record session start on server
    await setDoc(doc(db, 'game_sessions', sessionId), {
      sessionId,
      userAddress,
      token,
      startTime: now,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({ sessionId, token });
  } catch (error: any) {
    console.error('Error starting game session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
