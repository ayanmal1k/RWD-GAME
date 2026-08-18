import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import crypto from 'crypto';

/**
 * POST /api/auth/challenge
 *
 * Issues a random nonce for the wallet to sign, proving ownership.
 * The nonce is stored in Firestore with a 5-minute expiry.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { walletAddress } = body;

    if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.length < 32) {
      return NextResponse.json({ error: 'Valid walletAddress is required' }, { status: 400 });
    }

    const nonce = crypto.randomUUID();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Store the challenge nonce in Firestore
    await setDoc(doc(db, 'auth_challenges', nonce), {
      nonce,
      walletAddress,
      expiresAt,
      used: false,
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({ nonce, expiresAt });
  } catch (error: any) {
    console.error('Error creating auth challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
