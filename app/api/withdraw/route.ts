import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, increment } from 'firebase/firestore';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} from '@solana/spl-token';

import { fetchRealTokenBalance, MIN_REAL_REQUIRED } from '@/lib/solana';

const TOKEN_MINT_ADDRESS = process.env.REAL_TOKEN_MINT_ADDRESS || process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS || 'BNyRLdnXZ2ZBhgR6AQiwrJrNCKh5WLGrhub5sPP4ZQmv';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userAddress, amountCoins } = body;

    if (!userAddress || typeof userAddress !== 'string') {
      return NextResponse.json({ error: 'Valid userAddress is required' }, { status: 400 });
    }

    // Verify $RWD token balance on-chain
    const rwdBalance = await fetchRealTokenBalance(userAddress);
    if (rwdBalance < MIN_REAL_REQUIRED) {
      return NextResponse.json(
        {
          error: `Access Denied: You must hold at least ${MIN_REAL_REQUIRED.toLocaleString()} $RWD tokens in your wallet to withdraw. Current holdings: ${rwdBalance.toLocaleString()} $RWD.`
        },
        { status: 403 }
      );
    }

    const coinsToExchange = Number(amountCoins);

    if (isNaN(coinsToExchange) || coinsToExchange < 1000) {
      return NextResponse.json({ error: 'Minimum withdrawal threshold is 1,000 coins' }, { status: 400 });
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
    let payoutAsset = '$RWD';
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

        // Detect token program & decimals
        let tokenProgramId = TOKEN_PROGRAM_ID;
        let decimals = 6;

        try {
          const mintInfo = await getMint(connection, mintPubKey, 'confirmed', TOKEN_PROGRAM_ID);
          decimals = mintInfo.decimals;
        } catch (e1) {
          try {
            const mintInfo2022 = await getMint(connection, mintPubKey, 'confirmed', TOKEN_2022_PROGRAM_ID);
            decimals = mintInfo2022.decimals;
            tokenProgramId = TOKEN_2022_PROGRAM_ID;
          } catch (e2) {
            console.warn('Using default SPL token program ID and 6 decimals.');
          }
        }

        // Get Associated Token Accounts
        const fromAta = await getAssociatedTokenAddress(mintPubKey, treasuryKeypair.publicKey, false, tokenProgramId);
        const toAta = await getAssociatedTokenAddress(mintPubKey, recipientPubKey, false, tokenProgramId);

        const treasuryBalance = await connection.getBalance(treasuryKeypair.publicKey);
        const toAtaInfo = await connection.getAccountInfo(toAta);

        const ataRentFee = 2039280; // Required SOL rent exemption for new SPL Token Account (~0.00204 SOL)
        if (!toAtaInfo && treasuryBalance < ataRentFee + 50000) {
          const currentSol = (treasuryBalance / 1e9).toFixed(4);
          const neededSol = ((ataRentFee + 50000) / 1e9).toFixed(4);
          return NextResponse.json(
            {
              error: `Treasury Wallet low SOL balance! Treasury has ${currentSol} SOL, but needs at least ${neededSol} SOL to create the recipient's $RWD Token Account. Please top up your Treasury Wallet with SOL!`
            },
            { status: 500 }
          );
        }

        const transaction = new Transaction();

        // Check if recipient ATA exists, if not add instruction to create it
        if (!toAtaInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              treasuryKeypair.publicKey, // Payer
              toAta, // Associated Token Account Address
              recipientPubKey, // Account Owner
              mintPubKey, // Token Mint
              tokenProgramId
            )
          );
        }

        // Add SPL Token Transfer Instruction
        const rawAmount = BigInt(Math.round(tokensPaid * (10 ** decimals)));
        transaction.add(
          createTransferInstruction(
            fromAta,
            toAta,
            treasuryKeypair.publicKey,
            rawAmount,
            [],
            tokenProgramId
          )
        );

        txSignature = await sendAndConfirmTransaction(connection, transaction, [treasuryKeypair]);
        isSimulated = false;
        payoutAsset = '$RWD';
        payoutAmount = tokensPaid;
        console.log(`[SOLANA TREASURY $RWD PAYOUT SUCCESS] Tx: ${txSignature}`);
      } catch (err: any) {
        console.error('Solana $RWD token transfer failed:', err?.message || err);
        return NextResponse.json(
          { error: `Treasury $RWD token payout error: ${err?.message || 'Transaction failed. Check treasury SOL and $RWD token balances.'}` },
          { status: 500 }
        );
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
