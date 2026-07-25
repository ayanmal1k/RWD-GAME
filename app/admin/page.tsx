'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import {
  ShieldCheck,
  Trophy,
  ArrowDownToLine,
  BarChart3,
  Calendar,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  ExternalLink,
  Coins,
  Sparkles,
  Users
} from 'lucide-react';
import { motion } from 'framer-motion';

interface GlobalWithdrawal {
  id: string;
  userAddress: string;
  coinsAmount: number;
  tokensAmount: number;
  txSignature: string;
  isSimulated?: boolean;
  status: string;
  createdAt?: any;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'withdrawals' | 'stats'>('leaderboard');

  // Leaderboard settings state
  const [isLeaderboardEnabled, setIsLeaderboardEnabled] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Withdrawals log state
  const [withdrawals, setWithdrawals] = useState<GlobalWithdrawal[]>([]);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false);

  // Stats state
  const [totalEcosystemCoins, setTotalEcosystemCoins] = useState(0);
  const [totalPaidTokens, setTotalPaidTokens] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  // Fetch Admin Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (res.ok) {
        setIsLeaderboardEnabled(Boolean(data.enabled));
        setStartDate(data.startDate || '');
        setEndDate(data.endDate || '');
      }
    } catch (err) {
      console.error('Failed to load admin settings:', err);
    }
  };

  // Fetch Global Withdrawals
  const fetchWithdrawals = async () => {
    setIsLoadingWithdrawals(true);
    try {
      const q = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(25));
      const snapshot = await getDocs(q);
      const records: GlobalWithdrawal[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GlobalWithdrawal[];
      setWithdrawals(records);

      // Sum total paid tokens
      const sumTokens = records.reduce((acc, curr) => acc + (curr.tokensAmount || 0), 0);
      setTotalPaidTokens(sumTokens);
    } catch (err) {
      console.error('Failed to fetch global withdrawals:', err);
    } finally {
      setIsLoadingWithdrawals(false);
    }
  };

  // Fetch Ecosystem Metrics
  const fetchMetrics = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      setTotalUsersCount(usersSnap.size);

      let sumCoins = 0;
      usersSnap.forEach((doc) => {
        sumCoins += Number(doc.data()?.totalCoins || 0);
      });
      setTotalEcosystemCoins(sumCoins);
    } catch (err) {
      console.error('Failed to fetch ecosystem metrics:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchWithdrawals();
    fetchMetrics();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    setSaveSuccessMsg(false);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: isLeaderboardEnabled,
          startDate,
          endDate,
        }),
      });

      if (res.ok) {
        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0802] text-[#fef08a] antialiased py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Page Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-mono font-bold tracking-widest uppercase">
            <ShieldCheck className="w-4 h-4 text-yellow-400" /> ADMIN CONTROL CENTER
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-press-start text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">
            ADMIN PANEL
          </h1>
          <p className="text-xs sm:text-sm font-mono text-amber-200/70 max-w-xl mx-auto">
            Manage game leaderboard date ranges, view global Solana treasury payout logs, and monitor ecosystem metrics.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-center gap-2 bg-[#171206] p-2 rounded-2xl border border-yellow-500/30 shadow-xl max-w-xl mx-auto">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-press-start text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold shadow-[0_0_15px_rgba(234,179,8,0.4)]'
                : 'text-amber-200/60 hover:text-yellow-300'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" /> LEADERBOARD
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-press-start text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'withdrawals'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold shadow-[0_0_15px_rgba(234,179,8,0.4)]'
                : 'text-amber-200/60 hover:text-yellow-300'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> WITHDRAWALS
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-press-start text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold shadow-[0_0_15px_rgba(234,179,8,0.4)]'
                : 'text-amber-200/60 hover:text-yellow-300'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> METRICS
          </button>
        </div>

        {/* TAB 1: LEADERBOARD SETTINGS */}
        {activeTab === 'leaderboard' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl"
          >
            <h2 className="text-sm font-bold font-press-start text-yellow-300 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" /> LEADERBOARD CONFIGURATION
            </h2>

            <form onSubmit={handleSaveSettings} className="space-y-6">

              {/* Toggle Switch */}
              <div className="flex items-center justify-between p-4 bg-[#0a0802] border border-yellow-500/20 rounded-2xl">
                <div className="space-y-1">
                  <span className="text-xs font-mono font-bold text-amber-300 block">ENABLE LEADERBOARD</span>
                  <span className="text-[10px] font-mono text-amber-400/60 block">
                    Turn leaderboard display ON or OFF for all players.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLeaderboardEnabled(!isLeaderboardEnabled)}
                  className="cursor-pointer text-yellow-400 hover:scale-105 transition-transform"
                >
                  {isLeaderboardEnabled ? (
                    <ToggleRight className="w-10 h-10 text-yellow-400" />
                  ) : (
                    <ToggleLeft className="w-10 h-10 text-amber-950" />
                  )}
                </button>
              </div>

              {/* Date Range Selectors */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-[#0a0802] border border-yellow-500/20 rounded-2xl p-4 space-y-2">
                  <label className="text-[10px] font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-yellow-400" /> START DATE
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm font-bold text-yellow-200 focus:outline-none cursor-pointer"
                  />
                </div>

                <div className="bg-[#0a0802] border border-yellow-500/20 rounded-2xl p-4 space-y-2">
                  <label className="text-[10px] font-mono font-bold text-amber-400 uppercase flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-yellow-400" /> END DATE
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-transparent font-mono text-sm font-bold text-yellow-200 focus:outline-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Save Success Alert */}
              {saveSuccessMsg && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/40 rounded-2xl flex items-center gap-2 text-xs font-mono text-yellow-300 font-bold">
                  <CheckCircle2 className="w-4 h-4 text-yellow-400" /> Leaderboard settings saved successfully!
                </div>
              )}

              {/* Save Button */}
              <button
                type="submit"
                disabled={isSavingSettings}
                className="w-full py-4 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-[#0a0802] font-bold font-press-start text-xs rounded-2xl shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingSettings ? 'SAVING SETTINGS...' : 'SAVE LEADERBOARD CONFIGURATION'}
              </button>
            </form>
          </motion.div>
        )}

        {/* TAB 2: GLOBAL WITHDRAWAL LOGS */}
        {activeTab === 'withdrawals' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-yellow-500/20">
              <h2 className="text-sm font-bold font-press-start text-yellow-300 flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-yellow-400" /> GLOBAL WITHDRAWAL TABLE
              </h2>
              <button
                onClick={fetchWithdrawals}
                className="text-[10px] font-mono text-amber-400 hover:underline cursor-pointer"
              >
                REFRESH
              </button>
            </div>

            {isLoadingWithdrawals ? (
              <p className="text-xs font-mono text-amber-400/80 py-12 text-center animate-pulse">Loading withdrawal logs...</p>
            ) : withdrawals.length === 0 ? (
              <p className="text-xs font-mono text-amber-200/50 py-12 text-center">No global withdrawals recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-amber-400/70 border-b border-yellow-500/20 text-[10px] uppercase">
                      <th className="pb-3">PLAYER WALLET</th>
                      <th className="pb-3">COINS EXCHANGED</th>
                      <th className="pb-3">TOKENS PAID</th>
                      <th className="pb-3">STATUS</th>
                      <th className="pb-3 text-right">SOLANA TX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-yellow-500/10">
                    {withdrawals.map((rec) => (
                      <tr key={rec.id} className="hover:bg-yellow-500/5 transition-colors">
                        <td className="py-3.5 font-bold text-yellow-200">
                          {rec.userAddress ? `${rec.userAddress.slice(0, 4)}...${rec.userAddress.slice(-4)}` : 'Unknown'}
                        </td>
                        <td className="py-3.5 text-yellow-300 font-bold">{rec.coinsAmount} COINS</td>
                        <td className="py-3.5 text-amber-400 font-bold">{rec.tokensAmount} $REAL</td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-yellow-500/20 text-yellow-300 font-bold border border-yellow-500/30">
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
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
          </motion.div>
        )}

        {/* TAB 3: ECOSYSTEM METRICS */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-6"
          >
            <div className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">ECOSYSTEM BANK COINS</span>
                <Coins className="w-5 h-5 text-yellow-400" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold font-press-start text-yellow-300 block">
                {totalEcosystemCoins.toLocaleString()}
              </span>
              <span className="text-[10px] font-mono text-amber-400/60 block">Total coins held across all player banks</span>
            </div>

            <div className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">TOTAL TOKENS PAID</span>
                <Sparkles className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold font-press-start text-amber-300 block">
                {totalPaidTokens.toLocaleString()} <span className="text-xs">$REAL</span>
              </span>
              <span className="text-[10px] font-mono text-amber-400/60 block">Total tokens distributed via treasury</span>
            </div>

            <div className="bg-[#120d04] border border-yellow-500/30 rounded-3xl p-6 space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-amber-400">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider">TOTAL PLAYERS</span>
                <Users className="w-5 h-5 text-yellow-400" />
              </div>
              <span className="text-2xl sm:text-3xl font-extrabold font-press-start text-yellow-200 block">
                {totalUsersCount.toLocaleString()}
              </span>
              <span className="text-[10px] font-mono text-amber-400/60 block">Registered player wallets in database</span>
            </div>
          </motion.div>
        )}

      </div>
    </main>
  );
}
