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
  Users,
  Lock,
  Key,
  LogOut,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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

interface AdminUserRecord {
  address: string;
  totalCoins: number;
  totalWithdrawnCoins: number;
  totalWithdrawnTokens: number;
  gamesPlayedCount: number;
}

interface LeaderboardPreviewPlayer {
  rank: number;
  userAddress: string;
  score: number;
  coins: number;
  dateStr: string;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'withdrawals' | 'stats'>('leaderboard');

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [inputUser, setInputUser] = useState('');
  const [inputPass, setInputPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Game economics & settings state
  const [isLeaderboardEnabled, setIsLeaderboardEnabled] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [gameFeeAmount, setGameFeeAmount] = useState<number>(10);
  const [minRwdRequired, setMinRwdRequired] = useState<number>(0);
  const [minRwdUsdRequired, setMinRwdUsdRequired] = useState<number>(10);
  const [coinsPerToken, setCoinsPerToken] = useState<number>(10);
  const [minWithdrawCoins, setMinWithdrawCoins] = useState<number>(1000);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState(false);

  // Withdrawals log state
  const [withdrawals, setWithdrawals] = useState<GlobalWithdrawal[]>([]);
  const [isLoadingWithdrawals, setIsLoadingWithdrawals] = useState(false);

  // Stats state
  const [totalEcosystemCoins, setTotalEcosystemCoins] = useState(0);
  const [totalPaidTokens, setTotalPaidTokens] = useState(0);
  const [totalUsersCount, setTotalUsersCount] = useState(0);

  // All Users detailed records for Metrics Tab
  const [allUsersList, setAllUsersList] = useState<AdminUserRecord[]>([]);

  // Raw game history entries for Leaderboard Preview
  const [rawGameHistory, setRawGameHistory] = useState<any[]>([]);

  useEffect(() => {
    const sessionAuth = sessionStorage.getItem('admin_authenticated');
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthenticating(true);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inputUser, password: inputPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      sessionStorage.setItem('admin_authenticated', 'true');
      setIsAuthenticated(true);
    } catch (err: any) {
      setAuthError(err.message || 'Invalid username or password');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_authenticated');
    setIsAuthenticated(false);
    setInputPass('');
  };

  // Fetch Admin Settings from DB
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (res.ok) {
        setIsLeaderboardEnabled(data.leaderboardEnabled !== undefined ? Boolean(data.leaderboardEnabled) : Boolean(data.enabled));
        setStartDate(data.startDate || '');
        setEndDate(data.endDate || '');
        if (typeof data.gameFeeAmount === 'number') setGameFeeAmount(data.gameFeeAmount);
        if (typeof data.minRwdRequired === 'number') setMinRwdRequired(data.minRwdRequired);
        if (typeof data.minRwdUsdRequired === 'number') setMinRwdUsdRequired(data.minRwdUsdRequired);
        if (typeof data.coinsPerToken === 'number') setCoinsPerToken(data.coinsPerToken);
        if (typeof data.minWithdrawCoins === 'number') setMinWithdrawCoins(data.minWithdrawCoins);
      }
    } catch (err) {
      console.error('Failed to load admin settings:', err);
    }
  };

  // Fetch Global Withdrawals
  const fetchWithdrawals = async () => {
    setIsLoadingWithdrawals(true);
    try {
      const q = query(collection(db, 'withdrawals'), orderBy('createdAt', 'desc'), limit(50));
      const snapshot = await getDocs(q);
      const records: GlobalWithdrawal[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GlobalWithdrawal[];
      setWithdrawals(records);

      const sumTokens = records.reduce((acc, curr) => acc + (curr.tokensAmount || 0), 0);
      setTotalPaidTokens(sumTokens);
    } catch (err) {
      console.error('Failed to fetch global withdrawals:', err);
    } finally {
      setIsLoadingWithdrawals(false);
    }
  };

  // Fetch Ecosystem Metrics & User Details
  const fetchMetricsAndUsers = async () => {
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      const gamesSnap = await getDocs(collection(db, 'game_history'));

      // Tally games played per user
      const userGamesMap = new Map<string, number>();
      const gamesList: any[] = [];

      gamesSnap.forEach((doc) => {
        const data = doc.data();
        gamesList.push(data);
        const addr = data.userAddress;
        if (addr) {
          userGamesMap.set(addr, (userGamesMap.get(addr) || 0) + 1);
        }
      });

      setRawGameHistory(gamesList);
      setTotalUsersCount(usersSnap.size);

      let sumCoins = 0;
      const userRecords: AdminUserRecord[] = [];

      usersSnap.forEach((doc) => {
        const data = doc.data();
        const addr = data.address || doc.id;
        const currentBank = Number(data.totalCoins || 0);
        sumCoins += currentBank;

        userRecords.push({
          address: addr,
          totalCoins: currentBank,
          totalWithdrawnCoins: Number(data.totalWithdrawnCoins || 0),
          totalWithdrawnTokens: Number(data.totalWithdrawnTokens || 0),
          gamesPlayedCount: userGamesMap.get(addr) || 0,
        });
      });

      setTotalEcosystemCoins(sumCoins);
      setAllUsersList(userRecords);
    } catch (err) {
      console.error('Failed to fetch ecosystem metrics:', err);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchWithdrawals();
    fetchMetricsAndUsers();
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
          leaderboardEnabled: isLeaderboardEnabled,
          startDate,
          endDate,
          gameFeeAmount: Number(gameFeeAmount) || 0,
          minRwdRequired: Number(minRwdRequired) || 0,
          minRwdUsdRequired: Number(minRwdUsdRequired) || 0,
          coinsPerToken: Number(coinsPerToken) || 10,
          minWithdrawCoins: Number(minWithdrawCoins) || 1000,
        }),
      });

      if (res.ok) {
        setSaveSuccessMsg(true);
        setTimeout(() => setSaveSuccessMsg(false), 3500);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Compute Leaderboard Preview Top 10 (Regardless of toggle status)
  const computeLeaderboardPreview = (): LeaderboardPreviewPlayer[] => {
    let startMs = 0;
    let endMs = Infinity;

    if (startDate) {
      startMs = new Date(startDate).getTime();
    }
    if (endDate) {
      endMs = new Date(endDate + 'T23:59:59').getTime();
    }

    // Filter game entries by date range
    const filteredGames = rawGameHistory.filter((g) => {
      let timeMs = 0;
      if (g.createdAt?.seconds) {
        timeMs = g.createdAt.seconds * 1000;
      } else if (g.createdAt) {
        timeMs = new Date(g.createdAt).getTime();
      } else {
        timeMs = Date.now();
      }
      return timeMs >= startMs && timeMs <= endMs;
    });

    // Sort descending by score
    filteredGames.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

    // Deduplicate: 1 highest score per user
    const userBestMap = new Map<string, any>();
    filteredGames.forEach((g) => {
      const addr = g.userAddress || 'Anonymous';
      if (!userBestMap.has(addr)) {
        userBestMap.set(addr, g);
      }
    });

    return Array.from(userBestMap.values())
      .slice(0, 10)
      .map((g, idx) => {
        let dateStr = 'Recent';
        if (g.createdAt?.seconds) {
          dateStr = new Date(g.createdAt.seconds * 1000).toLocaleDateString();
        }
        return {
          rank: idx + 1,
          userAddress: g.userAddress || 'Anonymous',
          score: g.score || 0,
          coins: g.coins || 0,
          dateStr,
        };
      });
  };

  const leaderboardPreview = computeLeaderboardPreview();

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[#07040d] text-[#f5d0fe] antialiased flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.2),transparent_60%)] pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-[#120722] border-2 border-purple-500/35 rounded-3xl p-8 shadow-[0_0_50px_rgba(168,85,247,0.3)] space-y-6 relative overflow-hidden z-10"
        >
          {/* Header Icon */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-fuchsia-400 mx-auto shadow-inner">
              <Lock className="w-8 h-8 text-fuchsia-400 animate-pulse" />
            </div>
            <h1 className="text-2xl font-extrabold font-press-start text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-fuchsia-400 to-pink-400 drop-shadow-[0_0_12px_rgba(217,70,239,0.7)]">
              RESTRICTED ACCESS
            </h1>
            <p className="text-xs font-mono text-purple-300/70">
              Enter Administrator Credentials to access game control panel.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Username Input */}
            <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-3.5 space-y-1">
              <label className="text-[10px] font-mono font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-fuchsia-400" /> USERNAME
              </label>
              <input
                type="text"
                value={inputUser}
                onChange={(e) => setInputUser(e.target.value)}
                placeholder="admin"
                required
                className="w-full bg-transparent font-mono text-sm font-bold text-purple-100 focus:outline-none placeholder-purple-500/30"
              />
            </div>

            {/* Password Input */}
            <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-3.5 space-y-1 relative">
              <label className="text-[10px] font-mono font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-fuchsia-400" /> PASSWORD
              </label>
              <div className="flex items-center justify-between">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={inputPass}
                  onChange={(e) => setInputPass(e.target.value)}
                  placeholder="••••••••••••••••"
                  required
                  className="w-full bg-transparent font-mono text-sm font-bold text-purple-100 focus:outline-none placeholder-purple-500/30 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-purple-400/70 hover:text-fuchsia-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Auth Error Banner */}
            <AnimatePresence>
              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="p-3 bg-red-500/10 border border-red-500/40 rounded-xl flex items-center gap-2 text-red-400 text-xs font-mono"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full py-4 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:from-purple-500 hover:to-fuchsia-400 text-white font-bold font-press-start text-xs rounded-2xl shadow-[0_0_25px_rgba(168,85,247,0.6)] transition-all cursor-pointer disabled:opacity-50 border border-fuchsia-300"
            >
              {isAuthenticating ? 'VERIFYING CREDENTIALS...' : 'UNLOCK ADMIN PANEL'}
            </button>
          </form>
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07040d] text-[#f5d0fe] antialiased py-10 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.2),transparent_60%)] pointer-events-none" />
      <div className="max-w-5xl mx-auto space-y-8 relative z-10">

        {/* Page Header */}
        <div className="text-center space-y-3 relative">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-fuchsia-300 text-xs font-mono font-bold tracking-widest uppercase shadow-[0_0_12px_rgba(168,85,247,0.3)]">
              <ShieldCheck className="w-4 h-4 text-fuchsia-400" /> ADMIN CONTROL CENTER
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> LOGOUT ADMIN
            </button>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold font-press-start text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-fuchsia-400 to-pink-400 drop-shadow-[0_0_15px_rgba(217,70,239,0.7)]">
            ADMIN PANEL
          </h1>
          <p className="text-xs sm:text-sm font-mono text-purple-200/80 max-w-xl mx-auto">
            Manage game leaderboard date ranges, view global Solana treasury payout logs, and monitor ecosystem metrics.
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center justify-center gap-2 bg-[#120722] p-2 rounded-2xl border border-purple-500/30 shadow-xl max-w-xl mx-auto">
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-press-start text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 text-white font-bold shadow-[0_0_15px_rgba(168,85,247,0.6)] border border-fuchsia-400/40'
                : 'text-purple-300/60 hover:text-fuchsia-300'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" /> GAME CONFIG & LEADERBOARD
          </button>
          <button
            onClick={() => setActiveTab('withdrawals')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-press-start text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'withdrawals'
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 text-white font-bold shadow-[0_0_15px_rgba(168,85,247,0.6)] border border-fuchsia-400/40'
                : 'text-purple-300/60 hover:text-fuchsia-300'
            }`}
          >
            <ArrowDownToLine className="w-3.5 h-3.5" /> WITHDRAWALS
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 py-2.5 px-4 rounded-xl font-press-start text-[10px] tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 text-white font-bold shadow-[0_0_15px_rgba(168,85,247,0.6)] border border-fuchsia-400/40'
                : 'text-purple-300/60 hover:text-fuchsia-300'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" /> METRICS
          </button>
        </div>

        {/* TAB 1: GAME ECONOMICS & LEADERBOARD SETTINGS */}
        {activeTab === 'leaderboard' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Game Economics & Settings Form Card */}
            <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
              <div className="border-b border-purple-500/20 pb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold font-press-start text-fuchsia-300 flex items-center gap-2">
                  <Coins className="w-4 h-4 text-purple-400" /> GAME ECONOMICS & TOKEN PARAMETERS
                </h2>
                <span className="text-[10px] font-mono text-purple-300/80 bg-purple-500/15 px-3 py-1 rounded-full border border-purple-500/25">
                  Live Database Config
                </span>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-6">

                {/* Section A: Token & Entry Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* 1. Starting Game Fee ($RWD) */}
                  <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-4 space-y-2">
                    <label className="text-[10px] font-mono font-bold text-purple-300 uppercase flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5 text-fuchsia-400" /> STARTING GAME FEE ($RWD TOKENS)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={gameFeeAmount}
                      onChange={(e) => setGameFeeAmount(Number(e.target.value))}
                      required
                      className="w-full bg-transparent font-mono text-base font-bold text-purple-100 focus:outline-none"
                      placeholder="10"
                    />
                    <p className="text-[9px] font-mono text-purple-400/60">
                      Amount of $RWD tokens required to start a game run (transferred to Treasury).
                    </p>
                  </div>

                  {/* 2. Unified Minimum $RWD Holdings Required to Play */}
                  <div className="bg-[#07030e] border border-fuchsia-500/30 rounded-2xl p-4 space-y-2 shadow-[0_0_15px_rgba(217,70,239,0.1)]">
                    <label className="text-[10px] font-mono font-bold text-fuchsia-300 uppercase flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-fuchsia-400" /> MIN $RWD HOLDING REQUIRED TO PLAY
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={minRwdRequired}
                      onChange={(e) => setMinRwdRequired(Number(e.target.value))}
                      required
                      className="w-full bg-transparent font-mono text-base font-bold text-fuchsia-200 focus:outline-none"
                      placeholder="10"
                    />
                    <p className="text-[9px] font-mono text-fuchsia-300/70">
                      <strong>Mainnet:</strong> checked as <strong>${minRwdRequired} USD worth</strong> of $RWD (via DexScreener).<br/>
                      <strong>Devnet:</strong> checked as <strong>{minRwdRequired} raw $RWD tokens</strong>.
                    </p>
                  </div>

                  {/* 3. Coin-to-Token Exchange Rate */}
                  <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-4 space-y-2">
                    <label className="text-[10px] font-mono font-bold text-purple-300 uppercase flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" /> COINS PER 1 $RWD TOKEN (EXCHANGE RATE)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={coinsPerToken}
                      onChange={(e) => setCoinsPerToken(Number(e.target.value))}
                      required
                      className="w-full bg-transparent font-mono text-base font-bold text-purple-100 focus:outline-none"
                      placeholder="10"
                    />
                    <p className="text-[9px] font-mono text-purple-400/60">
                      Exchange ratio: e.g. 10 coins = 1 $RWD token during Treasury withdrawal.
                    </p>
                  </div>

                  {/* 5. Minimum Coin Withdrawal Threshold */}
                  <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-4 space-y-2 sm:col-span-2">
                    <label className="text-[10px] font-mono font-bold text-purple-300 uppercase flex items-center gap-1.5">
                      <ArrowDownToLine className="w-3.5 h-3.5 text-fuchsia-400" /> MIN COINS TO WITHDRAW
                    </label>
                    <input
                      type="number"
                      min="100"
                      step="100"
                      value={minWithdrawCoins}
                      onChange={(e) => setMinWithdrawCoins(Number(e.target.value))}
                      required
                      className="w-full bg-transparent font-mono text-base font-bold text-purple-100 focus:outline-none"
                      placeholder="1000"
                    />
                    <p className="text-[9px] font-mono text-purple-400/60">
                      Minimum in-game coins threshold before a player can request a token withdrawal.
                    </p>
                  </div>

                </div>

                {/* Section B: Leaderboard Controls */}
                <div className="pt-3 border-t border-purple-500/20 space-y-4">
                  <h3 className="text-xs font-bold font-press-start text-purple-200 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-fuchsia-400" /> LEADERBOARD STATUS & CONTEST DATES
                  </h3>

                  {/* Toggle Switch */}
                  <div className="flex items-center justify-between p-4 bg-[#07030e] border border-purple-500/25 rounded-2xl">
                    <div className="space-y-1">
                      <span className="text-xs font-mono font-bold text-purple-200 block">ENABLE LEADERBOARD</span>
                      <span className="text-[10px] font-mono text-purple-400/60 block">
                        Turn leaderboard display ON or OFF for all players.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLeaderboardEnabled(!isLeaderboardEnabled)}
                      className="cursor-pointer text-fuchsia-400 hover:scale-105 transition-transform"
                    >
                      {isLeaderboardEnabled ? (
                        <ToggleRight className="w-10 h-10 text-fuchsia-400" />
                      ) : (
                        <ToggleLeft className="w-10 h-10 text-purple-950" />
                      )}
                    </button>
                  </div>

                  {/* Date Range Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-4 space-y-2">
                      <label className="text-[10px] font-mono font-bold text-purple-300 uppercase flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-fuchsia-400" /> START DATE
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full bg-transparent font-mono text-sm font-bold text-purple-100 focus:outline-none cursor-pointer"
                      />
                    </div>

                    <div className="bg-[#07030e] border border-purple-500/25 rounded-2xl p-4 space-y-2">
                      <label className="text-[10px] font-mono font-bold text-purple-300 uppercase flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-fuchsia-400" /> END DATE
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full bg-transparent font-mono text-sm font-bold text-purple-100 focus:outline-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Live Economics Summary Preview Card */}
                <div className="p-4 bg-gradient-to-r from-[#140b24] via-[#241340] to-[#140b24] border border-purple-500/35 rounded-2xl flex flex-wrap items-center justify-around gap-3 text-center">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-purple-300/70 uppercase block">Game Fee</span>
                    <span className="font-press-start text-xs text-fuchsia-300">{gameFeeAmount} $RWD</span>
                  </div>
                  <div className="w-px h-8 bg-purple-500/30 hidden sm:block" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-purple-300/70 uppercase block">Mainnet Gate</span>
                    <span className="font-press-start text-xs text-fuchsia-300">{minRwdRequired > 0 ? `$${minRwdRequired.toFixed(2)} USD` : 'No Min'}</span>
                  </div>
                  <div className="w-px h-8 bg-purple-500/30 hidden sm:block" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-purple-300/70 uppercase block">Devnet Gate</span>
                    <span className="font-press-start text-xs text-purple-200">{minRwdRequired > 0 ? `${minRwdRequired} $RWD` : 'No Min'}</span>
                  </div>
                  <div className="w-px h-8 bg-purple-500/30 hidden sm:block" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-purple-300/70 uppercase block">Exchange Rate</span>
                    <span className="font-press-start text-xs text-fuchsia-300">{coinsPerToken} Coins = 1 $RWD</span>
                  </div>
                  <div className="w-px h-8 bg-purple-500/30 hidden sm:block" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-mono text-purple-300/70 uppercase block">Min Withdrawal</span>
                    <span className="font-press-start text-xs text-purple-200">{minWithdrawCoins.toLocaleString()} Coins</span>
                  </div>
                </div>

                {/* Save Success Alert */}
                {saveSuccessMsg && (
                  <div className="p-4 bg-purple-500/20 border border-fuchsia-400/50 rounded-2xl flex items-center gap-2 text-xs font-mono text-fuchsia-300 font-bold shadow-[0_0_15px_rgba(217,70,239,0.3)]">
                    <CheckCircle2 className="w-4 h-4 text-fuchsia-400" /> Game parameters & Leaderboard settings saved to database successfully!
                  </div>
                )}

                {/* Save Button */}
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:from-purple-500 hover:to-fuchsia-400 text-white font-bold font-press-start text-xs rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.6)] transition-all cursor-pointer disabled:opacity-50 border border-fuchsia-300"
                >
                  {isSavingSettings ? 'SAVING TO DATABASE...' : 'SAVE ALL GAME SETTINGS'}
                </button>
              </form>
            </div>

            {/* TOP 10 DATE-FILTERED LEADERBOARD PREVIEW */}
            <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
                <h3 className="text-xs font-bold font-press-start text-purple-200 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-fuchsia-400" /> TOP 10 PLAYERS FOR SELECTED DATE RANGE
                </h3>
                <span className="text-[10px] font-mono text-fuchsia-300 bg-purple-500/15 px-2.5 py-0.5 rounded-full border border-purple-500/30">
                  {startDate || 'Beginning'} to {endDate || 'Present'}
                </span>
              </div>

              {leaderboardPreview.length === 0 ? (
                <p className="text-xs font-mono text-purple-300/50 py-8 text-center">
                  No games played in the selected date range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="text-purple-300/70 border-b border-purple-500/15 text-[10px] uppercase">
                        <th className="pb-3">RANK</th>
                        <th className="pb-3">PLAYER WALLET</th>
                        <th className="pb-3">SCORE</th>
                        <th className="pb-3">COINS EARNED</th>
                        <th className="pb-3 text-right">DATE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-500/10">
                      {leaderboardPreview.map((player) => (
                        <tr key={player.rank} className="hover:bg-purple-500/10 transition-colors">
                          <td className="py-3 font-bold text-fuchsia-400">#{player.rank}</td>
                          <td className="py-3 font-bold text-purple-100 select-all font-mono">
                            {player.userAddress}
                          </td>
                          <td className="py-3 font-bold text-purple-200">{player.score.toLocaleString()} PTS</td>
                          <td className="py-3 font-bold text-fuchsia-300">{player.coins.toLocaleString()} COINS</td>
                          <td className="py-3 text-right text-purple-300/80 text-[10px]">{player.dateStr}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* TAB 2: GLOBAL WITHDRAWAL LOGS */}
        {activeTab === 'withdrawals' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl"
          >
            <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
              <h2 className="text-sm font-bold font-press-start text-fuchsia-300 flex items-center gap-2">
                <ArrowDownToLine className="w-4 h-4 text-purple-400" /> GLOBAL WITHDRAWAL TABLE
              </h2>
              <button
                onClick={fetchWithdrawals}
                className="text-[10px] font-mono text-fuchsia-400 hover:underline cursor-pointer"
              >
                REFRESH
              </button>
            </div>

            {isLoadingWithdrawals ? (
              <p className="text-xs font-mono text-purple-400/80 py-12 text-center animate-pulse">Loading withdrawal logs...</p>
            ) : withdrawals.length === 0 ? (
              <p className="text-xs font-mono text-purple-300/50 py-12 text-center">No global withdrawals recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-purple-300/70 border-b border-purple-500/15 text-[10px] uppercase">
                      <th className="pb-3">PLAYER WALLET</th>
                      <th className="pb-3">COINS EXCHANGED</th>
                      <th className="pb-3">TOKENS PAID</th>
                      <th className="pb-3">STATUS</th>
                      <th className="pb-3 text-right">SOLANA TX</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-500/10">
                    {withdrawals.map((rec) => (
                      <tr key={rec.id} className="hover:bg-purple-500/10 transition-colors">
                        <td className="py-3.5 font-bold text-purple-100 select-all font-mono">
                          {rec.userAddress}
                        </td>
                        <td className="py-3.5 text-fuchsia-300 font-bold">{rec.coinsAmount} COINS</td>
                        <td className="py-3.5 text-purple-200 font-bold">{rec.tokensAmount} $RWD</td>
                        <td className="py-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[9px] bg-purple-500/20 text-fuchsia-300 font-bold border border-purple-500/40">
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-3.5 text-right">
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
          </motion.div>
        )}

        {/* TAB 3: ECOSYSTEM METRICS & ALL USERS MANAGEMENT */}
        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Top Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 space-y-2 shadow-xl">
                <div className="flex items-center justify-between text-purple-300">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider">ECOSYSTEM BANK COINS</span>
                  <Coins className="w-5 h-5 text-fuchsia-400" />
                </div>
                <span className="text-2xl sm:text-3xl font-extrabold font-press-start text-fuchsia-300 block">
                  {totalEcosystemCoins.toLocaleString()}
                </span>
                <span className="text-[10px] font-mono text-purple-400/60 block">Total coins held across all player banks</span>
              </div>

              <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 space-y-2 shadow-xl">
                <div className="flex items-center justify-between text-purple-300">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider">TOTAL TOKENS PAID</span>
                  <Sparkles className="w-5 h-5 text-fuchsia-400" />
                </div>
                <span className="text-2xl sm:text-3xl font-extrabold font-press-start text-purple-200 block">
                  {totalPaidTokens.toLocaleString()} <span className="text-xs">$RWD</span>
                </span>
                <span className="text-[10px] font-mono text-purple-400/60 block">Total tokens distributed via treasury</span>
              </div>

              <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 space-y-2 shadow-xl">
                <div className="flex items-center justify-between text-purple-300">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider">TOTAL PLAYERS</span>
                  <Users className="w-5 h-5 text-fuchsia-400" />
                </div>
                <span className="text-2xl sm:text-3xl font-extrabold font-press-start text-purple-100 block">
                  {totalUsersCount.toLocaleString()}
                </span>
                <span className="text-[10px] font-mono text-purple-400/60 block">Registered player wallets in database</span>
              </div>
            </div>

            {/* FULL USERS DATA TABLE UNDER METRICS */}
            <div className="bg-[#120722] border border-purple-500/30 rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
                <h3 className="text-xs font-bold font-press-start text-fuchsia-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" /> ALL PLAYERS DIRECTORY
                </h3>
                <span className="text-[10px] font-mono text-purple-300/80 bg-purple-500/15 px-3 py-1 rounded-full border border-purple-500/30">
                  {allUsersList.length} WALLETS REGISTERED
                </span>
              </div>

              {allUsersList.length === 0 ? (
                <p className="text-xs font-mono text-purple-300/50 py-12 text-center">No player records found in database.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="text-purple-300/70 border-b border-purple-500/15 text-[10px] uppercase">
                        <th className="pb-3">FULL WALLET ADDRESS</th>
                        <th className="pb-3">BANKED COINS</th>
                        <th className="pb-3">WITHDRAWN COINS</th>
                        <th className="pb-3">WITHDRAWN TOKENS</th>
                        <th className="pb-3 text-right">TOTAL GAMES PLAYED</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-500/10">
                      {allUsersList.map((user) => (
                        <tr key={user.address} className="hover:bg-purple-500/10 transition-colors">
                          <td className="py-3.5 font-bold text-purple-100 select-all font-mono">
                            {user.address}
                          </td>
                          <td className="py-3.5 text-fuchsia-300 font-bold">
                            {user.totalCoins.toLocaleString()} COINS
                          </td>
                          <td className="py-3.5 text-purple-300 font-bold">
                            {user.totalWithdrawnCoins.toLocaleString()} COINS
                          </td>
                          <td className="py-3.5 text-purple-200 font-bold">
                            {user.totalWithdrawnTokens.toLocaleString()} $RWD
                          </td>
                          <td className="py-3.5 text-right font-extrabold text-purple-100">
                            {user.gamesPlayedCount} GAMES
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

      </div>
    </main>
  );
}
