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
  Lock,
  ShoppingCart
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { CoinIcon } from '@/components/CoinIcon';
import { MIN_REAL_REQUIRED, RWD_TOKEN_MINT } from '@/lib/solana';
import { useGameSettings } from '@/hooks/useGameSettings';

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
  const { primaryWallet, setShowAuthFlow, realBalance, userBalanceUsd, isCheckingBalance, isEligible, isMainnet } = useAppWallet();
  const { settings: gameSettings } = useGameSettings();
  const address = primaryWallet?.address;

  const coinsPerToken = gameSettings.coinsPerToken || 10;
  const minWithdraw = gameSettings.minWithdrawCoins || 1000;
  const minHolding = gameSettings.minRwdRequired;
  const minHoldingUsd = gameSettings.minRwdUsdRequired ?? 10;

  const [bankCoins, setBankCoins] = useState<number>(0);
  const [exchangeCoins, setExchangeCoins] = useState<string>(String(minWithdraw));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txSuccess, setTxSuccess] = useState<any | null>(null);

  const [history, setHistory] = useState<WithdrawalRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Dynamic Exchange Calculation from Database
  const coinsNum = Number(exchangeCoins) || 0;
  const estimatedTokens = coinsNum > 0 ? (coinsNum / coinsPerToken) : 0;

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
      if (isMainnet) {
        setErrorMsg(`Withdrawal locked! You must hold at least $${minHoldingUsd.toFixed(2)} USD worth of $RWD tokens in your wallet to withdraw.`);
      } else {
        setErrorMsg(`Withdrawal locked! You must hold at least ${minHolding.toLocaleString()} $RWD tokens in your wallet to withdraw.`);
      }
      return;
    }

    if (isNaN(coinsNum) || coinsNum < minWithdraw) {
      setErrorMsg(`Minimum withdrawal threshold is ${minWithdraw.toLocaleString()} coins.`);
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
    <main className="min-h-screen bg-[#07040d] text-[#f5d0fe] antialiased py-10 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.2),transparent_60%)] pointer-events-none" />
      <div className="max-w-4xl mx-auto space-y-10 relative z-10">

        {/* Page Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-fuchsia-300 text-xs font-mono font-bold tracking-widest uppercase shadow-[0_0_12px_rgba(168,85,247,0.3)]">
            <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" /> Solana Token Treasury
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-press-start text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-fuchsia-400 to-pink-400 drop-shadow-[0_0_15px_rgba(217,70,239,0.7)]">
            TREASURY EXCHANGE
          </h1>
          <p className="text-xs sm:text-sm font-mono text-purple-200/80 max-w-xl mx-auto">
            Convert your hard-earned climbing coins into <strong className="text-fuchsia-300">$RWD</strong> tokens. Paid directly from our Solana treasury wallet.
          </p>

          {/* $RWD Token Address & Minimum Limit Badges */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            {RWD_TOKEN_MINT && (
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#140b24] border border-purple-500/30 rounded-xl text-xs font-mono text-purple-200">
                <span className="text-[10px] text-fuchsia-400 font-bold uppercase">$RWD MINT:</span>
                <span className="font-bold text-purple-100 select-all font-mono">
                  {RWD_TOKEN_MINT}
                </span>
                <a
                  href={`https://solscan.io/token/${RWD_TOKEN_MINT}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-fuchsia-400 hover:text-white ml-1 inline-flex items-center"
                  title="View on Solscan"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#140b24] border border-purple-500/30 rounded-xl text-xs font-mono text-purple-200">
              <ShieldCheck className="w-3.5 h-3.5 text-fuchsia-400" />
              <span className="text-[10px] text-purple-300 font-bold uppercase">MIN WITHDRAWAL:</span>
              <span className="font-bold text-fuchsia-300 font-mono">{minWithdraw.toLocaleString()} COINS (= {(minWithdraw / coinsPerToken).toLocaleString()} $RWD)</span>
            </div>
          </div>
        </div>

        {/* Live Balance Card */}
        <div className="bg-gradient-to-r from-[#140b24] via-[#241340] to-[#140b24] border-2 border-purple-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_35px_rgba(168,85,247,0.25)] flex flex-col sm:flex-row items-center justify-between gap-6 relative overflow-hidden">
          <div className="space-y-1 text-center sm:text-left z-10">
            <span className="text-xs font-mono font-bold text-purple-300 uppercase tracking-widest">
              YOUR BANK BALANCE
            </span>
            <div className="flex items-center justify-center sm:justify-start gap-3">
              <CoinIcon className="w-8 h-8 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)] animate-pulse" />
              <span className="text-3xl sm:text-4xl font-extrabold font-press-start text-fuchsia-300">
                {bankCoins.toLocaleString()} <span className="text-sm font-mono text-purple-300">COINS</span>
              </span>
            </div>
          </div>

          <div className="z-10 w-full sm:w-auto">
            {!address ? (
              <button
                onClick={() => setShowAuthFlow(true)}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 text-white font-bold font-press-start text-xs rounded-xl shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:scale-105 transition-all flex items-center justify-center gap-2 border border-fuchsia-300"
              >
                <Wallet className="w-4 h-4" /> CONNECT WALLET TO EXCHANGER
              </button>
            ) : (
              <div className="px-5 py-2.5 bg-black/40 border border-purple-500/30 rounded-2xl text-center">
                <span className="text-[10px] font-mono text-purple-300/80 block">CONNECTED WALLET</span>
                <span className="text-xs font-mono font-bold text-purple-200">
                  {address.slice(0, 6)}...{address.slice(-6)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Exchange Form Section */}
        <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-purple-500/20">
            <h2 className="text-sm font-bold font-press-start text-fuchsia-300 flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-purple-400" /> CONVERT COINS TO $RWD TOKENS
            </h2>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-500/15 border border-purple-500/30 rounded-xl text-[11px] font-mono text-purple-200">
              <span>MIN LIMIT:</span>
              <span className="font-bold text-fuchsia-300">{minWithdraw.toLocaleString()} COINS</span>
            </div>
          </div>

          {/* $RWD Token Gate Requirement Notice */}
          {address && (
            <div className="space-y-3">
              <div className={`p-4 rounded-2xl border text-xs font-mono flex items-center justify-between gap-3 ${isCheckingBalance
                ? 'bg-purple-500/10 border-purple-500/30 text-fuchsia-300 animate-pulse'
                : isEligible
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                  : 'bg-red-500/15 border-red-500/40 text-red-300'
                }`}>
                <div className="flex items-center gap-3">
                  <img src="/logo.jpg" alt="$RWD" className="w-8 h-8 rounded-full border border-fuchsia-400/40 object-cover shrink-0" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-purple-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      $RWD TOKEN HOLDINGS REQUIREMENT
                    </span>
                    <span className="text-white text-xs">
                      Current Balance: <strong className="text-fuchsia-300">{isCheckingBalance ? 'Fetching SPL Token Balance...' : `${(realBalance ?? 0).toLocaleString()} $RWD`}</strong> {minHolding > 0 ? `(Min Required: ${minHolding.toLocaleString()} $RWD)` : '(No Min Required)'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isEligible && !isCheckingBalance && (
                    <a
                      href={`https://pump.fun/coin/${RWD_TOKEN_MINT}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:from-purple-500 hover:to-fuchsia-400 text-white font-press-start text-[9px] font-extrabold rounded-xl border border-fuchsia-300 shadow-[0_0_15px_rgba(168,85,247,0.5)] flex items-center gap-1.5 transition-all transform hover:scale-105 active:scale-95"
                    >
                      <ShoppingCart className="w-3.5 h-3.5 text-white" />
                      <span>BUY $RWD ON PUMP.FUN</span>
                      <ExternalLink className="w-3 h-3 text-white" />
                    </a>
                  )}
                  <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase shrink-0 font-mono ${isEligible ? 'bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40' : 'bg-red-500/30 text-red-200 border border-red-400/40'
                    }`}>
                    {isCheckingBalance ? 'VERIFYING' : isEligible ? 'WITHDRAWAL UNLOCKED' : 'LOCKED'}
                  </span>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleWithdraw} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Input Coins */}
              <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-4 space-y-2">
                <label className="text-[10px] font-mono font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <CoinIcon className="w-4 h-4" /> COINS TO WITHDRAW (MIN: {minWithdraw.toLocaleString()})
                </label>
                <div className="flex items-center gap-2">
                  <CoinIcon className="w-6 h-6" />
                  <input
                    type="number"
                    min={minWithdraw}
                    step="100"
                    value={exchangeCoins}
                    onChange={(e) => setExchangeCoins(e.target.value)}
                    className="w-full bg-transparent font-mono text-xl font-bold text-purple-100 focus:outline-none placeholder-purple-500/30"
                    placeholder={String(minWithdraw)}
                  />
                </div>
              </div>

              {/* Estimated Token Output */}
              <div className="bg-[#140b24] border border-purple-500/30 rounded-2xl p-4 space-y-2">
                <label className="text-[10px] font-mono font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <img src="/logo.jpg" alt="$RWD" className="w-4 h-4 rounded-full object-cover border border-fuchsia-400/50" /> ESTIMATED $RWD TOKENS ({coinsPerToken} COINS = 1 $RWD)
                </label>
                <div className="flex items-center gap-2">
                  <img src="/logo.jpg" alt="$RWD" className="w-6 h-6 rounded-full object-cover border border-fuchsia-400/50" />
                  <span className="font-mono text-xl font-extrabold text-fuchsia-300 flex items-center gap-1.5">
                    {estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 4 })} <span className="text-xs text-purple-300">$RWD</span>
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
                  className="p-5 bg-purple-500/15 border border-purple-500/40 rounded-2xl space-y-2 text-xs font-mono text-purple-200"
                >
                  <div className="flex items-center gap-2 text-fuchsia-300 font-bold font-press-start text-[11px]">
                    <CheckCircle2 className="w-4 h-4 text-fuchsia-400" /> WITHDRAWAL SUCCESSFUL!
                  </div>
                  <p>
                    Exchanged <span className="font-bold text-fuchsia-300">{txSuccess.coinsExchanged}</span> coins for{' '}
                    <span className="font-bold text-fuchsia-300">
                      {txSuccess.payoutAmount ?? txSuccess.tokensPaid} {txSuccess.payoutAsset || '$RWD'}
                    </span>.
                  </p>
                  <div className="pt-1 flex items-center gap-1 text-[10px] text-purple-300 font-mono">
                    <span>Transaction Signature:</span>
                    <a
                      href={`https://explorer.solana.com/tx/${txSuccess.txSignature}?cluster=mainnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline flex items-center gap-1 text-fuchsia-300 hover:text-white font-bold"
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
              className={`w-full py-4 font-bold font-press-start text-xs sm:text-sm rounded-2xl border-2 transition-all flex items-center justify-center gap-2 ${!address
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 text-white border-fuchsia-300 shadow-[0_0_25px_rgba(168,85,247,0.6)] hover:shadow-[0_0_35px_rgba(217,70,239,0.9)] cursor-pointer'
                : isCheckingBalance
                  ? 'bg-purple-500/20 text-fuchsia-300 border-purple-500/40 cursor-wait animate-pulse'
                  : isEligible
                    ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:from-purple-500 hover:to-fuchsia-400 text-white border-fuchsia-300 shadow-[0_0_25px_rgba(168,85,247,0.6)] hover:shadow-[0_0_35px_rgba(217,70,239,0.9)] cursor-pointer'
                    : 'bg-red-950/80 text-red-400 border-red-500/50 cursor-not-allowed opacity-80 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                }`}
            >
              {address && !isEligible && !isCheckingBalance && <Lock className="w-4 h-4 text-red-400 shrink-0" />}
              {isSubmitting
                ? 'PROCESSING TREASURY TRANSACTION...'
                : !address
                  ? 'CONNECT WALLET TO WITHDRAW'
                  : isCheckingBalance
                    ? 'VERIFYING $RWD BALANCE...'
                    : isEligible
                      ? 'EXCHANGE & WITHDRAW NOW'
                      : `LOCKED (NEED ${MIN_REAL_REQUIRED.toLocaleString()} $RWD)`}
            </button>
          </form>
        </div>

        {/* Withdrawal History */}
        <div className="bg-[#120722] border border-purple-500/25 rounded-3xl p-6 sm:p-8 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
            <h3 className="text-xs font-bold font-press-start text-purple-200 flex items-center gap-2">
              <Clock className="w-4 h-4 text-fuchsia-400" /> YOUR WITHDRAWAL HISTORY
            </h3>
            <ShieldCheck className="w-4 h-4 text-fuchsia-400" />
          </div>

          {!address ? (
            <p className="text-xs font-mono text-purple-300/50 py-6 text-center">Connect wallet to view your personal withdrawal history.</p>
          ) : isLoadingHistory ? (
            <p className="text-xs font-mono text-purple-400/80 py-6 text-center animate-pulse">Loading withdrawal records...</p>
          ) : history.length === 0 ? (
            <p className="text-xs font-mono text-purple-300/50 py-6 text-center">No withdrawals made yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="text-purple-300/70 border-b border-purple-500/15 text-[10px] uppercase">
                    <th className="pb-3">COINS EXCHANGED</th>
                    <th className="pb-3">PAYOUT RECEIVED</th>
                    <th className="pb-3">STATUS</th>
                    <th className="pb-3 text-right">SOLANA TX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-500/10">
                  {history.map((rec) => (
                    <tr key={rec.id} className="hover:bg-purple-500/10 transition-colors">
                      <td className="py-3 font-bold text-fuchsia-300">{rec.coinsAmount} COINS</td>
                      <td className="py-3 font-bold text-purple-200">
                        {rec.payoutAmount ?? rec.tokensAmount} {rec.payoutAsset || '$RWD'}
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[9px] bg-purple-500/20 text-fuchsia-300 font-bold border border-purple-500/40">
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <a
                          href={`https://explorer.solana.com/tx/${rec.txSignature}?cluster=mainnet`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-fuchsia-400 hover:text-white underline font-bold text-[11px]"
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
