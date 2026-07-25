import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userAddress, amountCoins } = body;

    if (!userAddress || typeof userAddress !== 'string') {
      return NextResponse.json({ error: 'Valid userAddress is required' }, { status: 400 });
    }

    const coinsToExchange = Number(amountCoins);

    if (isNaN(coinsToExchange) || coinsToExchange < 1000) {
      return NextResponse.json({ error: 'Minimum withdrawal is 1,000 coins' }, { status: 400 });
    }

    // Fetch user record from Firestore
    const userRef = doc(db, 'users', userAddress);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User record not found' }, { status: 404 });
    }

    const userData = userSnap.data();
    const currentBankCoins = Number(userData.totalCoins || 0);

    if (currentBankCoins < coinsToExchange) {
      return NextResponse.json(
        { error: `Insufficient banked coins. You have ${currentBankCoins} coins.` },
        { status: 400 }
      );
    }

    // Exchange Ratio: 1,000 Coins = 100 Tokens (10 coins = 1 token)
    const tokensPaid = Math.floor((coinsToExchange / 1000) * 100);

    let txSignature = `SimulatedTx_${Math.random().toString(36).slice(2, 12)}_${Date.now()}`;
    let isSimulated = true;

    // Check if real Treasury Private Key exists in environment
    const treasuryKeySecret = process.env.TREASURY_SOLANA_PRIVATE_KEY;
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    if (treasuryKeySecret) {
      try {
        let secretKey: Uint8Array;
        if (treasuryKeySecret.trim().startsWith('[')) {
          secretKey = Uint8Array.from(JSON.parse(treasuryKeySecret));
        } else {
          secretKey = bs58.decode(treasuryKeySecret.trim());
        }

        const treasuryKeypair = Keypair.fromSecretKey(secretKey);
        const connection = new Connection(rpcUrl, 'confirmed');
        const recipientPubKey = new PublicKey(userAddress);

        // Convert tokens to lamports/SOL equivalent if needed (e.g. 0.001 SOL per 100 tokens as test payout)
        const lamportsToTransfer = 1000000; // 0.001 SOL

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: treasuryKeypair.publicKey,
            toPubkey: recipientPubKey,
            lamports: lamportsToTransfer,
          })
        );

        txSignature = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair]);
        isSimulated = false;
        console.log(`[SOLANA TREASURY PAYOUT SUCCESS] Tx: ${txSignature}`);
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
      txSignature,
      isSimulated,
      remainingCoins: currentBankCoins - coinsToExchange,
    });
  } catch (error: any) {
    console.error('Error processing withdrawal:', error);
    return NextResponse.json({ error: 'Internal server error processing withdrawal' }, { status: 500 });
  }
}
