import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Connection, PublicKey } from '@solana/web3.js';
import { getMint, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import crypto from 'crypto';

import {
  getAuthenticatedWallet,
  createSessionToken,
  getTreasuryWallet,
  getSolanaNetwork,
  getRwdMint,
  SESSION_TTL_MS,
} from '@/lib/auth';
import { getGameSettings } from '@/lib/gameSettings';

const isMainnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta';
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || (isMainnet ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');

/**
 * POST /api/game/start
 *
 * Requires:
 * - Auth cookie (wallet ownership proof)
 * - Body: { txSignature }
 *
 * Flow:
 * 1. Authenticate wallet from cookie
 * 2. Idempotency check (same txSignature → return existing session if wallet matches)
 * 3. Verify the transaction on-chain (finalized, correct mint/source/dest/amount)
 * 4. Atomically claim the payment and create session in Firestore
 * 5. Return session credentials (token is computed, not stored)
 */
export async function POST(request: Request) {
  try {
    // 1. AUTHENTICATE — wallet address comes from signed auth cookie
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

    // 2. IDEMPOTENCY CHECK
    const existingPayment = await getDoc(doc(db, 'gamePayments', txSignature));
    if (existingPayment.exists()) {
      const payment = existingPayment.data();

      // Different wallet trying to use this tx → reject
      if (payment.userAddress !== walletAddress) {
        return NextResponse.json(
          { error: 'This transaction belongs to a different wallet' },
          { status: 403 }
        );
      }

      // Payment has a session — check its state
      if (payment.sessionId) {
        const existingSession = await getDoc(doc(db, 'gameSessions', payment.sessionId));
        if (existingSession.exists()) {
          const session = existingSession.data();

          if (session.status === 'ACTIVE') {
            // Idempotent retry: return existing active session
            // Reconstruct the token (not stored in Firestore)
            const token = createSessionToken(payment.sessionId, walletAddress, session.expiresAt);
            return NextResponse.json({
              sessionId: payment.sessionId,
              token,
            });
          }

          // Session already completed/expired/flagged — payment is consumed
          return NextResponse.json(
            { error: 'PAYMENT_ALREADY_CONSUMED', details: `This payment was already used for a ${session.status} game session.` },
            { status: 400 }
          );
        }

        // Session ID exists on payment but session doc is missing — integrity error
        console.error(`[GAME/START] Payment ${txSignature} references missing session ${payment.sessionId}`);
        return NextResponse.json(
          { error: 'Session integrity error. Please contact support.' },
          { status: 500 }
        );
      }
    }

    // 3. LOAD DYNAMIC SETTINGS & VERIFY TRANSACTION ON-CHAIN
    const gameSettings = await getGameSettings();
    const connection = new Connection(RPC_URL, 'confirmed');
    const treasuryWallet = getTreasuryWallet();
    const rwdMint = getRwdMint();

    if (!treasuryWallet || !rwdMint) {
      console.error('[GAME/START] Treasury wallet or RWD mint not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Dynamic Minimum RWD Holding Check
    if (gameSettings.minRwdRequired > 0) {
      const { fetchRwdTokenBalance } = await import('@/lib/solana');
      const rwdBalance = await fetchRwdTokenBalance(walletAddress, connection);
      if (rwdBalance < gameSettings.minRwdRequired) {
        return NextResponse.json(
          {
            error: `Access Denied: Wallet must hold at least ${gameSettings.minRwdRequired.toLocaleString()} $RWD tokens to play. Current holdings: ${rwdBalance.toLocaleString()} $RWD.`
          },
          { status: 403 }
        );
      }
    }

    const verificationResult = await verifyPaymentTransaction(
      connection,
      txSignature,
      walletAddress,
      treasuryWallet,
      rwdMint,
      gameSettings.gameFeeAmount
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

        // Create game session record (token is NOT stored — reconstructed from HMAC)
        const sessionRef = doc(db, 'gameSessions', sessionId);
        transaction.set(sessionRef, {
          sessionId,
          userAddress: walletAddress,
          paymentTxSignature: txSignature,
          status: 'ACTIVE',
          createdAt: now,
          expiresAt,
        });
      });
    } catch (err: any) {
      if (err.message === 'PAYMENT_ALREADY_CLAIMED') {
        // Another request claimed it between our check and the transaction.
        // Try to return the existing session (idempotent) only if wallet matches.
        const paymentSnap = await getDoc(doc(db, 'gamePayments', txSignature));
        if (paymentSnap.exists()) {
          const payment = paymentSnap.data();
          if (payment.userAddress === walletAddress && payment.sessionId) {
            const sessionSnap = await getDoc(doc(db, 'gameSessions', payment.sessionId));
            if (sessionSnap.exists() && sessionSnap.data().status === 'ACTIVE') {
              const token = createSessionToken(payment.sessionId, walletAddress, sessionSnap.data().expiresAt);
              return NextResponse.json({
                sessionId: payment.sessionId,
                token,
              });
            }
          }
        }
        return NextResponse.json(
          { error: 'PAYMENT_ALREADY_CONSUMED', details: 'Payment has already been claimed.' },
          { status: 409 }
        );
      }
      throw err;
    }

    // 5. RETURN session credentials (token computed fresh, not stored)
    const token = createSessionToken(sessionId, walletAddress, expiresAt);
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
  amount?: number;
  amountUi?: number;
}

/**
 * Deep verification of the payment transaction on Solana.
 *
 * Finds the ONE unambiguous qualifying RWD transfer that matches:
 * - Source owner === authenticated walletAddress
 * - Destination owner === server's treasury wallet
 * - Mint === server's RWD mint (CA)
 * - Amount >= GAME_FEE_AMOUNT × 10^decimals
 *
 * Does NOT reject transactions with additional harmless instructions
 * (e.g. CreateAssociatedTokenAccount). Only rejects if there are
 * multiple ambiguous qualifying transfers.
 */
async function verifyPaymentTransaction(
  connection: Connection,
  txSignature: string,
  expectedSender: string,
  expectedTreasury: string,
  expectedMint: string,
  expectedFeeTokens: number
): Promise<VerificationResult> {
  // Fetch the parsed transaction with 'confirmed' commitment and retry polling
  let parsedTx: any = null;
  const maxAttempts = 8;
  const delayMs = 1200;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      parsedTx = await connection.getParsedTransaction(txSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
      if (parsedTx) break;
    } catch {
      // Ignore and retry
    }
    if (attempt < maxAttempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Transaction must exist
  if (!parsedTx) {
    return { valid: false, reason: 'Transaction not found on Solana cluster. It may take a few seconds to confirm. Please try again.' };
  }

  // Transaction must have succeeded
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

  // Collect all instructions (top-level + inner)
  const instructions = parsedTx.transaction?.message?.instructions || [];
  const innerInstructions = parsedTx.meta?.innerInstructions || [];
  const allInstructions: any[] = [...instructions];
  for (const inner of innerInstructions) {
    if (inner.instructions) {
      allInstructions.push(...inner.instructions);
    }
  }

  // Pre-build a lookup from account index → token balance info
  const preTokenBalances = parsedTx.meta?.preTokenBalances || [];
  const postTokenBalances = parsedTx.meta?.postTokenBalances || [];
  const allBalances = [...preTokenBalances, ...postTokenBalances];
  const accountKeys = parsedTx.transaction?.message?.accountKeys || [];

  // Map: token account pubkey → { owner, mint }
  const tokenAccountInfo = new Map<string, { owner: string; mint: string }>();
  for (const bal of allBalances) {
    const accountKey = accountKeys[bal.accountIndex]?.pubkey?.toString?.() ||
                       accountKeys[bal.accountIndex]?.toString?.() || '';
    if (accountKey && bal.owner && bal.mint) {
      tokenAccountInfo.set(accountKey, { owner: bal.owner, mint: bal.mint });
    }
  }

  // Find qualifying transfer instructions
  const qualifyingTransfers: { amount: number; amountUi: number }[] = [];

  for (const ix of allInstructions) {
    if (!ix.parsed) continue;

    const programId = ix.programId?.toString?.() || '';
    const isSplProgram =
      programId === TOKEN_PROGRAM_ID.toString() ||
      programId === TOKEN_2022_PROGRAM_ID.toString();
    if (!isSplProgram) continue;

    const { type, info } = ix.parsed;
    if (type !== 'transfer' && type !== 'transferChecked') continue;

    const authority = info.authority || info.multisigAuthority;
    const source = info.source;
    const destination = info.destination;

    let transferAmount: bigint;
    let transferMint: string | null = null;

    if (type === 'transferChecked') {
      // TransferChecked embeds the mint and amount directly
      transferAmount = BigInt(info.tokenAmount?.amount || '0');
      transferMint = info.mint || null;
    } else {
      // Plain transfer — amount only, need to look up mint from balances
      transferAmount = BigInt(info.amount || '0');
    }

    // Resolve source and destination info
    const sourceInfo = tokenAccountInfo.get(source);
    const destInfo = tokenAccountInfo.get(destination);

    // Determine source owner: authority is the signer, but sourceInfo.owner is more reliable
    const sourceOwner = sourceInfo?.owner || authority;
    const destOwner = destInfo?.owner || null;

    // Determine mint: prefer instruction-level (transferChecked), fall back to balance lookup
    const resolvedMint = transferMint || sourceInfo?.mint || destInfo?.mint || null;

    // Check all qualifying conditions:
    const senderMatches = sourceOwner === expectedSender;
    const treasuryMatches = destOwner === expectedTreasury;
    const mintMatches = resolvedMint === expectedMint;
    const amountSufficient = transferAmount >= requiredRawAmount;

    if (senderMatches && treasuryMatches && mintMatches && amountSufficient) {
      qualifyingTransfers.push({
        amount: Number(transferAmount),
        amountUi: Number(transferAmount) / (10 ** decimals),
      });
    }
  }

  if (qualifyingTransfers.length === 0) {
    return {
      valid: false,
      reason: 'No matching RWD token transfer found in this transaction. Ensure you transferred the correct token to the correct treasury wallet.',
    };
  }

  if (qualifyingTransfers.length > 1) {
    // Multiple qualifying transfers to the same treasury with the same mint is ambiguous
    return {
      valid: false,
      reason: `Ambiguous transaction: found ${qualifyingTransfers.length} qualifying transfers. Please submit a transaction with exactly one payment.`,
    };
  }

  return {
    valid: true,
    amount: qualifyingTransfers[0].amount,
    amountUi: qualifyingTransfers[0].amountUi,
  };
}
