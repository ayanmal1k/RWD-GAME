import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, runTransaction } from 'firebase/firestore';
import { PublicKey } from '@solana/web3.js';
import { createAuthCookieValue, AUTH_COOKIE_NAME } from '@/lib/auth';
import nacl from 'tweetnacl';

/**
 * POST /api/auth/verify
 *
 * Verifies that the wallet owns the claimed address by checking an ed25519
 * signature over the challenge nonce. Sets an httpOnly auth cookie on success.
 *
 * Uses Firestore runTransaction to atomically consume the challenge nonce,
 * preventing replay of a valid signed challenge.
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

    // Verify the ed25519 signature first (before touching Firestore)
    let isSignatureValid = false;
    try {
      const publicKeyBytes = new PublicKey(walletAddress).toBytes();
      const messageBytes = new TextEncoder().encode(nonce);
      const signatureBytes = Buffer.from(signature, 'base64');

      isSignatureValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );
    } catch {
      return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 });
    }

    if (!isSignatureValid) {
      return NextResponse.json({ error: 'Signature verification failed' }, { status: 403 });
    }

    // Atomically consume the challenge nonce using Firestore transaction.
    // This prevents replay: if two requests arrive with the same signed nonce,
    // only the first one succeeds.
    const challengeRef = doc(db, 'auth_challenges', nonce);

    try {
      await runTransaction(db, async (transaction) => {
        const challengeSnap = await transaction.get(challengeRef);

        if (!challengeSnap.exists()) {
          throw new Error('CHALLENGE_NOT_FOUND');
        }

        const challenge = challengeSnap.data();

        // Reject already-used nonce
        if (challenge.used === true) {
          throw new Error('CHALLENGE_ALREADY_USED');
        }

        // Reject expired nonce
        if (Date.now() > challenge.expiresAt) {
          // Mark as used so cleanup is clear
          transaction.update(challengeRef, { used: true });
          throw new Error('CHALLENGE_EXPIRED');
        }

        // Reject nonce issued for a different wallet
        if (challenge.walletAddress !== walletAddress) {
          throw new Error('CHALLENGE_WALLET_MISMATCH');
        }

        // Atomically mark as used (then delete below)
        transaction.delete(challengeRef);
      });
    } catch (err: any) {
      const msg = err.message || '';
      if (msg === 'CHALLENGE_NOT_FOUND') {
        return NextResponse.json({ error: 'Challenge not found or already used' }, { status: 400 });
      }
      if (msg === 'CHALLENGE_ALREADY_USED') {
        return NextResponse.json({ error: 'Challenge has already been used' }, { status: 400 });
      }
      if (msg === 'CHALLENGE_EXPIRED') {
        return NextResponse.json({ error: 'Challenge expired' }, { status: 400 });
      }
      if (msg === 'CHALLENGE_WALLET_MISMATCH') {
        return NextResponse.json({ error: 'Challenge was not issued for this wallet' }, { status: 400 });
      }
      throw err;
    }

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
