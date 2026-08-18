'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GameEngine, CHARACTERS, CHARACTER_LIST, CharacterId } from '@/lib/retro-climber';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { CoinIcon } from '@/components/CoinIcon';
import { useAppWallet } from '@/components/DynamicProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
import { MIN_REAL_REQUIRED, RWD_TOKEN_MINT } from '@/lib/solana';
import { payGameFee } from '@/lib/payGameFee';
import {
  Pause,
  Volume2,
  VolumeX,
  Trophy,
  Maximize2,
  Minimize2,
  History,
  Clock,
  Coins,
  X,
  Lock,
  ShieldAlert,
  ExternalLink,
  ShoppingCart
} from 'lucide-react';

interface GameHistoryItem {
  id: string;
  userAddress: string;
  score: number;
  coins: number;
  durationSeconds: number;
  createdAt?: any;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const { primaryWallet, setShowAuthFlow, realBalance, isCheckingBalance, isEligible, isAuthenticated, isAuthenticating } = useAppWallet();

  // Payment flow state
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'pending' | 'confirming' | 'error'>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const GAME_FEE = Number(process.env.NEXT_PUBLIC_GAME_FEE_AMOUNT || 10);

  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterId | null>(null);

  // Game History Modal state
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<GameHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Leaderboard Modal state
  const [showLeaderboardModal, setShowLeaderboardModal] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<{
    enabled: boolean;
    startDate?: string;
    endDate?: string;
    topPlayers: Array<{ rank: number; userAddress: string; score: number; coins: number; durationSeconds: number }>;
  } | null>(null);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);

  const activeSessionRef = useRef<{ sessionId: string; token: string } | null>(null);

  const fetchLeaderboard = async () => {
    setIsLoadingLeaderboard(true);
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      if (res.ok) {
        setLeaderboardData(data);
      }
    } catch (err) {
      console.error('Failed to fetch leaderboard:', err);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  const handleOpenLeaderboard = () => {
    setShowLeaderboardModal(true);
    fetchLeaderboard();
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Save user to Firestore when they connect
  useEffect(() => {
    const saveUser = async () => {
      if (primaryWallet?.address) {
        const address = primaryWallet.address;
        try {
          const userRef = doc(db, 'users', address);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              address: address,
              createdAt: serverTimestamp(),
            });
            console.log("New user registered:", address);
          }
        } catch (error) {
          console.error("Firebase save error:", error);
        }
      }
    };
    saveUser();
  }, [primaryWallet?.address]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const q = query(collection(db, 'game_history'), orderBy('createdAt', 'desc'), limit(10));
      const snapshot = await getDocs(q);
      const logs: GameHistoryItem[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as GameHistoryItem[];
      setHistoryLogs(logs);
    } catch (err) {
      console.error("Failed to fetch game history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistoryModal(true);
    fetchHistory();
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedHighScore = localStorage.getItem('omu_crazy_climber_high_score');
      if (savedHighScore) {
        setHighScore(parseInt(savedHighScore, 10));
      }
    }
  }, []);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auto-pause on mobile when leaving fullscreen
  useEffect(() => {
    if (isMobile && !isFullscreen && engineRef.current && gameState === 'PLAYING') {
      engineRef.current.pauseGame();
    }
  }, [isMobile, isFullscreen, gameState]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      onScoreChange: (newScore) => setScore(newScore),
      onCoinChange: (newCoins) => setCoins(newCoins),
      onStateChange: (state) => setGameState(state),
      onGameOver: (finalScore, finalCoins, durationSeconds) => {
        const currentHigh = parseInt(localStorage.getItem('omu_crazy_climber_high_score') || '0', 10);
        if (finalScore > currentHigh) {
          localStorage.setItem('omu_crazy_climber_high_score', finalScore.toString());
          setHighScore(finalScore);
        }

        // Verify and end run securely via Server Anti-Cheat API
        if (activeSessionRef.current) {
          const session = activeSessionRef.current;
          activeSessionRef.current = null;

          const verifyAndSave = async () => {
            try {
              const res = await fetch('/api/game/end', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: session.sessionId,
                  token: session.token,
                  score: finalScore,
                  coins: finalCoins,
                }),
              });
              const data = await res.json();
              if (res.ok && data.success) {
                console.log("Run verified & recorded by anti-cheat server!");
              } else {
                console.warn("Anti-cheat flag triggered:", data.error || data.details);
              }
            } catch (e) {
              console.error("Failed to verify game session:", e);
            }
          };
          verifyAndSave();
        }
      }
    });

    engineRef.current = engine;
    engine.audio.setMute(isMuted);

    return () => {
      engine.cleanUp();
    };
  }, [primaryWallet?.address]);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.audio.setMute(isMuted);
    }
  }, [isMuted]);

  const handlePlayClick = () => {
    if (!primaryWallet) {
      setShowAuthFlow(true);
      return;
    }
    if (isCheckingBalance) return;
    if (!isEligible) return;
    if (!isAuthenticated || isAuthenticating) return;
    if (paymentStatus === 'pending' || paymentStatus === 'confirming') return;

    if (isMobile && !isFullscreen) {
      setIsFullscreen(true);
    }
    handleStartRestart();
  };

  useEffect(() => {
    if ((!primaryWallet || (!isCheckingBalance && !isEligible)) && gameState !== 'START') {
      if (engineRef.current) {
        engineRef.current.forceStop();
      }
    }
  }, [primaryWallet, isEligible, isCheckingBalance, gameState]);

  const handleStartRestart = async () => {
    if (!primaryWallet?.address) return;
    if (!isEligible) {
      console.warn(`Blocked game start: Wallet holds less than ${MIN_REAL_REQUIRED} $REAL tokens`);
      return;
    }
    if (!isAuthenticated) {
      console.warn('Blocked game start: Wallet not authenticated');
      return;
    }

    // Reset payment state
    setPaymentError(null);
    setPaymentStatus('pending');

    try {
      // Step 1: Build and send the 10 RWD payment transaction
      const { txSignature } = await payGameFee(primaryWallet.address);
      console.log('Payment tx submitted:', txSignature);

      // Step 2: Server verifies the finalized transaction and creates session
      setPaymentStatus('confirming');

      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txSignature }),
      });
      const data = await res.json();

      if (!res.ok || !data.sessionId) {
        throw new Error(data.error || 'Failed to start game session');
      }

      activeSessionRef.current = { sessionId: data.sessionId, token: data.token };
      console.log('Game session created:', data.sessionId);

      setPaymentStatus('idle');

      // Step 3: Start the game
      const characterPool: CharacterId[] = ['red', 'blue', 'orange', 'green'];
      const chosenCharacter: CharacterId = selectedCharacter ?? characterPool[Math.floor(Math.random() * characterPool.length)];

      if (engineRef.current) {
        engineRef.current.setCharacter(chosenCharacter);
        engineRef.current.startGame();
      }
    } catch (err: any) {
      console.error('Payment/session error:', err);
      setPaymentStatus('error');
      setPaymentError(err?.message || 'Payment failed. Please try again.');
    }
  };

  useEffect(() => {
    const handleSpaceStart = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        gameState === 'START' &&
        !showHistoryModal &&
        !showLeaderboardModal &&
        isAuthenticated &&
        paymentStatus === 'idle'
      ) {
        e.preventDefault();
        handlePlayClick();
      }
    };
    window.addEventListener('keydown', handleSpaceStart);
    return () => window.removeEventListener('keydown', handleSpaceStart);
  }, [gameState, showHistoryModal, showLeaderboardModal, primaryWallet, isEligible, isCheckingBalance, selectedCharacter, isAuthenticated, paymentStatus]);

  const toggleFullscreen = () => {
    const newVal = !isFullscreen;
    setIsFullscreen(newVal);
    if (!newVal && isMobile && engineRef.current && gameState === 'PLAYING') {
      engineRef.current.pauseGame();
    }
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  const handlePauseResume = () => {
    if (engineRef.current) {
      if (gameState === 'PLAYING') {
        engineRef.current.pauseGame();
      } else if (gameState === 'PAUSED') {
        if (isMobile && !isFullscreen) {
          setIsFullscreen(true);
        }
        engineRef.current.resumeGame();
      }
    }
  };

  return (
    <main className={`${isFullscreen ? 'overflow-hidden' : 'min-h-screen'} w-full bg-gradient-to-b from-[#07040d] via-[#120722] to-[#07040d] text-[#f5d0fe] antialiased font-sans pb-12`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.2),transparent_60%)] pointer-events-none" />

      {/* Normal page header & highscore (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col items-center p-4 sm:px-8 sm:pt-6 sm:pb-2">
          <div className="w-full max-w-xl flex flex-col items-center gap-2 z-10">
            <div className="w-full text-center">
              <span className="text-[10px] font-press-start text-purple-400 tracking-widest uppercase">
                BEST SCORE: <span className="text-fuchsia-300 font-extrabold">{highScore}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Game canvas */}
      <div className={isFullscreen ? 'fixed inset-0 z-50 bg-[#07040d] flex items-center justify-center overflow-hidden' : 'w-full max-w-xl mx-auto px-4 pb-4'}>
        <div className={isFullscreen ? 'relative' : 'w-full relative bg-[#120722] rounded-3xl p-2 shadow-[0_16px_40px_rgba(0,0,0,0.9)] border-2 border-purple-500/30 overflow-hidden'} style={isFullscreen ? { width: 'min(100%, calc(100vh * 3 / 4))', aspectRatio: '3/4' } : undefined}>
          <div className={`relative overflow-hidden bg-[#07030e] ${isFullscreen ? 'w-full h-full rounded-none' : 'aspect-[3/4] rounded-2xl'}`}>
            <canvas
              ref={canvasRef}
              width={480}
              height={640}
              className="w-full h-full pixelated select-none pointer-events-none"
            />

            {/* START OVERLAY */}
            {gameState === 'START' && (
              <div
                className="absolute inset-0 bg-[#07040d] flex flex-col items-center justify-center p-3 sm:p-6 text-center text-white z-40 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-wider font-press-start text-transparent bg-clip-text bg-gradient-to-b from-purple-200 via-fuchsia-400 to-purple-500 drop-shadow-[0_0_15px_rgba(217,70,239,0.7)] mb-4 sm:mb-8 shrink-0">
                  $RWD CLIMBER
                </h1>

                {/* Large Character Idle Preview */}
                <div className="relative w-20 h-20 sm:w-28 sm:h-28 mb-2 sm:mb-3 shrink-0">
                  <img
                    src={selectedCharacter ? CHARACTERS[selectedCharacter].idleSrc : '/characters/red/5.png'}
                    alt="Character Idle"
                    className="w-full h-full object-contain pixelated animate-breathe drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]"
                  />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 sm:w-16 h-2 sm:h-3 bg-black/60 rounded-[50%] blur-sm animate-shadow-breathe"></div>
                </div>

                {/* CHARACTER SELECTOR (No names, idle preview with click to select) */}
                <div className="w-full max-w-sm mb-3 sm:mb-4 shrink-0">
                  <div className="flex items-center justify-center gap-1.5 mb-2">
                    <span className="text-[8px] sm:text-[9px] font-press-start text-purple-300 tracking-wider uppercase">
                      SELECT CLIMBER
                    </span>
                    <span className="text-[8px] font-mono text-fuchsia-300/60">
                      ({selectedCharacter ? 'SELECTED' : 'RANDOM ON START'})
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                    {CHARACTER_LIST.map((char) => {
                      const isSelected = selectedCharacter === char.id;
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => setSelectedCharacter(char.id)}
                          className={`relative p-1.5 sm:p-2 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center justify-center cursor-pointer group ${isSelected
                              ? 'bg-gradient-to-b from-purple-500/35 to-fuchsia-500/20 border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,0.7)] scale-105 ring-2 ring-fuchsia-400/80'
                              : 'bg-[#140b24]/90 border-purple-500/25 hover:border-purple-400/60 hover:bg-purple-500/15 hover:scale-105'
                            }`}
                          title="Click to select"
                        >
                          <div className="w-11 h-11 sm:w-13 sm:h-13 relative flex items-center justify-center">
                            <img
                              src={char.idleSrc}
                              alt="Climber"
                              className={`w-full h-full object-contain pixelated transition-transform duration-200 ${isSelected ? 'animate-breathe scale-110 drop-shadow-[0_0_8px_rgba(217,70,239,0.7)]' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'
                                }`}
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-fuchsia-400 text-black rounded-full flex items-center justify-center text-[8px] font-black shadow-[0_0_8px_rgba(217,70,239,0.9)]">
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* $RWD TOKEN BALANCE GATE CARD */}
                {primaryWallet && (
                  <div className="mb-3 w-full max-w-sm space-y-2 shrink-0">
                    <div className={`w-full p-3 rounded-2xl border text-xs font-mono text-left flex items-center justify-between gap-2 backdrop-blur-md ${isCheckingBalance
                      ? 'bg-purple-500/10 border-purple-500/30 text-fuchsia-300 animate-pulse'
                      : isEligible
                        ? 'bg-purple-500/20 border-purple-500/40 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                        : 'bg-red-500/15 border-red-500/40 text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                      }`}>
                      <div className="flex items-center gap-2">
                        <img src="/logo.jpg" alt="$RWD" className="w-6 h-6 rounded-full border border-fuchsia-400/40 shrink-0 object-cover" />
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold uppercase tracking-wider text-purple-300/90 flex items-center gap-1">
                            $RWD HOLDINGS GATE
                          </span>
                          <span className="font-bold text-white text-[11px]">
                            {isCheckingBalance
                              ? 'Fetching SPL Token Balance...'
                              : MIN_REAL_REQUIRED > 0
                                ? `${(realBalance ?? 0).toLocaleString()} / ${MIN_REAL_REQUIRED.toLocaleString()} $RWD`
                                : `${(realBalance ?? 0).toLocaleString()} $RWD (No Min Required)`}
                          </span>
                        </div>
                      </div>
                      <span className={`text-[8px] sm:text-[9px] px-2 py-0.5 rounded-lg font-bold font-mono uppercase shrink-0 ${isEligible ? 'bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40' : 'bg-red-500/30 text-red-200 border border-red-400/40'
                        }`}>
                        {isCheckingBalance ? 'VERIFYING' : isEligible ? 'UNLOCKED' : 'LOCKED'}
                      </span>
                    </div>

                    {!isEligible && !isCheckingBalance && (
                      <a
                        href={`https://pump.fun/coin/${RWD_TOKEN_MINT}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 hover:from-purple-500 hover:to-fuchsia-400 text-white font-press-start text-[9px] sm:text-[10px] font-extrabold rounded-2xl border-2 border-fuchsia-300 shadow-[0_0_20px_rgba(168,85,247,0.6)] hover:shadow-[0_0_30px_rgba(217,70,239,0.9)] flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer tracking-wider"
                      >
                        <ShoppingCart className="w-4 h-4 text-white shrink-0" />
                        <span>BUY $RWD ON PUMP.FUN</span>
                        <ExternalLink className="w-3.5 h-3.5 text-white shrink-0" />
                      </a>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full max-w-sm justify-center shrink-0">
                  <button
                    onClick={handlePlayClick}
                    disabled={!!primaryWallet && (!isEligible || isCheckingBalance || !isAuthenticated || isAuthenticating || paymentStatus === 'pending' || paymentStatus === 'confirming')}
                    className={`w-full sm:w-auto px-5 py-3 sm:px-6 sm:py-3.5 font-bold font-press-start text-[9px] sm:text-[10px] rounded-2xl border-2 sm:border-4 transition-all flex items-center justify-center gap-1.5 leading-tight ${!primaryWallet
                      ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 text-white border-fuchsia-300 shadow-[0_0_25px_rgba(168,85,247,0.6)] hover:shadow-[0_0_35px_rgba(217,70,239,0.9)] cursor-pointer transform hover:scale-105 active:scale-95'
                      : isCheckingBalance || isAuthenticating
                        ? 'bg-purple-500/20 text-fuchsia-300 border-purple-500/40 cursor-wait animate-pulse'
                        : paymentStatus === 'pending' || paymentStatus === 'confirming'
                          ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40 cursor-wait animate-pulse'
                          : isEligible && isAuthenticated
                            ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 text-white border-fuchsia-300 shadow-[0_0_25px_rgba(168,85,247,0.6)] hover:shadow-[0_0_35px_rgba(217,70,239,0.9)] cursor-pointer transform hover:scale-105 active:scale-95'
                            : 'bg-red-950/80 text-red-400 border-red-500/50 cursor-not-allowed opacity-80 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                      }`}
                  >
                    {!!primaryWallet && !isEligible && !isCheckingBalance && !isAuthenticating && <Lock className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                    {!primaryWallet
                      ? 'CONNECT TO PLAY'
                      : isAuthenticating
                        ? 'VERIFYING WALLET...'
                        : isCheckingBalance
                          ? 'CHECKING $RWD...'
                          : !isAuthenticated
                            ? 'SIGN TO VERIFY'
                            : paymentStatus === 'pending'
                              ? 'CONFIRM IN WALLET...'
                              : paymentStatus === 'confirming'
                                ? 'CONFIRMING PAYMENT...'
                                : isEligible
                                  ? `PLAY (${GAME_FEE} RWD)`
                                  : 'NEED $RWD TO PLAY'}
                  </button>
                  {paymentError && paymentStatus === 'error' && (
                    <p className="text-[8px] font-mono text-red-400 mt-1 text-center max-w-sm">{paymentError}</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                    <button
                      onClick={handleOpenHistory}
                      className="px-3 py-2.5 sm:px-5 sm:py-4 bg-[#140b24] hover:bg-[#201138] text-fuchsia-300 font-bold font-press-start text-[10px] sm:text-xs rounded-2xl border border-purple-500/40 flex items-center justify-center gap-1.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                    >
                      <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
                      HISTORY
                    </button>
                    <button
                      onClick={handleOpenLeaderboard}
                      className="px-3 py-2.5 sm:px-5 sm:py-4 bg-[#140b24] hover:bg-[#201138] text-fuchsia-300 font-bold font-press-start text-[10px] sm:text-xs rounded-2xl border border-purple-500/40 flex items-center justify-center gap-1.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                    >
                      <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fuchsia-400" />
                      RANKINGS
                    </button>
                  </div>
                </div>

                {/* EMBEDDED LEADERBOARD PREVIEW (BELOW BUTTONS) */}
                {leaderboardData && leaderboardData.enabled && (
                  <div className="mt-4 sm:mt-6 w-full max-w-sm bg-[#140b24]/90 border border-purple-500/30 rounded-2xl p-2.5 sm:p-3 shadow-lg text-left space-y-1.5 shrink-0">
                    <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-press-start text-fuchsia-300 pb-1 border-b border-purple-500/15">
                      <span className="flex items-center gap-1.5"><Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-fuchsia-400" /> TOP CLIMBERS</span>
                      {leaderboardData.startDate && leaderboardData.endDate && (
                        <span className="text-[7px] sm:text-[8px] font-mono text-purple-300/70">{leaderboardData.startDate} - {leaderboardData.endDate}</span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {leaderboardData.topPlayers.slice(0, 3).map((player) => (
                        <div key={player.rank} className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono bg-black/40 px-2 py-1 rounded-lg border border-purple-500/15">
                          <span className="font-bold text-purple-200 truncate max-w-[140px] sm:max-w-[180px]">
                            #{player.rank} {player.userAddress.slice(0, 4)}...{player.userAddress.slice(-4)}
                          </span>
                          <span className="font-press-start text-[8px] sm:text-[9px] text-fuchsia-300">{player.score} PTS</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isMobile && !isFullscreen && (
                  <p className="mt-2 text-[8px] sm:text-[9px] font-mono text-purple-300/70 shrink-0">Tap PLAY to enter game view.</p>
                )}
              </div>
            )}

            {/* PAUSED OVERLAY */}
            {gameState === 'PAUSED' && (
              <div className="absolute inset-0 bg-[#07040d]/90 flex flex-col items-center justify-center p-6 text-center text-white z-40">
                <h2 className="text-lg font-extrabold font-press-start text-fuchsia-400 mb-2 animate-pulse drop-shadow-[0_0_10px_rgba(217,70,239,0.7)]">PAUSED</h2>
                <p className="text-[9px] font-mono text-purple-200/70 mb-5">TAKE A BREATH</p>
                <button onClick={handlePauseResume} className="px-6 py-3 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-fuchsia-300 shadow-[0_0_20px_rgba(168,85,247,0.6)] cursor-pointer transform hover:scale-105 active:scale-95 transition-all">RESUME</button>
              </div>
            )}

            {/* GAME OVER (FELL) OVERLAY */}
            {gameState === 'GAME_OVER' && (
              <div
                className="absolute inset-0 bg-[#07040d]/95 flex flex-col items-center justify-center p-3 sm:p-6 text-center text-white z-40 overflow-y-auto [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                <h2 className="text-2xl sm:text-3xl font-extrabold font-press-start text-red-500 mb-1 drop-shadow-[0_0_14px_rgba(239,68,68,0.7)] animate-pulse">
                  FELL!
                </h2>

                <div className="flex items-center gap-3 my-2 text-xs font-press-start">
                  <div className="flex items-center gap-1.5 bg-[#140b24] px-3 py-1.5 rounded-xl border border-purple-500/35">
                    <span className="text-purple-300/80 text-[9px]">SCORE:</span>
                    <span className="text-fuchsia-300 font-extrabold">{score}</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-[#140b24] px-3 py-1.5 rounded-xl border border-purple-500/35">
                    <CoinIcon className="w-4 h-4" />
                    <span className="text-fuchsia-300 font-extrabold">{coins}</span>
                  </div>
                </div>

                {/* Large Character Idle Preview */}
                <div className="relative w-16 h-16 sm:w-20 sm:h-20 mb-2 shrink-0">
                  <img
                    src={selectedCharacter ? CHARACTERS[selectedCharacter].idleSrc : '/characters/red/5.png'}
                    alt="Character Idle"
                    className="w-full h-full object-contain pixelated animate-breathe drop-shadow-[0_0_14px_rgba(168,85,247,0.5)]"
                  />
                  <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-10 sm:w-12 h-2 bg-black/60 rounded-[50%] blur-sm animate-shadow-breathe"></div>
                </div>

                {/* CHARACTER SELECTOR (No names, idle preview with click to select) */}
                <div className="w-full max-w-sm mb-3 sm:mb-4 shrink-0">
                  <div className="flex items-center justify-center gap-1.5 mb-1.5">
                    <span className="text-[8px] sm:text-[9px] font-press-start text-purple-300 tracking-wider uppercase">
                      CHOOSE CLIMBER
                    </span>
                    <span className="text-[8px] font-mono text-fuchsia-300/60">
                      ({selectedCharacter ? 'SELECTED' : 'RANDOM ON RETRY'})
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                    {CHARACTER_LIST.map((char) => {
                      const isSelected = selectedCharacter === char.id;
                      return (
                        <button
                          key={char.id}
                          type="button"
                          onClick={() => setSelectedCharacter(char.id)}
                          className={`relative p-1.5 sm:p-2 rounded-2xl border-2 transition-all duration-200 flex flex-col items-center justify-center cursor-pointer group ${isSelected
                              ? 'bg-gradient-to-b from-purple-500/35 to-fuchsia-500/20 border-fuchsia-400 shadow-[0_0_18px_rgba(217,70,239,0.7)] scale-105 ring-2 ring-fuchsia-400/80'
                              : 'bg-[#140b24]/90 border-purple-500/25 hover:border-purple-400/60 hover:bg-purple-500/15 hover:scale-105'
                            }`}
                          title="Click to select"
                        >
                          <div className="w-10 h-10 sm:w-12 sm:h-12 relative flex items-center justify-center">
                            <img
                              src={char.idleSrc}
                              alt="Climber"
                              className={`w-full h-full object-contain pixelated transition-transform duration-200 ${isSelected ? 'animate-breathe scale-110 drop-shadow-[0_0_8px_rgba(217,70,239,0.7)]' : 'opacity-80 group-hover:opacity-100 group-hover:scale-105'
                                }`}
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-fuchsia-400 text-black rounded-full flex items-center justify-center text-[8px] font-black shadow-[0_0_8px_rgba(217,70,239,0.9)]">
                              ✓
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm justify-center shrink-0">
                  <button
                    onClick={() => { setGameState('START'); if (isMobile) setIsFullscreen(false); }}
                    className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-purple-600 text-white font-extrabold font-press-start text-[10px] rounded-2xl border-2 border-fuchsia-300 shadow-[0_0_25px_rgba(168,85,247,0.6)] hover:shadow-[0_0_35px_rgba(217,70,239,0.9)] cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                  >
                    RETURN
                  </button>
                  <button
                    onClick={handleOpenHistory}
                    className="w-full sm:w-auto px-4 py-3 bg-[#140b24] hover:bg-[#201138] text-fuchsia-300 font-bold font-press-start text-[10px] rounded-2xl border border-purple-500/40 flex items-center justify-center gap-1.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                  >
                    <History className="w-3.5 h-3.5 text-purple-400" />
                    HISTORY
                  </button>
                </div>
              </div>
            )}

            {/* HISTORY MODAL */}
            {showHistoryModal && (
              <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[200]">
                <div className="w-full max-w-lg bg-[#0a0515] border-2 border-purple-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(168,85,247,0.3)] text-white relative flex flex-col max-h-[90vh] sm:max-h-[85vh]">
                  <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-purple-500/20 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 sm:w-5 sm:h-5 text-fuchsia-400" />
                      <h3 className="text-[10px] sm:text-xs font-bold font-press-start text-purple-200">RECENT GAME LOGS</h3>
                    </div>
                    <button
                      onClick={() => setShowHistoryModal(false)}
                      className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-purple-400"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-2">
                    {isLoadingHistory ? (
                      <div className="py-12 text-center text-xs font-mono text-purple-400/80 animate-pulse">
                        Loading your game logs...
                      </div>
                    ) : historyLogs.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono text-purple-300/50">
                        No game history recorded yet. Play a run!
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {historyLogs.map((item, idx) => (
                          <div
                            key={item.id || idx}
                            className="bg-[#140b24]/80 border border-purple-500/20 rounded-xl p-2.5 sm:p-3 flex items-center justify-between text-xs font-mono"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-purple-300/80 font-bold">
                                {item.userAddress ? `${item.userAddress.slice(0, 4)}...${item.userAddress.slice(-4)}` : 'Anonymous'}
                              </span>
                              <div className="flex items-center gap-3 text-white font-bold">
                                <span className="text-fuchsia-300 font-press-start text-[10px]">{item.score} PTS</span>
                                <span className="flex items-center gap-1 text-purple-300 text-[10px]"><Coins className="w-3 h-3 text-fuchsia-400" /> {item.coins}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-purple-200/70 bg-black/40 px-2 py-1 rounded-lg border border-purple-500/15">
                              <Clock className="w-3 h-3 text-fuchsia-400" />
                              <span>{item.durationSeconds}s</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* LEADERBOARD MODAL */}
            {showLeaderboardModal && (
              <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[200]">
                <div className="w-full max-w-lg bg-[#0a0515] border-2 border-purple-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(168,85,247,0.3)] text-white relative flex flex-col max-h-[90vh] sm:max-h-[85vh]">
                  <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-purple-500/20 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-fuchsia-400" />
                      <h3 className="text-[10px] sm:text-xs font-bold font-press-start text-purple-200">CLIMBER LEADERBOARD</h3>
                    </div>
                    <button
                      onClick={() => setShowLeaderboardModal(false)}
                      className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-purple-400"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-2.5">
                    {isLoadingLeaderboard ? (
                      <div className="py-12 text-center text-xs font-mono text-purple-400/80 animate-pulse">
                        Fetching leaderboard rankings...
                      </div>
                    ) : !leaderboardData?.enabled ? (
                      <div className="py-12 text-center space-y-2">
                        <Trophy className="w-8 h-8 text-purple-500/40 mx-auto" />
                        <p className="text-xs font-mono text-purple-300/50">Leaderboard is currently paused by Admin.</p>
                      </div>
                    ) : leaderboardData.topPlayers.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono text-purple-300/50">
                        No leaderboard entries yet for this active period.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {leaderboardData.startDate && leaderboardData.endDate && (
                          <div className="text-[9px] sm:text-[10px] font-mono text-purple-300/70 bg-[#140b24] px-3 py-1.5 rounded-lg border border-purple-500/20 text-center">
                            Active Season: <span className="font-bold text-fuchsia-300">{leaderboardData.startDate}</span> to <span className="font-bold text-fuchsia-300">{leaderboardData.endDate}</span>
                          </div>
                        )}
                        {leaderboardData.topPlayers.map((player) => (
                          <div
                            key={player.rank}
                            className={`border rounded-xl p-2.5 sm:p-3 flex items-center justify-between text-[11px] sm:text-xs font-mono transition-all ${player.rank === 1
                              ? 'bg-gradient-to-r from-purple-500/25 to-fuchsia-500/15 border-fuchsia-400 shadow-[0_0_15px_rgba(217,70,239,0.3)]'
                              : 'bg-[#140b24]/80 border-purple-500/20'
                              }`}
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <span className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 rounded-lg flex items-center justify-center font-press-start text-[9px] sm:text-[10px] font-bold ${player.rank === 1 ? 'bg-fuchsia-400 text-black' : player.rank === 2 ? 'bg-purple-300 text-black' : player.rank === 3 ? 'bg-purple-600 text-white' : 'bg-black/40 text-purple-300/70'
                                }`}>
                                #{player.rank}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-purple-100 truncate text-[10px] sm:text-xs">
                                  {player.userAddress ? `${player.userAddress.slice(0, 4)}...${player.userAddress.slice(-4)}` : 'Anonymous'}
                                </span>
                              </div>
                            </div>
                            <span className="font-press-start text-[8px] sm:text-[10px] text-fuchsia-300 shrink-0 ml-2">
                              {player.score} PTS
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Floating buttons */}
            {gameState === 'PLAYING' && (
              <div className="absolute top-3 right-3 flex gap-1.5 z-20">
                <button onClick={() => setIsMuted(!isMuted)} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 border border-white/15 text-white/80 cursor-pointer transition-all" aria-label={isMuted ? "Unmute" : "Mute"}>{isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}</button>
                <button onClick={handlePauseResume} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 border border-white/15 text-white/80 cursor-pointer transition-all" aria-label="Pause"><Pause className="w-3.5 h-3.5 fill-white/80" /></button>
                <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 border border-white/15 text-white/80 cursor-pointer transition-all" aria-label="Fullscreen">{isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</button>
              </div>
            )}

            {/* Minimize button on overlays in fullscreen */}
            {isFullscreen && gameState !== 'PLAYING' && (
              <div className="absolute top-3 right-3 z-20">
                <button onClick={toggleFullscreen} className="p-1.5 rounded-lg bg-black/30 hover:bg-black/50 border border-white/15 text-white/80 cursor-pointer transition-all"><Minimize2 className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {/* Mobile touch controls */}
            {isMobile && gameState === 'PLAYING' && (
              <div className={`${isFullscreen ? 'fixed bottom-4 left-4 right-4 z-50' : 'absolute bottom-2 left-2 right-2 z-40'} flex items-end justify-between select-none touch-none`} style={{ touchAction: 'manipulation' }}>
                <div className="flex gap-1.5 sm:gap-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('left', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('left', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('left', false); }}
                    className="w-14 h-14 sm:w-18 sm:h-18 bg-black/60 backdrop-blur-md border-2 border-purple-500/40 rounded-2xl text-fuchsia-300 text-xl sm:text-2xl flex items-center justify-center active:bg-purple-500/30 select-none touch-none shadow-lg"
                  >◀</button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', false); }}
                    className="w-14 h-14 sm:w-18 sm:h-18 bg-black/60 backdrop-blur-md border-2 border-purple-500/40 rounded-2xl text-fuchsia-300 text-xl sm:text-2xl flex items-center justify-center active:bg-purple-500/30 select-none touch-none shadow-lg"
                  >▶</button>
                </div>
                <div className="flex gap-1.5 sm:gap-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', false); }}
                    className="w-14 h-14 sm:w-18 sm:h-18 bg-black/60 backdrop-blur-md border-2 border-purple-500/40 rounded-2xl text-fuchsia-300 text-xl sm:text-2xl flex items-center justify-center active:bg-purple-500/30 select-none touch-none shadow-lg"
                  >▲</button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); if (coins >= 20) { engineRef.current?.setKeyState('shift', true); engineRef.current?.setKeyState('jump', true); } }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('shift', false); engineRef.current?.setKeyState('jump', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('shift', false); engineRef.current?.setKeyState('jump', false); }}
                    className={`w-14 h-14 sm:w-18 sm:h-18 border-2 rounded-2xl text-lg sm:text-xl flex items-center justify-center select-none touch-none font-bold backdrop-blur-md shadow-lg ${coins >= 20 ? 'bg-black/60 border-fuchsia-400 text-fuchsia-300 active:bg-fuchsia-400/30 cursor-pointer' : 'bg-black/40 border-purple-900/40 text-purple-700/50 cursor-not-allowed'}`}
                  >▲▲</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls, Points & Gameplay Guide below canvas */}
      {!isFullscreen && (
        <div className="flex flex-col items-center px-4 sm:px-8 pb-10">
          <div className="w-full max-w-2xl flex flex-col items-center gap-5 z-10">

            {/* 1. Game Controls Card */}
            <section className="w-full bg-[#120722]/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xl border border-purple-500/30 flex flex-col gap-3.5 font-mono text-purple-200/80 text-xs">
              <div className="flex items-center justify-between border-b border-purple-500/20 pb-2.5">
                <h3 className="text-[11px] font-bold font-press-start text-fuchsia-300 uppercase tracking-wider flex items-center gap-2">
                  <CoinIcon className="w-4 h-4" /> CONTROLS & SHORTCUTS
                </h3>
                <span className="text-[9px] font-mono text-purple-300 font-bold bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/25">Desktop & Mobile</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-purple-500/15 sm:col-span-2">
                  <span className="text-[11px] font-bold text-purple-200">Move Left / Right</span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[10px]">A</kbd>
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[10px]">D</kbd>
                    <span className="text-[9px] text-purple-400/60 mx-1">or</span>
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[10px]">◀</kbd>
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[10px]">▶</kbd>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-purple-500/15">
                  <span className="text-[11px] font-bold text-purple-200">Jump</span>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[10px]">W</kbd>
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[10px]">▲</kbd>
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[8px]">SPACE</kbd>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-purple-500/15">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-purple-200">Super Jump</span>
                    <span className="text-[9px] text-fuchsia-400 font-bold">(20 Coins)</span>
                  </div>
                  <div className="flex gap-1 items-center">
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[8px]">SHIFT</kbd>
                    <span className="text-[9px] text-purple-400/60">+</span>
                    <kbd className="px-2 py-1 bg-[#241340] border border-purple-500/40 rounded-lg text-fuchsia-300 font-mono font-bold text-[8px]">SPACE</kbd>
                  </div>
                </div>
              </div>

              {/* In-game tips */}
              <div className="pt-2 border-t border-purple-500/15 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center gap-2 bg-[#07030e]/60 p-2 rounded-lg border border-purple-500/10">
                  <CoinIcon className="w-4 h-4 shrink-0" />
                  <span>Coins accumulate in your Treasury Bank for token withdrawal!</span>
                </div>
                <div className="flex items-center gap-2 bg-[#07030e]/60 p-2 rounded-lg border border-purple-500/10">
                  <span className="text-fuchsia-400 font-bold text-xs shrink-0">🚀 Super Jump</span>
                  <span>Spend 20 coins for a 1.6x massive upward vault!</span>
                </div>
              </div>
            </section>

            {/* 2. Cartoon Characters & Points Guide */}
            <section className="w-full bg-[#120722]/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xl border border-purple-500/30 flex flex-col gap-3.5 font-mono text-purple-200/80 text-xs">
              <div className="flex items-center justify-between border-b border-purple-500/20 pb-2.5">
                <h3 className="text-[11px] font-bold font-press-start text-fuchsia-300 uppercase tracking-wider flex items-center gap-2">
                  ⭐ CARTOON BONUSES & POINTS
                </h3>
                <span className="text-[9px] font-mono text-amber-300 font-bold bg-amber-500/15 px-2 py-0.5 rounded border border-amber-500/25">Exclusive Spawns</span>
              </div>

              <p className="text-[10px] text-purple-300/70 leading-relaxed">
                Touch cartoon characters on platforms to trigger celebratory animations, retro chimes, and instant score boosts:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Sonic */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-sky-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-black/60 border border-sky-500/30 overflow-hidden flex items-center justify-start shrink-0">
                      <img
                        src="/cartoons/sonic/sonic_wait.png"
                        alt="Sonic"
                        className="h-full max-w-none [image-rendering:pixelated]"
                        style={{ width: '200%', objectFit: 'cover', objectPosition: 'left' }}
                      />
                    </div>
                    <div>
                      <span className="text-sky-300 font-bold text-[11px] block">Sonic the Hedgehog</span>
                      <span className="text-[9px] text-purple-300/60">5% chance (Standard Platforms)</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-sky-500/20 border border-sky-500/40 rounded-lg text-sky-300 font-bold text-[10px] font-press-start">+100</span>
                </div>

                {/* Mario */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-red-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-black/60 border border-red-500/30 overflow-hidden flex items-center justify-start shrink-0">
                      <img
                        src="/cartoons/mario/waiting_mario.png"
                        alt="Mario"
                        className="h-full max-w-none [image-rendering:pixelated]"
                        style={{ width: '200%', objectFit: 'cover', objectPosition: 'left' }}
                      />
                    </div>
                    <div>
                      <span className="text-red-300 font-bold text-[11px] block">Super Mario</span>
                      <span className="text-[9px] text-purple-300/60">10% chance (Moving Pipes)</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-red-500/20 border border-red-500/40 rounded-lg text-red-300 font-bold text-[10px] font-press-start">+100</span>
                </div>

                {/* Dexter */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-indigo-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-black/60 border border-indigo-500/30 overflow-hidden flex items-center justify-start shrink-0">
                      <img
                        src="/cartoons/dexter/dexter_wait.png"
                        alt="Dexter"
                        className="h-full max-w-none [image-rendering:pixelated]"
                        style={{ width: '300%', objectFit: 'cover', objectPosition: 'left' }}
                      />
                    </div>
                    <div>
                      <span className="text-indigo-300 font-bold text-[11px] block">Dexter's Laboratory</span>
                      <span className="text-[9px] text-purple-300/60">5% chance (Standard Platforms)</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-indigo-500/20 border border-indigo-500/40 rounded-lg text-indigo-300 font-bold text-[10px] font-press-start">+200</span>
                </div>

                {/* Tom & Jerry */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-blue-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-black/60 border border-blue-500/30 overflow-hidden flex items-center justify-start shrink-0">
                      <img
                        src="/cartoons/tom and jerry/wait_tnj.png"
                        alt="Tom & Jerry"
                        className="h-full max-w-none [image-rendering:pixelated]"
                        style={{ width: '200%', objectFit: 'cover', objectPosition: 'left' }}
                      />
                    </div>
                    <div>
                      <span className="text-blue-300 font-bold text-[11px] block">Tom & Jerry</span>
                      <span className="text-[9px] text-purple-300/60">5% chance (Standard Platforms)</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/40 rounded-lg text-blue-300 font-bold text-[10px] font-press-start">+200</span>
                </div>

                {/* Aaahh Real Monsters */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-purple-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-black/60 border border-purple-500/30 overflow-hidden flex items-center justify-start shrink-0">
                      <img
                        src="/cartoons/Ahh monsters/waitt monsters.png"
                        alt="Aaahh Real Monsters"
                        className="h-full max-w-none [image-rendering:pixelated]"
                        style={{ width: '200%', objectFit: 'cover', objectPosition: 'left' }}
                      />
                    </div>
                    <div>
                      <span className="text-purple-300 font-bold text-[11px] block">Aaahh!!! Real Monsters</span>
                      <span className="text-[9px] text-purple-300/60">5% chance (Standard Platforms)</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-purple-500/20 border border-purple-500/40 rounded-lg text-purple-300 font-bold text-[10px] font-press-start">+300</span>
                </div>

                {/* Rugrats */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-amber-500/20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-black/60 border border-amber-500/30 overflow-hidden flex items-center justify-start shrink-0">
                      <img
                        src="/cartoons/rugrats/rugrats_wait.png"
                        alt="Rugrats"
                        className="h-full max-w-none [image-rendering:pixelated]"
                        style={{ width: '200%', objectFit: 'cover', objectPosition: 'left' }}
                      />
                    </div>
                    <div>
                      <span className="text-amber-300 font-bold text-[11px] block">Rugrats</span>
                      <span className="text-[9px] text-purple-300/60">3% Rare Spawn (Standard Platforms)</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-lg text-amber-300 font-bold text-[10px] font-press-start">+400</span>
                </div>

                {/* Spinning Gold Coin */}
                <div className="flex items-center justify-between bg-[#07030e] p-2.5 rounded-xl border border-yellow-500/20 sm:col-span-2">
                  <div className="flex items-center gap-2.5">
                    <CoinIcon className="w-6 h-6 shrink-0" />
                    <div>
                      <span className="text-yellow-300 font-bold text-[11px] block">Spinning Gold Coin</span>
                      <span className="text-[9px] text-purple-300/60">+50 Score & deposits 1 coin to Treasury Bank</span>
                    </div>
                  </div>
                  <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/40 rounded-lg text-yellow-300 font-bold text-[10px] font-press-start">+50</span>
                </div>
              </div>
            </section>

            {/* 3. Platform Types & Mechanics Guide */}
            <section className="w-full bg-[#120722]/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-2xl border border-purple-500/30 flex flex-col gap-3.5 font-mono text-purple-200/80 text-xs">
              <div className="flex items-center justify-between border-b border-purple-500/20 pb-2.5">
                <h3 className="text-[11px] font-bold font-press-start text-fuchsia-300 uppercase tracking-wider flex items-center gap-2">
                  🕹️ PLATFORMS & ENVIRONMENT
                </h3>
                <span className="text-[9px] font-mono text-green-300 font-bold bg-green-500/15 px-2 py-0.5 rounded border border-green-500/25">Interactive Elements</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Standard Platform Variations */}
                <div className="bg-[#07030e] p-3 rounded-xl border border-purple-500/15 sm:col-span-2 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-fuchsia-300 font-bold text-[11px]">🧱 Static Platforms (4 Styles)</span>
                    <span className="text-[9px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">Randomized</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-purple-300/70 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-400 font-bold">🌿 Overworld Grass:</span>
                      <span>Mossy grass & dirt</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-amber-400 font-bold">🏁 Checkerboard:</span>
                      <span>Caramel soil & neon lawn</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-orange-400 font-bold">🧱 Castle Brick:</span>
                      <span>Terracotta staggered masonry</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold">⚡ Cyber Girder:</span>
                      <span>Cobalt chassis & cyan conduits</span>
                    </div>
                  </div>
                </div>

                {/* Moving Pipe Platform */}
                <div className="flex items-start gap-2.5 bg-[#07030e] p-2.5 rounded-xl border border-green-500/20">
                  <span className="text-xl shrink-0">🟢</span>
                  <div className="min-w-0">
                    <span className="text-green-300 font-bold text-[11px] block">Warp Pipe (Moving)</span>
                    <p className="text-[9px] text-purple-300/60 leading-tight mt-0.5">Slides smoothly side to side. 10% chance to host Mario!</p>
                  </div>
                </div>

                {/* Crumbling Platform */}
                <div className="flex items-start gap-2.5 bg-[#07030e] p-2.5 rounded-xl border border-amber-500/20">
                  <span className="text-xl shrink-0">⚠️</span>
                  <div className="min-w-0">
                    <span className="text-amber-300 font-bold text-[11px] block">Crumbling Stone</span>
                    <p className="text-[9px] text-purple-300/60 leading-tight mt-0.5">Cracked sandstone ledge. Crumbles & breaks 500ms after landing!</p>
                  </div>
                </div>

                {/* Spring Pad Platform */}
                <div className="flex items-start gap-2.5 bg-[#07030e] p-2.5 rounded-xl border border-fuchsia-500/20 sm:col-span-2">
                  <span className="text-xl shrink-0">🚀</span>
                  <div className="min-w-0">
                    <span className="text-fuchsia-300 font-bold text-[11px] block">Retro Arcade Booster Spring Pad</span>
                    <p className="text-[9px] text-purple-300/60 leading-tight mt-0.5">Hazard-striped industrial chassis with 3-stage animated steel coils that launch your character high into the sky!</p>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      )}
    </main>
  );
}
