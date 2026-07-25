import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import { getOrCreateAssociatedTokenAccount, transfer as transferSPL } from '@solana/spl-token';

const TOKEN_MINT_ADDRESS = process.env.REAL_TOKEN_MINT_ADDRESS || process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS || 'BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userAddress, amountCoins } = body;

    if (!userAddress || typeof userAddress !== 'string') {
      return NextResponse.json({ error: 'Valid userAddress is required' }, { status: 400 });
    }

    const coinsToExchange = Number(amountCoins);

    if (isNaN(coinsToExchange) || coinsToExchange <= 0) {
      return NextResponse.json({ error: 'Please enter a valid amount of coins to withdraw' }, { status: 400 });
    }

    // Fetch user record from Firestore
    const userRef = doc(db, 'users', userAddress);
    let userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        address: userAddress,
        totalCoins: 0,
        createdAt: serverTimestamp(),
      });
      userSnap = await getDoc(userRef);
    }

    const userData = userSnap.data();
    const currentBankCoins = Number(userData?.totalCoins || 0);

    if (currentBankCoins < coinsToExchange) {
      return NextResponse.json(
        { error: `Insufficient banked coins. You currently have ${currentBankCoins} coins in your bank.` },
        { status: 400 }
      );
    }

    // Exchange Ratio: 10 Coins = 1 Token
    const tokensPaid = Number((coinsToExchange / 10).toFixed(4));

    let txSignature = `SimulatedTx_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
    let isSimulated = true;
    let payoutAsset = '$REAL';
    let payoutAmount = tokensPaid;

    // Check if real Treasury Private Key exists in environment
    const treasuryKeySecret = process.env.TREASURY_SOLANA_PRIVATE_KEY;
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    if (treasuryKeySecret && treasuryKeySecret.trim().length > 0) {
      try {
        let secretKey: Uint8Array;
        if (treasuryKeySecret.trim().startsWith('[')) {
          secretKey = Uint8Array.from(JSON.parse(treasuryKeySecret.trim()));
        } else {
          secretKey = bs58.decode(treasuryKeySecret.trim());
        }

        const treasuryKeypair = Keypair.fromSecretKey(secretKey);
        const connection = new Connection(rpcUrl, 'confirmed');
        const recipientPubKey = new PublicKey(userAddress);
        const mintPubKey = new PublicKey(TOKEN_MINT_ADDRESS);

        try {
          // Attempt SPL token transfer
          const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            treasuryKeypair,
            mintPubKey,
            treasuryKeypair.publicKey
          );

          const toTokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            treasuryKeypair,
            mintPubKey,
            recipientPubKey,
            false,
            'confirmed'
          );

          // Assuming standard 6 decimals or raw amount calculation
          const amountInRaw = Math.round(tokensPaid * (10 ** 6));

          txSignature = await transferSPL(
            connection,
            treasuryKeypair,
            fromTokenAccount.address,
            toTokenAccount.address,
            treasuryKeypair,
            amountInRaw
          );
          isSimulated = false;
          payoutAsset = '$REAL';
          payoutAmount = tokensPaid;
          console.log(`[SOLANA TREASURY SPL PAYOUT SUCCESS] Tx: ${txSignature}`);
        } catch (tokenErr: any) {
          console.warn('SPL token transfer failed, attempting native SOL fallback payout:', tokenErr?.message || tokenErr);
          
          // Rent-exemption minimum on Solana (approx 890,880 lamports ~ 0.00089 SOL)
          const rentExemptMin = await connection.getMinimumBalanceForRentExemption(0);
          const recipientAccount = await connection.getAccountInfo(recipientPubKey);
          const recipientBalance = recipientAccount ? recipientAccount.lamports : 0;

          let lamportsToTransfer = Math.round(tokensPaid * 100000); // Base 0.0001 SOL per token
          if (recipientBalance + lamportsToTransfer < rentExemptMin) {
            lamportsToTransfer = Math.max(lamportsToTransfer, rentExemptMin - recipientBalance + 5000);
          }

          const transaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: treasuryKeypair.publicKey,
              toPubkey: recipientPubKey,
              lamports: lamportsToTransfer,
            })
          );

          txSignature = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair]);
          isSimulated = false;
          payoutAsset = 'SOL';
          payoutAmount = Number((lamportsToTransfer / 1e9).toFixed(6));
          console.log(`[SOLANA TREASURY SOL PAYOUT SUCCESS] Tx: ${txSignature}, Amount: ${payoutAmount} SOL`);
        }
      } catch (err: any) {
        console.warn('Real Solana payout transaction failed, falling back to simulated verification tx:', err?.message || err);
      }
    }

    // Atomically deduct coins from user's bank in Firestore
    await updateDoc(userRef, {
      totalCoins: increment(-coinsToExchange),
      totalWithdrawnCoins: increment(coinsToExchange),
      totalWithdrawnTokens: increment(tokensPaid),
      updatedAt: serverTimestamp(),
    });

    // Record withdrawal entry in Firestore `withdrawals` table
    const withdrawDoc = await addDoc(collection(db, 'withdrawals'), {
      userAddress,
      coinsAmount: coinsToExchange,
      tokensAmount: tokensPaid,
      payoutAmount,
      payoutAsset,
      txSignature,
      isSimulated,
      status: 'COMPLETED',
      createdAt: serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      withdrawalId: withdrawDoc.id,
      coinsExchanged: coinsToExchange,
      tokensPaid,
      payoutAmount,
      payoutAsset,
      txSignature,
      isSimulated,
      remainingCoins: currentBankCoins - coinsToExchange,
    });
  } catch (error: any) {
    console.error('Error processing withdrawal:', error);
    return NextResponse.json({ error: 'Internal server error processing withdrawal' }, { status: 500 });
  }
}
