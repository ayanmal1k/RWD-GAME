import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userAddress } = body;

    if (!userAddress || typeof userAddress !== 'string') {
      return NextResponse.json({ error: 'Valid userAddress is required' }, { status: 400 });
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
