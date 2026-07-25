'use client';

import React, { useState, useEffect } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
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
  Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface WithdrawalRecord {
  id: string;
  coinsAmount: number;
  tokensAmount: number;
  txSignature: string;
  isSimulated?: boolean;
  status: string;
  createdAt?: any;
}

export default function WithdrawPage() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const address = primaryWallet?.address;

  const [bankCoins, setBankCoins] = useState<number>(0);
  const [exchangeCoins, setExchangeCoins] = useState<string>('1000');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [txSuccess, setTxSuccess] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<WithdrawalRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Calculated Tokens (1000 Coins = 100 Tokens)
  const coinsNum = Math.max(0, parseInt(exchangeCoins, 10) || 0);
  const estimatedTokens = Math.floor((coinsNum / 1000) * 100);

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
        where('userAddress', '==', address),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      const records: WithdrawalRecord[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as WithdrawalRecord[];
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
        </div>

        {/* Live Balance Card */}
        <div className="bg-gradient-to-r from-[#171206] via-[#261e0b] to-[#171206] border-2 border-yellow-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_35px_rgba(234,179,8,0.2)] flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-1 text-center sm:text-left z-10">
            <span className="text-xs font-mono font-bold text-amber-400 uppercase tracking-widest">
              YOUR BANK BALANCE
            </span>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <Coins className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.8)] animate-pulse" />
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
        <div className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
          <h2 className="text-sm font-bold font-press-start text-amber-300 mb-6 flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-yellow-400" /> CONVERT COINS TO $REAL TOKENS
          </h2>

          <form onSubmit={handleWithdraw} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Input Coins */}
              <div className="bg-[#0a0802] border border-yellow-500/20 rounded-2xl p-4 space-y-2">
                <label className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                  COINS TO WITHDRAW (MIN: 1,000)
                </label>
                <div className="flex items-center gap-2">
                  <Coins className="w-5 h-5 text-yellow-400" />
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
                <label className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider block">
                  ESTIMATED $REAL TOKENS (10 COINS = 1 TOKEN)
                </label>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span className="font-mono text-xl font-extrabold text-yellow-300">
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
                  <p>Exchanged {txSuccess.coinsExchanged} coins for {txSuccess.tokensPaid} $REAL tokens.</p>
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
              disabled={isSubmitting || coinsNum < 1000 || coinsNum > bankCoins}
              className="w-full py-4 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-[#0a0802] font-bold font-press-start text-xs sm:text-sm rounded-2xl shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:shadow-[0_0_35px_rgba(234,179,8,0.7)] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01] active:scale-[0.99]"
            >
              {isSubmitting ? 'PROCESSING TREASURY TRANSACTION...' : 'EXCHANGE & WITHDRAW NOW'}
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
                    <th className="pb-3">TOKENS PAID</th>
                    <th className="pb-3">STATUS</th>
                    <th className="pb-3 text-right">SOLANA TX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-yellow-500/10">
                  {history.map((rec) => (
                    <tr key={rec.id} className="hover:bg-yellow-500/5 transition-colors">
                      <td className="py-3 font-bold text-yellow-300">{rec.coinsAmount} COINS</td>
                      <td className="py-3 font-bold text-amber-400">{rec.tokensAmount} $REAL</td>
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
