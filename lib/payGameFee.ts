/**
 * Client-side utility to build and send the 10 RWD token payment
 * transaction before starting a game.
 *
 * The player's connected wallet (Phantom/Solflare) signs and sends
 * the SPL token transfer. Returns the transaction signature for
 * server-side verification.
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

/** Determine the treasury wallet for the current network. */
function getTreasuryWallet(): string {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  if (network === 'mainnet' || network === 'mainnet-beta') {
    return process.env.NEXT_PUBLIC_GAME_FEE_WALLET_MAINNET || '';
  }
  return process.env.NEXT_PUBLIC_GAME_FEE_WALLET_DEVNET || '';
}

/** Get the game fee amount in token units. */
function getGameFeeAmount(): number {
  return Number(process.env.NEXT_PUBLIC_GAME_FEE_AMOUNT || 10);
}

/** Get the RWD token mint address. */
function getRwdMint(): string {
  return (
    process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS ||
    process.env.NEXT_PUBLIC_RWD_TOKEN_ADDRESS ||
    ''
  );
}

/** Get the Solana RPC URL. */
function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

/**
 * Get the Solana wallet provider from the browser.
 * Supports Phantom and Solflare.
 */
function getWalletProvider(): any {
  if (typeof window === 'undefined') return null;
  return (
    (window as any).solana ||
    (window as any).phantom?.solana ||
    (window as any).solflare ||
    null
  );
}

export interface PayGameFeeResult {
  txSignature: string;
}

/**
 * Build and send a 10 RWD token transfer from the player to the treasury wallet.
 *
 * @param playerAddress The player's wallet public key string.
 * @returns The transaction signature.
 * @throws If the wallet rejects, the transaction fails, or config is missing.
 */
export async function payGameFee(playerAddress: string): Promise<PayGameFeeResult> {
  const treasuryAddress = getTreasuryWallet();
  if (!treasuryAddress) {
    throw new Error('Treasury wallet not configured. Check environment variables.');
  }

  const rwdMintAddress = getRwdMint();
  if (!rwdMintAddress) {
    throw new Error('RWD token mint address not configured.');
  }

  const feeAmount = getGameFeeAmount();
  if (feeAmount <= 0) {
    throw new Error('Invalid game fee amount.');
  }

  const provider = getWalletProvider();
  if (!provider) {
    throw new Error('No Solana wallet found. Please install Phantom or Solflare.');
  }

  const connection = new Connection(getRpcUrl(), 'confirmed');
  const playerPubKey = new PublicKey(playerAddress);
  const treasuryPubKey = new PublicKey(treasuryAddress);
  const mintPubKey = new PublicKey(rwdMintAddress);

  // Detect token program & decimals
  let tokenProgramId = TOKEN_PROGRAM_ID;
  let decimals = 6;

  try {
    const mintInfo = await getMint(connection, mintPubKey, 'confirmed', TOKEN_PROGRAM_ID);
    decimals = mintInfo.decimals;
  } catch {
    try {
      const mintInfo2022 = await getMint(connection, mintPubKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
      decimals = mintInfo2022.decimals;
      tokenProgramId = TOKEN_2022_PROGRAM_ID;
    } catch {
      console.warn('Could not detect token program. Using TOKEN_PROGRAM_ID with 6 decimals.');
    }
  }

  // Derive Associated Token Accounts
  const sourceAta = await getAssociatedTokenAddress(mintPubKey, playerPubKey, false, tokenProgramId);
  const destAta = await getAssociatedTokenAddress(mintPubKey, treasuryPubKey, false, tokenProgramId);

  const transaction = new Transaction();

  // Check if the treasury's ATA exists; if not, the player creates it (pays rent)
  const destAtaInfo = await connection.getAccountInfo(destAta);
  if (!destAtaInfo) {
    transaction.add(
      createAssociatedTokenAccountInstruction(
        playerPubKey,    // Payer
        destAta,         // ATA to create
        treasuryPubKey,  // Owner of the new ATA
        mintPubKey,      // Mint
        tokenProgramId
      )
    );
  }

  // SPL Token Transfer: player → treasury
  const rawAmount = BigInt(Math.round(feeAmount * (10 ** decimals)));
  transaction.add(
    createTransferInstruction(
      sourceAta,       // Source ATA
      destAta,         // Destination ATA
      playerPubKey,    // Owner/authority of source
      rawAmount,       // Amount in raw units
      [],              // No multisig signers
      tokenProgramId
    )
  );

  // Set recent blockhash and fee payer
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = playerPubKey;

  // Request wallet to sign and send
  let txSignature: string;
  if (provider.signAndSendTransaction) {
    // Phantom-style
    const result = await provider.signAndSendTransaction(transaction);
    txSignature = typeof result === 'string' ? result : (result.signature ?? String(result));
  } else if (provider.signTransaction) {
    // Fallback: sign then send manually
    const signed = await provider.signTransaction(transaction);
    txSignature = await connection.sendRawTransaction(signed.serialize());
  } else {
    throw new Error('Wallet does not support transaction signing.');
  }

  return { txSignature };
}
