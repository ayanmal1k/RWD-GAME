import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { PublicKey } from '@solana/web3.js';
import { createAuthCookieValue, AUTH_COOKIE_NAME } from '@/lib/auth';
import nacl from 'tweetnacl';

/**
 * POST /api/auth/verify
 *
 * Verifies that the wallet owns the claimed address by checking an ed25519
 * signature over the challenge nonce. Sets an httpOnly auth cookie on success.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { walletAddress, nonce, signature } = body;

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Valid walletAddress is required' }, { status: 400 });
    }
    if (!nonce || typeof nonce !== 'string') {
      return NextResponse.json({ error: 'Valid nonce is required' }, { status: 400 });
    }
    if (!signature || typeof signature !== 'string') {
      return NextResponse.json({ error: 'Valid signature is required' }, { status: 400 });
    }

    // Load and validate the challenge from Firestore
    const challengeRef = doc(db, 'auth_challenges', nonce);
    const challengeSnap = await getDoc(challengeRef);

    if (!challengeSnap.exists()) {
      return NextResponse.json({ error: 'Challenge not found or already used' }, { status: 400 });
    }

    const challenge = challengeSnap.data();

    // Verify the challenge hasn't expired
    if (Date.now() > challenge.expiresAt) {
      await deleteDoc(challengeRef);
      return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
    }

    // Verify the challenge was issued for this wallet
    if (challenge.walletAddress !== walletAddress) {
      return NextResponse.json({ error: 'Challenge was not issued for this wallet' }, { status: 400 });
    }

    // Verify the ed25519 signature
    let isValid = false;
    try {
      const publicKeyBytes = new PublicKey(walletAddress).toBytes();
      const messageBytes = new TextEncoder().encode(nonce);
      const signatureBytes = Buffer.from(signature, 'base64');

      isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );
    } catch (err) {
      return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
    }

    if (!isValid) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 });
    }

    // Signature is valid — delete the challenge (single-use)
    await deleteDoc(challengeRef);

    // Create signed auth cookie
    const cookieValue = createAuthCookieValue(walletAddress);

    const response = NextResponse.json({ success: true, walletAddress });

    // Set httpOnly, secure, sameSite=strict cookie
    response.cookies.set(AUTH_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60, // 24 hours in seconds
    });

    return response;
  } catch (error: any) {
    console.error('Error verifying auth challenge:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
