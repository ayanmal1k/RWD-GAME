'use client';

import React, { useState, useEffect } from 'react';
import { useAppWallet } from '@/components/DynamicProvider';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import {
  Coins,
  ArrowRightLeft,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Wallet,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CoinIcon } from '@/components/CoinIcon';

interface WithdrawalRecord {
  id: string;
  coinsAmount: number;
  tokensAmount: number;
  payoutAmount?: number;
  payoutAsset?: string;
  txSignature: string;
  isSimulated?: boolean;
  status: string;
  createdAt?: any;
}

export default function WithdrawPage() {
  const { primaryWallet, setShowAuthFlow, realBalance, isCheckingBalance, isEligible } = useAppWallet();
  const address = primaryWallet?.address;

  const [bankCoins, setBankCoins] = useState<number>(0);
  const [exchangeCoins, setExchangeCoins] = useState<string>('1000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<any | null>(null);

  const [history, setHistory] = useState<WithdrawalRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Calculate estimated tokens (10 coins = 1 token)
  const coinsNum = Number(exchangeCoins) || 0;
  const estimatedTokens = coinsNum > 0 ? (coinsNum / 10) : 0;

  // Subscribe to user bank balance
  useEffect(() => {
    if (!address) {
      setBankCoins(0);
      return;
    }

    const userRef = doc(db, 'users', address);
    const unsubscribe = onSnapshot(
      userRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setBankCoins(snapshot.data().totalCoins || 0);
        }
      },
      (err) => console.warn('User bank listener warning:', err)
    );

    return () => unsubscribe();
  }, [address]);

  // Fetch personal withdrawal history
  const fetchPersonalHistory = async () => {
    if (!address) return;
    setIsLoadingHistory(true);
    try {
      const q = query(
        collection(db, 'withdrawals'),
        where('userAddress', '==', address)
      );
      const snapshot = await getDocs(q);

      const records: WithdrawalRecord[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WithdrawalRecord[];

      // Sort in-memory by createdAt descending
      records.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return tB - tA;
      });

      setHistory(records);
    } catch (err) {
      console.error('Failed to fetch personal withdrawal history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchPersonalHistory();
  }, [address]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setTxSuccess(null);

    if (!address) {
      setShowAuthFlow(true);
      return;
    }

    if (!isEligible) {
      setErrorMsg('Withdrawal locked! You must hold at least 1,000,000 $REAL tokens in your wallet to withdraw.');
      return;
    }

    if (coinsNum < 1000) {
      setErrorMsg('Minimum withdrawal threshold is 1,000 coins.');
      return;
    }

    if (coinsNum > bankCoins) {
      setErrorMsg(`Insufficient coins! Your current balance is ${bankCoins} coins.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: address,
          amountCoins: coinsNum,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Withdrawal failed');
      }

      setTxSuccess(data);
      fetchPersonalHistory();
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during withdrawal.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0802] text-[#fef08a] antialiased py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* Page Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-mono font-bold tracking-widest uppercase">
            <Sparkles className="w-3.5 h-3.5" /> Solana Token Treasury
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-press-start text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            TREASURY EXCHANGE
          </h1>
          <p className="text-xs sm:text-sm font-mono text-amber-200/70 max-w-xl mx-auto">
            Convert your hard-earned climbing coins into $REAL tokens. Paid directly from our Solana treasury wallet.
          </p>

          {/* $REAL Token Address & Minimum Limit Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#171206] border border-yellow-500/30 rounded-xl text-xs font-mono text-amber-300">
                <span className="text-[10px] text-amber-400 font-bold uppercase">$REAL MINT:</span>
                <span className="font-bold text-yellow-300 select-all font-mono">
                  {process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS}
                </span>
                <a 
                  href={`https://solscan.io/token/${process.env.NEXT_PUBLIC_REAL_TOKEN_ADDRESS}`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-amber-400 hover:text-yellow-200 ml-1 inline-flex items-center"
                  title="View on Solscan"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#171206] border border-yellow-500/30 rounded-xl text-xs font-mono text-amber-300">
              <ShieldCheck className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[10px] text-amber-400 font-bold uppercase">MIN WITHDRAWAL:</span>
              <span className="font-bold text-yellow-300 font-mono">1,000 COINS (= 100 $REAL)</span>
            </div>
          </div>
        </div>

        {/* Live Balance Card */}
        <div className="bg-gradient-to-r from-[#171206] via-[#261e0b] to-[#171206] border-2 border-yellow-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_35px_rgba(234,179,8,0.2)] flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-1 text-center sm:text-left z-10">
            <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
              YOUR BANK BALANCE
            </span>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <CoinIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] animate-pulse" />
              <span className="text-3xl sm:text-4xl font-extrabold font-press-start text-yellow-300">
                {bankCoins.toLocaleString()} <span className="text-sm font-mono text-amber-400">COINS</span>
              </span>
            </div>
          </div>

          <div className="z-10 w-full sm:w-auto">
            {!address ? (
              <button
                onClick={() => setShowAuthFlow(true)}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold font-press-start text-xs rounded-xl shadow-lg hover:scale-105 transition-all flex items-center justify-center gap-2"
              >
                <Wallet className="w-4 h-4" /> CONNECT WALLET TO EXCHANGER
              </button>
            ) : (
              <div className="px-5 py-2.5 bg-black/40 border border-yellow-500/30 rounded-2xl text-center">
                <span className="text-[10px] font-mono text-amber-400/80 block">CONNECTED WALLET</span>
                <span className="text-xs font-mono font-bold text-yellow-200">
                  {address.slice(0, 6)}...{address.slice(-6)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Exchange Form Section */}
        <div className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-yellow-500/15">
            <h2 className="text-sm font-bold font-press-start text-amber-300 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-yellow-400" /> CONVERT COINS TO $REAL TOKENS
            </h2>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-[11px] font-mono text-yellow-300">
              <span>MIN LIMIT:</span>
              <span className="font-bold text-amber-400">1,000 COINS</span>
            </div>
          </div>

          {/* $REAL Token Gate Requirement Notice */}
          {address && (
            <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between gap-3 ${
              isCheckingBalance
                ? 'bg-yellow-500/10 border-yellow-500/30 text-amber-300 animate-pulse'
                : isEligible
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-red-500/15 border-red-500/40 text-red-300'
            }`}>
              <div className="flex items-center gap-3">
                <img src="/logo.jpeg" alt="$REAL" className="w-8 h-8 rounded-full border border-amber-400/40 object-cover shrink-0" />
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-amber-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    $REAL TOKEN HOLDINGS REQUIREMENT
                  </span>
                  <span className="text-white text-xs">
                    Current Balance: <strong className="text-yellow-300">{isCheckingBalance ? 'Fetching SPL Token Balance...' : `${(realBalance ?? 0).toLocaleString()} $REAL`}</strong> (Min Required: 1,000,000 $REAL)
                  </span>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-xl text-[10px] font-bold uppercase shrink-0 font-mono ${
                isEligible ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-400/40' : 'bg-red-500/30 text-red-200 border border-red-400/40'
              }`}>
                {isCheckingBalance ? 'VERIFYING' : isEligible ? 'WITHDRAWAL UNLOCKED' : 'WITHDRAWAL LOCKED'}
              </span>
            </div>
          )}

          <form onSubmit={handleWithdraw} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Input Coins */}
              <div className="bg-[#0a0802] border border-yellow-500/20 rounded-2xl p-4 space-y-2">
                <label className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CoinIcon className="w-4 h-4" /> COINS TO WITHDRAW (MIN: 1,000)
                </label>
                <div className="flex items-center gap-2">
                  <CoinIcon className="w-6 h-6" />
                  <input
                    type="number"
                    min="1000"
                    step="100"
                    value={exchangeCoins}
                    onChange={(e) => setExchangeCoins(e.target.value)}
                    className="w-full bg-transparent font-mono text-xl font-bold text-yellow-200 focus:outline-none placeholder-yellow-500/30"
                    placeholder="1000"
                  />
                </div>
              </div>

              {/* Estimated Token Output */}
              <div className="bg-[#171206] border border-yellow-500/30 rounded-2xl p-4 space-y-2">
                <label className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <img src="/logo.jpeg" alt="$REAL" className="w-4 h-4 rounded-full object-cover border border-yellow-400/50" /> ESTIMATED $REAL TOKENS (10 COINS = 1 TOKEN)
                </label>
                <div className="flex items-center gap-2">
                  <img src="/logo.jpeg" alt="$REAL" className="w-6 h-6 rounded-full object-cover border border-yellow-400/50" />
                  <span className="font-mono text-xl font-extrabold text-yellow-300 flex items-center gap-1.5">
                    {estimatedTokens.toLocaleString()} <span className="text-xs text-amber-400">$REAL</span>
                  </span>
                </div>
              </div>

            </div>

            {/* Error Message */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-4 bg-red-500/10 border border-red-500/40 rounded-2xl flex items-center gap-3 text-red-400 text-xs font-mono"
                >
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span>{errorMsg}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Success Message */}
            <AnimatePresence>
              {txSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-5 bg-yellow-500/10 border border-yellow-500/40 rounded-2xl space-y-2 text-xs font-mono text-yellow-300"
                >
                  <div className="flex items-center gap-2 text-yellow-400 font-bold font-press-start text-[11px]">
                    <CheckCircle2 className="w-4 h-4 text-yellow-400" /> WITHDRAWAL SUCCESSFUL!
                  </div>
                  <p>
                    Exchanged <span className="font-bold text-yellow-300">{txSuccess.coinsExchanged}</span> coins for{' '}
                    <span className="font-bold text-yellow-300">
                      {txSuccess.payoutAmount ?? txSuccess.tokensPaid} {txSuccess.payoutAsset || '$REAL'}
                    </span>.
                  </p>
                  <div className="pt-1 flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                    <span>Transaction Signature:</span>
                    <a
                      href={`https://explorer.solana.com/tx/${txSuccess.txSignature}?cluster=mainnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline flex items-center gap-1 text-yellow-200 hover:text-white font-bold"
                    >
                      {txSuccess.txSignature.slice(0, 12)}... <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || coinsNum < 1000 || coinsNum > bankCoins || !address || !isEligible || isCheckingBalance}
              className={`w-full py-4 font-bold font-press-start text-xs sm:text-sm rounded-2xl border-2 transition-all flex items-center justify-center gap-2 ${
                !address
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-[#0a0802] border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:shadow-[0_0_35px_rgba(234,179,8,0.7)] cursor-pointer'
                  : isCheckingBalance
                  ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 cursor-wait animate-pulse'
                  : isEligible
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-[#0a0802] border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:shadow-[0_0_35px_rgba(234,179,8,0.7)] cursor-pointer'
                  : 'bg-red-950/80 text-red-400 border-red-500/50 cursor-not-allowed opacity-80 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
              }`}
            >
              {address && !isEligible && !isCheckingBalance && <Lock className="w-4 h-4 text-red-400 shrink-0" />}
              {isSubmitting
                ? 'PROCESSING TREASURY TRANSACTION...'
                : !address
                ? 'CONNECT WALLET TO WITHDRAW'
                : isCheckingBalance
                ? 'VERIFYING $REAL BALANCE...'
                : isEligible
                ? 'EXCHANGE & WITHDRAW NOW'
                : 'LOCKED (NEED 1,000,000 $REAL)'}
            </button>
          </form>
        </div>

        {/* Withdrawal History */}
        <div className="bg-[#120d04] border border-yellow-500/20 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-yellow-500/15">
            <h3 className="text-xs font-bold font-press-start text-amber-400 flex items-center gap-2">
              <Clock className="w-4 h-4" /> YOUR WITHDRAWAL HISTORY
            </h3>
            <ShieldCheck className="w-4 h-4 text-yellow-500/60" />
          </div>

          {!address ? (
            <p className="text-xs font-mono text-amber-200/50 py-6 text-center">Connect wallet to view your personal withdrawal history.</p>
          ) : isLoadingHistory ? (
            <p className="text-xs font-mono text-amber-400/80 py-6 text-center animate-pulse">Loading withdrawal records...</p>
          ) : history.length === 0 ? (
            <p className="text-xs font-mono text-amber-200/50 py-6 text-center">No withdrawals made yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-amber-400/70 border-b border-yellow-500/10 text-[10px] uppercase">
                    <th className="pb-3">COINS EXCHANGED</th>
                    <th className="pb-3">PAYOUT RECEIVED</th>
                    <th className="pb-3">STATUS</th>
                    <th className="pb-3 text-right">SOLANA TX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-500/10">
                  {history.map((rec) => (
                    <tr key={rec.id} className="hover:bg-yellow-500/5 transition-colors">
                      <td className="py-3 font-bold text-yellow-300">{rec.coinsAmount} COINS</td>
                      <td className="py-3 font-bold text-amber-400">
                        {rec.payoutAmount ?? rec.tokensAmount} {rec.payoutAsset || '$REAL'}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[9px] bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30">
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={`https://explorer.solana.com/tx/${rec.txSignature}?cluster=mainnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-amber-400 hover:text-yellow-200 underline font-bold text-[11px]"
                        >
                          {rec.txSignature.slice(0, 8)}... <ExternalLink className="w-3 h-3" />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
