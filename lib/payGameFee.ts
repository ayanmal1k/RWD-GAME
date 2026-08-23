/**
 * Client-side utility to build and send the 10 RWD token payment
 * transaction before starting a game.
 *
 * Uses TransferChecked (includes mint + decimals in the instruction)
 * for stronger server-side verification.
 */

import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';

/** Get the single treasury wallet that receives game fees. */
function getTreasuryWallet(): string {
  return process.env.NEXT_PUBLIC_GAME_FEE_WALLET || '';
}

/** Get the RWD token mint for the current network. */
function getRwdMint(): string {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
  if (network === 'mainnet' || network === 'mainnet-beta') {
    return process.env.NEXT_PUBLIC_RWD_MINT_MAINNET || '';
  }
  return process.env.NEXT_PUBLIC_RWD_MINT_DEVNET || '';
}

/** Get the game fee amount in token units. */
function getGameFeeAmount(): number {
  return Number(process.env.NEXT_PUBLIC_GAME_FEE_AMOUNT || 10);
}

/** Get the Solana RPC URL. */
function getRpcUrl(): string {
  const isMainnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet' || process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta';
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || (isMainnet ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
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
 * Uses TransferChecked which embeds the mint and decimals in the instruction.
 *
 * @param playerAddress The player's wallet public key string.
 * @returns The transaction signature.
 * @throws If the wallet rejects, the transaction fails, or config is missing.
 */
export async function payGameFee(playerAddress: string, customFeeAmount?: number): Promise<PayGameFeeResult> {
  const treasuryAddress = getTreasuryWallet();
  if (!treasuryAddress) {
    throw new Error('Treasury wallet not configured. Check environment variables.');
  }

  const rwdMintAddress = getRwdMint();
  if (!rwdMintAddress) {
    throw new Error('RWD token mint address not configured for current network.');
  }

  const feeAmount = typeof customFeeAmount === 'number' && customFeeAmount >= 0 ? customFeeAmount : getGameFeeAmount();
  if (feeAmount <= 0) {
    // 0 fee means free to play — no on-chain transaction needed
    return { txSignature: 'FREE_PLAY' };
  }

  const provider = getWalletProvider();
  if (!provider) {
    throw new Error('No Solana wallet found. Please install Phantom or Solflare.');
  }

  const connection = new Connection(getRpcUrl(), 'confirmed');
  const playerPubKey = new PublicKey(playerAddress);
  const treasuryPubKey = new PublicKey(treasuryAddress);
  const mintPubKey = new PublicKey(rwdMintAddress);

  // Detect token program & decimals from chain
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

  // SPL Token TransferChecked: player → treasury
  // TransferChecked includes the mint and decimals in the instruction itself,
  // which makes server-side verification stronger and more explicit.
  const rawAmount = BigInt(Math.round(feeAmount * (10 ** decimals)));
  transaction.add(
    createTransferCheckedInstruction(
      sourceAta,       // Source ATA
      mintPubKey,      // Mint (embedded in instruction)
      destAta,         // Destination ATA
      playerPubKey,    // Owner/authority of source
      rawAmount,       // Amount in raw units
      decimals,        // Decimals (embedded in instruction)
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

  // Wait for the transaction to be confirmed on Solana
  try {
    const confirmation = await connection.confirmTransaction(
      { signature: txSignature, blockhash, lastValidBlockHeight },
      'confirmed'
    );
    if (confirmation.value.err) {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }
  } catch (err: any) {
    // Even if confirmTransaction times out, return signature so server can verify
    console.warn('confirmTransaction notice:', err?.message || err);
  }

  return { txSignature };
}
