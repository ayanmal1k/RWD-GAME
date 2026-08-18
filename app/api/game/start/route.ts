import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import crypto from 'crypto';

import {
  getAuthenticatedWallet,
  createSessionToken,
  getTreasuryWallet,
  getSolanaNetwork,
  getRwdMint,
  GAME_FEE_AMOUNT,
  SESSION_TTL_MS,
} from '@/lib/auth';

const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * POST /api/game/start
 *
 * Requires:
 * - Auth cookie (wallet ownership proof)
 * - Body: { txSignature }
 *
 * Flow:
 * 1. Authenticate wallet from cookie
 * 2. Check idempotency (same txSignature → return existing session)
 * 3. Verify the transaction on-chain (finalized, correct mint/source/dest/amount)
 * 4. Atomically claim the payment and create session in Firestore
 * 5. Return session credentials
 */
export async function POST(request: Request) {
  try {
    // 1. AUTHENTICATE — wallet address comes from signed auth cookie, not request body
    const walletAddress = getAuthenticatedWallet(request);
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Authentication required. Please connect and verify your wallet.' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { txSignature } = body;

    if (!txSignature || typeof txSignature !== 'string' || txSignature.length < 20) {
      return NextResponse.json(
        { error: 'Valid txSignature is required' },
        { status: 400 }
      );
    }

    // 2. IDEMPOTENCY CHECK — if this txSignature was already processed, return existing session
    const existingPayment = await getDoc(doc(db, 'gamePayments', txSignature));
    if (existingPayment.exists()) {
      const payment = existingPayment.data();

      // Different wallet trying to claim the same tx → reject
      if (payment.userAddress !== walletAddress) {
        return NextResponse.json(
          { error: 'This transaction belongs to a different wallet' },
          { status: 403 }
        );
      }

      // Payment already has a session — return it (idempotent retry)
      if (payment.sessionId) {
        const existingSession = await getDoc(doc(db, 'gameSessions', payment.sessionId));
        if (existingSession.exists()) {
          const session = existingSession.data();
          if (session.status === 'ACTIVE') {
            return NextResponse.json({
              sessionId: payment.sessionId,
              token: session.token,
            });
          }
          // Session already completed/expired — this payment is consumed
          return NextResponse.json(
            { error: 'This payment has already been used for a completed game session' },
            { status: 400 }
          );
        }
      }
    }

    // 3. VERIFY TRANSACTION ON-CHAIN
    const connection = new Connection(RPC_URL, 'confirmed');
    const treasuryWallet = getTreasuryWallet();
    const rwdMint = getRwdMint();

    if (!treasuryWallet || !rwdMint) {
      console.error('[GAME/START] Treasury wallet or RWD mint not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const verificationResult = await verifyPaymentTransaction(
      connection,
      txSignature,
      walletAddress,
      treasuryWallet,
      rwdMint,
      GAME_FEE_AMOUNT
    );

    if (!verificationResult.valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${verificationResult.reason}` },
        { status: 400 }
      );
    }

    // 4. ATOMIC CLAIM — Firestore runTransaction prevents race conditions
    const sessionId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + SESSION_TTL_MS;
    const token = createSessionToken(sessionId, walletAddress, expiresAt);

    try {
      await runTransaction(db, async (transaction) => {
        // Re-check payment doesn't exist (race condition guard)
        const paymentRef = doc(db, 'gamePayments', txSignature);
        const paymentSnap = await transaction.get(paymentRef);

        if (paymentSnap.exists()) {
          throw new Error('PAYMENT_ALREADY_CLAIMED');
        }

        // Create payment record
        transaction.set(paymentRef, {
          txSignature,
          userAddress: walletAddress,
          network: getSolanaNetwork(),
          mint: rwdMint,
          amount: verificationResult.amount,
          amountUi: verificationResult.amountUi,
          treasury: treasuryWallet,
          status: 'VERIFIED',
          verifiedAt: serverTimestamp(),
          sessionId,
        });

        // Create game session record
        const sessionRef = doc(db, 'gameSessions', sessionId);
        transaction.set(sessionRef, {
          sessionId,
          userAddress: walletAddress,
          paymentTxSignature: txSignature,
          token,
          status: 'ACTIVE',
          createdAt: now,
          expiresAt,
        });
      });
    } catch (err: any) {
      if (err.message === 'PAYMENT_ALREADY_CLAIMED') {
        // Another request claimed it between our check and the transaction
        // Try to return the existing session (idempotent)
        const paymentSnap = await getDoc(doc(db, 'gamePayments', txSignature));
        if (paymentSnap.exists()) {
          const payment = paymentSnap.data();
          if (payment.userAddress === walletAddress && payment.sessionId) {
            const sessionSnap = await getDoc(doc(db, 'gameSessions', payment.sessionId));
            if (sessionSnap.exists() && sessionSnap.data().status === 'ACTIVE') {
              return NextResponse.json({
                sessionId: payment.sessionId,
                token: sessionSnap.data().token,
              });
            }
          }
        }
        return NextResponse.json(
          { error: 'Payment has already been claimed' },
          { status: 409 }
        );
      }
      throw err;
    }

    // 5. RETURN session credentials
    return NextResponse.json({ sessionId, token });

  } catch (error: any) {
    console.error('Error starting game session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}


// ---------------------------------------------------------------------------
// On-chain transaction verification
// ---------------------------------------------------------------------------

interface VerificationResult {
  valid: boolean;
  reason?: string;
  amount?: number;     // Raw amount (bigint as number)
  amountUi?: number;   // UI amount (token units)
}

/**
 * Deep verification of the payment transaction on Solana.
 *
 * Checks:
 * a) Transaction exists and is finalized
 * b) Transaction succeeded (no error)
 * c) Contains an SPL token transfer instruction
 * d) Source token account owner === walletAddress
 * e) Destination token account owner === treasuryWallet
 * f) Mint === RWD mint
 * g) Amount >= GAME_FEE_AMOUNT × 10^decimals
 */
async function verifyPaymentTransaction(
  connection: Connection,
  txSignature: string,
  expectedSender: string,
  expectedTreasury: string,
  expectedMint: string,
  expectedFeeTokens: number
): Promise<VerificationResult> {
  // Fetch the parsed transaction with finalized commitment
  let parsedTx: any;
  try {
    parsedTx = await connection.getParsedTransaction(txSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'finalized',
    });
  } catch (err: any) {
    return { valid: false, reason: 'Failed to fetch transaction from Solana' };
  }

  // (a) Transaction must exist
  if (!parsedTx) {
    return { valid: false, reason: 'Transaction not found. It may not be finalized yet. Please wait and try again.' };
  }

  // (b) Transaction must have succeeded
  if (parsedTx.meta?.err) {
    return { valid: false, reason: `Transaction failed on-chain: ${JSON.stringify(parsedTx.meta.err)}` };
  }

  // Fetch mint decimals from chain
  let decimals = 6;
  const mintPubKey = new PublicKey(expectedMint);
  try {
    const mintInfo = await getMint(connection, mintPubKey, 'confirmed', TOKEN_PROGRAM_ID);
    decimals = mintInfo.decimals;
  } catch {
    try {
      const mintInfo2022 = await getMint(connection, mintPubKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
      decimals = mintInfo2022.decimals;
    } catch {
      // Use default 6 decimals
    }
  }

  const requiredRawAmount = BigInt(Math.round(expectedFeeTokens * (10 ** decimals)));

  // (c-g) Find the matching SPL token transfer instruction
  const instructions = parsedTx.transaction?.message?.instructions || [];
  const innerInstructions = parsedTx.meta?.innerInstructions || [];

  // Collect all instructions (top-level + inner)
  const allInstructions: any[] = [...instructions];
  for (const inner of innerInstructions) {
    if (inner.instructions) {
      allInstructions.push(...inner.instructions);
    }
  }

  // Look for a parsed SPL transfer/transferChecked instruction
  let matchingTransfer: any = null;
  let matchCount = 0;

  for (const ix of allInstructions) {
    if (!ix.parsed) continue;

    const programId = ix.programId?.toString?.() || '';
    const isSplProgram =
      programId === TOKEN_PROGRAM_ID.toString() ||
      programId === TOKEN_2022_PROGRAM_ID.toString();

    if (!isSplProgram) continue;

    const { type, info } = ix.parsed;

    if (type === 'transfer' || type === 'transferChecked') {
      // For 'transfer', we need to look up the token accounts to verify mint and owners
      // For 'transferChecked', the mint is directly in the instruction
      const transferMint = info.mint;
      const authority = info.authority || info.multisigAuthority;
      const source = info.source;
      const destination = info.destination;

      let transferAmount: bigint;
      if (type === 'transferChecked') {
        transferAmount = BigInt(info.tokenAmount?.amount || '0');
      } else {
        transferAmount = BigInt(info.amount || '0');
      }

      // For 'transfer' type, we need to verify mint via pre/post token balances
      let verifiedMint: string | null = transferMint || null;

      if (!verifiedMint) {
        // Look up the mint from pre/post token balances
        const preTokenBalances = parsedTx.meta?.preTokenBalances || [];
        const postTokenBalances = parsedTx.meta?.postTokenBalances || [];
        const allBalances = [...preTokenBalances, ...postTokenBalances];

        for (const bal of allBalances) {
          const accountKeys = parsedTx.transaction?.message?.accountKeys || [];
          const accountKey = accountKeys[bal.accountIndex]?.pubkey?.toString?.() ||
                            accountKeys[bal.accountIndex]?.toString?.() || '';

          if (accountKey === source || accountKey === destination) {
            verifiedMint = bal.mint;
            break;
          }
        }
      }

      // Verify owner of source and destination using pre/post token balances
      let sourceOwner: string | null = authority; // authority is usually the owner
      let destOwner: string | null = null;

      const preTokenBalances = parsedTx.meta?.preTokenBalances || [];
      const postTokenBalances = parsedTx.meta?.postTokenBalances || [];
      const allBalances = [...preTokenBalances, ...postTokenBalances];

      for (const bal of allBalances) {
        const accountKeys = parsedTx.transaction?.message?.accountKeys || [];
        const accountKey = accountKeys[bal.accountIndex]?.pubkey?.toString?.() ||
                          accountKeys[bal.accountIndex]?.toString?.() || '';

        if (accountKey === source && bal.owner) {
          sourceOwner = bal.owner;
        }
        if (accountKey === destination && bal.owner) {
          destOwner = bal.owner;
        }
      }

      // Check all conditions:
      // (d) Source owner === expected sender
      const senderMatches = sourceOwner === expectedSender;
      // (e) Destination owner === expected treasury
      const treasuryMatches = destOwner === expectedTreasury;
      // (f) Mint matches
      const mintMatches = verifiedMint === expectedMint;
      // (g) Amount sufficient
      const amountSufficient = transferAmount >= requiredRawAmount;

      if (senderMatches && treasuryMatches && mintMatches && amountSufficient) {
        matchingTransfer = {
          amount: Number(transferAmount),
          amountUi: Number(transferAmount) / (10 ** decimals),
        };
        matchCount++;
      }
    }
  }

  if (matchCount === 0) {
    return {
      valid: false,
      reason: 'No matching RWD token transfer found in this transaction. Ensure you are transferring the correct token to the correct treasury wallet.',
    };
  }

  if (matchCount > 1) {
    // Multiple matching transfers is suspicious — accept but log
    console.warn(`[GAME/START] Multiple matching transfers found in tx ${txSignature}`);
  }

  return {
    valid: true,
    amount: matchingTransfer.amount,
    amountUi: matchingTransfer.amountUi,
  };
}
