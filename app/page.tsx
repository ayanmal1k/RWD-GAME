'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/lib/retro-climber';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { CoinIcon } from '@/components/CoinIcon';
import { useAppWallet } from '@/components/DynamicProvider';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, query, orderBy, limit, getDocs, serverTimestamp } from 'firebase/firestore';
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
  X
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

  const { primaryWallet, setShowAuthFlow } = useAppWallet();

  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    if (isMobile && !isFullscreen) {
      setIsFullscreen(true);
    }
    if (!primaryWallet) {
      setShowAuthFlow(true);
    } else {
      handleStartRestart();
    }
  };

  useEffect(() => {
    if (!primaryWallet && gameState !== 'START') {
      if (engineRef.current) {
        engineRef.current.forceStop();
      }
    }
  }, [primaryWallet, gameState]);

  const handleStartRestart = async () => {
    // Initiate secure game session on server
    if (primaryWallet?.address) {
      try {
        const res = await fetch('/api/game/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userAddress: primaryWallet.address }),
        });
        const data = await res.json();
        if (res.ok && data.sessionId) {
          activeSessionRef.current = { sessionId: data.sessionId, token: data.token };
          console.log("Anti-cheat session created:", data.sessionId);
        }
      } catch (err) {
        console.error("Error creating anti-cheat session:", err);
      }
    }

    if (engineRef.current) {
      engineRef.current.startGame();
    }
  };

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
    <main className={`${isFullscreen ? 'overflow-hidden' : 'min-h-screen'} w-full bg-gradient-to-b from-[#0a0802] via-[#171206] to-[#0a0802] text-[#fef08a] antialiased font-sans pb-12`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(234,179,8,0.15),transparent_60%)] pointer-events-none" />

      {/* Normal page header & highscore (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col items-center p-4 sm:px-8 sm:pt-6 sm:pb-2">
          <div className="w-full max-w-xl flex flex-col items-center gap-2 z-10">
            <div className="w-full text-center">
              <span className="text-[10px] font-press-start text-amber-400 tracking-widest uppercase">
                BEST SCORE: <span className="text-yellow-300 font-extrabold">{highScore}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Game canvas */}
      <div className={isFullscreen ? 'fixed inset-0 z-50 bg-[#0a0802] flex items-center justify-center overflow-hidden' : 'w-full max-w-xl mx-auto px-4 pb-4'}>
        <div className={isFullscreen ? 'relative' : 'w-full relative bg-[#171206] rounded-3xl p-2 shadow-[0_16px_40px_rgba(0,0,0,0.8)] border-2 border-yellow-500/30 overflow-hidden'} style={isFullscreen ? { width: 'min(100%, calc(100vh * 3 / 4))', aspectRatio: '3/4' } : undefined}>
          <div className={`relative overflow-hidden bg-[#0d0903] ${isFullscreen ? 'w-full h-full rounded-none' : 'aspect-[3/4] rounded-2xl'}`}>
            <canvas
              ref={canvasRef}
              width={480}
              height={640}
              className="w-full h-full pixelated select-none pointer-events-none"
            />

            {/* START OVERLAY */}
            {gameState === 'START' && (
              <div className="absolute inset-0 bg-[#0a0802] flex flex-col items-center justify-center p-3 sm:p-6 text-center text-white z-40 overflow-y-auto custom-scrollbar">
                 <h1 className="text-2xl sm:text-4xl font-extrabold tracking-wider font-press-start text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-amber-400 to-yellow-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] mb-4 sm:mb-8 shrink-0">
                   $REAL CLIMBER
                 </h1>

                 <div className="relative w-20 h-20 sm:w-40 sm:h-40 mb-4 sm:mb-8 shrink-0">
                   <img 
                     src="/idle.png" 
                     alt="Character Idle" 
                     className="w-full h-full object-contain pixelated animate-breathe drop-shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                   />
                   <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-12 sm:w-16 h-2 sm:h-3 bg-black/60 rounded-[50%] blur-sm animate-shadow-breathe"></div>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 w-full max-w-sm justify-center shrink-0">
                   <button 
                     onClick={handlePlayClick}
                     className="w-full sm:w-auto px-6 py-3 sm:px-8 sm:py-4 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-[#0a0802] font-bold font-press-start text-xs sm:text-sm rounded-2xl border-2 sm:border-4 border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.5)] hover:shadow-[0_0_35px_rgba(234,179,8,0.8)] cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                   >
                     {primaryWallet ? "PLAY NOW" : "CONNECT TO PLAY"}
                   </button>
                   <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
                     <button 
                       onClick={handleOpenHistory}
                       className="px-3 py-2.5 sm:px-5 sm:py-4 bg-[#171206] hover:bg-[#261e0b] text-yellow-300 font-bold font-press-start text-[10px] sm:text-xs rounded-2xl border border-yellow-500/40 flex items-center justify-center gap-1.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                     >
                       <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                       HISTORY
                     </button>
                     <button 
                       onClick={handleOpenLeaderboard}
                       className="px-3 py-2.5 sm:px-5 sm:py-4 bg-[#171206] hover:bg-[#261e0b] text-yellow-300 font-bold font-press-start text-[10px] sm:text-xs rounded-2xl border border-yellow-500/40 flex items-center justify-center gap-1.5 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                     >
                       <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
                       RANKINGS
                     </button>
                   </div>
                 </div>

                 {/* EMBEDDED LEADERBOARD PREVIEW (BELOW BUTTONS) */}
                 {leaderboardData && leaderboardData.enabled && (
                   <div className="mt-4 sm:mt-6 w-full max-w-sm bg-[#171206]/90 border border-yellow-500/30 rounded-2xl p-2.5 sm:p-3 shadow-lg text-left space-y-1.5 shrink-0">
                     <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-press-start text-yellow-400 pb-1 border-b border-yellow-500/15">
                       <span className="flex items-center gap-1.5"><Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-yellow-400" /> TOP CLIMBERS</span>
                       {leaderboardData.startDate && leaderboardData.endDate && (
                         <span className="text-[7px] sm:text-[8px] font-mono text-amber-400/70">{leaderboardData.startDate} - {leaderboardData.endDate}</span>
                       )}
                     </div>
                     <div className="space-y-1">
                       {leaderboardData.topPlayers.slice(0, 3).map((player) => (
                         <div key={player.rank} className="flex items-center justify-between text-[9px] sm:text-[10px] font-mono bg-black/40 px-2 py-1 rounded-lg border border-yellow-500/10">
                           <span className="font-bold text-amber-300 truncate max-w-[140px] sm:max-w-[180px]">
                             #{player.rank} {player.userAddress.slice(0, 4)}...{player.userAddress.slice(-4)}
                           </span>
                           <span className="font-press-start text-[8px] sm:text-[9px] text-yellow-400">{player.score} PTS</span>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}

                 {isMobile && !isFullscreen && (
                   <p className="mt-2 text-[8px] sm:text-[9px] font-mono text-amber-400/70 shrink-0">Tap PLAY to enter game view.</p>
                 )}
              </div>
            )}

            {/* PAUSED OVERLAY */}
            {gameState === 'PAUSED' && (
              <div className="absolute inset-0 bg-[#0a0802]/90 flex flex-col items-center justify-center p-6 text-center text-white z-40">
                <h2 className="text-lg font-extrabold font-press-start text-yellow-400 mb-2 animate-pulse">PAUSED</h2>
                <p className="text-[9px] font-mono text-amber-200/70 mb-5">TAKE A BREATH</p>
                <button onClick={handlePauseResume} className="px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold font-press-start text-[10px] rounded-xl border-2 border-yellow-300/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">RESUME</button>
              </div>
            )}

            {/* GAME OVER OVERLAY */}
            {gameState === 'GAME_OVER' && (
              <div className="absolute inset-0 bg-[#0a0802]/95 flex flex-col items-center justify-center p-6 text-center text-white z-40">
                <h2 className="text-xl font-extrabold font-press-start text-red-500 mb-2 drop-shadow-md">FELL!</h2>
                <p className="text-[10px] font-press-start text-amber-400 mt-1 mb-1">SCORE: {score}</p>
                <p className="text-[10px] font-press-start text-yellow-300 mb-4">COINS: {coins}</p>
                <div className="flex gap-2 mb-3">
                  <button onClick={handleStartRestart} className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 text-[#0a0802] font-bold font-press-start text-[10px] rounded-xl border-2 border-yellow-300/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">TRY AGAIN</button>
                  <button onClick={handleOpenHistory} className="px-4 py-2.5 bg-[#171206] hover:bg-[#261e0b] text-yellow-300 font-bold font-press-start text-[10px] rounded-xl border border-yellow-500/40 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-amber-400" /> HISTORY</button>
                </div>
              </div>
            )}

            {/* HISTORY MODAL */}
            {showHistoryModal && (
              <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[200]">
                <div className="w-full max-w-lg bg-[#0a0802] border-2 border-yellow-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(234,179,8,0.25)] text-white relative flex flex-col max-h-[90vh] sm:max-h-[85vh]">
                  <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-yellow-500/20 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                      <h3 className="text-[10px] sm:text-xs font-bold font-press-start text-yellow-300">RECENT GAME LOGS</h3>
                    </div>
                    <button 
                      onClick={() => setShowHistoryModal(false)}
                      className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-amber-400"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-2">
                    {isLoadingHistory ? (
                      <div className="py-12 text-center text-xs font-mono text-amber-400/80 animate-pulse">
                        Loading your game logs...
                      </div>
                    ) : historyLogs.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono text-amber-200/50">
                        No game history recorded yet. Play a run!
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {historyLogs.map((item, idx) => (
                          <div 
                            key={item.id || idx}
                            className="bg-[#171206]/80 border border-yellow-500/20 rounded-xl p-2.5 sm:p-3 flex items-center justify-between text-xs font-mono"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-amber-400/80 font-bold">
                                {item.userAddress ? `${item.userAddress.slice(0, 4)}...${item.userAddress.slice(-4)}` : 'Anonymous'}
                              </span>
                              <div className="flex items-center gap-3 text-white font-bold">
                                <span className="text-yellow-300 font-press-start text-[10px]">{item.score} PTS</span>
                                <span className="flex items-center gap-1 text-amber-400 text-[10px]"><Coins className="w-3 h-3 text-yellow-400" /> {item.coins}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-200/70 bg-black/40 px-2 py-1 rounded-lg border border-yellow-500/10">
                              <Clock className="w-3 h-3 text-yellow-400" />
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
                <div className="w-full max-w-lg bg-[#0a0802] border-2 border-yellow-500/40 rounded-3xl p-4 sm:p-6 shadow-[0_0_50px_rgba(234,179,8,0.25)] text-white relative flex flex-col max-h-[90vh] sm:max-h-[85vh]">
                  <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-yellow-500/20 mb-3 sm:mb-4">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-400" />
                      <h3 className="text-[10px] sm:text-xs font-bold font-press-start text-yellow-300">CLIMBER LEADERBOARD</h3>
                    </div>
                    <button 
                      onClick={() => setShowLeaderboardModal(false)}
                      className="p-1.5 sm:p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-amber-400"
                    >
                      <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-2.5">
                    {isLoadingLeaderboard ? (
                      <div className="py-12 text-center text-xs font-mono text-amber-400/80 animate-pulse">
                        Fetching leaderboard rankings...
                      </div>
                    ) : !leaderboardData?.enabled ? (
                      <div className="py-12 text-center space-y-2">
                        <Trophy className="w-8 h-8 text-amber-500/40 mx-auto" />
                        <p className="text-xs font-mono text-amber-200/50">Leaderboard is currently paused by Admin.</p>
                      </div>
                    ) : leaderboardData.topPlayers.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono text-amber-200/50">
                        No leaderboard entries yet for this active period.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {leaderboardData.startDate && leaderboardData.endDate && (
                          <div className="text-[9px] sm:text-[10px] font-mono text-amber-400/70 bg-[#171206] px-3 py-1.5 rounded-lg border border-yellow-500/20 text-center">
                            Active Season: <span className="font-bold text-yellow-300">{leaderboardData.startDate}</span> to <span className="font-bold text-yellow-300">{leaderboardData.endDate}</span>
                          </div>
                        )}
                        {leaderboardData.topPlayers.map((player) => (
                          <div 
                            key={player.rank}
                            className={`border rounded-xl p-2.5 sm:p-3 flex items-center justify-between text-[11px] sm:text-xs font-mono transition-all ${
                              player.rank === 1
                                ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                : 'bg-[#171206]/80 border-yellow-500/20'
                            }`}
                          >
                            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                              <span className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 rounded-lg flex items-center justify-center font-press-start text-[9px] sm:text-[10px] font-bold ${
                                player.rank === 1 ? 'bg-yellow-400 text-black' : player.rank === 2 ? 'bg-amber-300/80 text-black' : player.rank === 3 ? 'bg-amber-600/80 text-white' : 'bg-black/40 text-amber-400/70'
                              }`}>
                                #{player.rank}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-yellow-200 truncate text-[10px] sm:text-xs">
                                  {player.userAddress ? `${player.userAddress.slice(0, 4)}...${player.userAddress.slice(-4)}` : 'Anonymous'}
                                </span>
                              </div>
                            </div>
                            <span className="font-press-start text-[8px] sm:text-[10px] text-yellow-400 shrink-0 ml-2">
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
                    className="w-14 h-14 sm:w-18 sm:h-18 bg-black/60 backdrop-blur-md border-2 border-yellow-500/40 rounded-2xl text-yellow-300 text-xl sm:text-2xl flex items-center justify-center active:bg-yellow-500/30 select-none touch-none shadow-lg"
                  >◀</button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', false); }}
                    className="w-14 h-14 sm:w-18 sm:h-18 bg-black/60 backdrop-blur-md border-2 border-yellow-500/40 rounded-2xl text-yellow-300 text-xl sm:text-2xl flex items-center justify-center active:bg-yellow-500/30 select-none touch-none shadow-lg"
                  >▶</button>
                </div>
                <div className="flex gap-1.5 sm:gap-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', false); }}
                    className="w-14 h-14 sm:w-18 sm:h-18 bg-black/60 backdrop-blur-md border-2 border-yellow-500/40 rounded-2xl text-yellow-300 text-xl sm:text-2xl flex items-center justify-center active:bg-yellow-500/30 select-none touch-none shadow-lg"
                  >▲</button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); if (coins >= 20) { engineRef.current?.setKeyState('shift', true); engineRef.current?.setKeyState('jump', true); } }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('shift', false); engineRef.current?.setKeyState('jump', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('shift', false); engineRef.current?.setKeyState('jump', false); }}
                    className={`w-14 h-14 sm:w-18 sm:h-18 border-2 rounded-2xl text-lg sm:text-xl flex items-center justify-center select-none touch-none font-bold backdrop-blur-md shadow-lg ${coins >= 20 ? 'bg-black/60 border-amber-400 text-yellow-300 active:bg-yellow-400/30 cursor-pointer' : 'bg-black/40 border-amber-900/40 text-amber-700/50 cursor-not-allowed'}`}
                  >▲▲</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls & Gameplay Instructions below canvas */}
      {!isFullscreen && (
        <div className="flex flex-col items-center px-4 sm:px-8 pb-8">
          <div className="w-full max-w-xl flex flex-col items-center gap-4 z-10">
            
            {/* Game Controls Card */}
            <section className="w-full bg-[#171206]/95 backdrop-blur-md rounded-2xl p-4 shadow-xl border border-yellow-500/30 flex flex-col gap-3 font-mono text-yellow-200/80 text-xs">
              <div className="flex items-center justify-between border-b border-yellow-500/20 pb-2.5">
                <h3 className="text-[10px] font-bold font-press-start text-yellow-300 uppercase tracking-wider flex items-center gap-2">
                  <CoinIcon className="w-4 h-4" /> GAME CONTROLS & INSTRUCTIONS
                </h3>
                <span className="text-[9px] font-mono text-amber-400 font-bold bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">Arcade Mode</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="flex items-center justify-between bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15 sm:col-span-2">
                  <span className="text-[11px] font-bold text-amber-300">Move Left / Right</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[10px]">A</kbd>
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[10px]">D</kbd>
                    <span className="text-[9px] text-amber-400/60 self-center mx-1">or</span>
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[10px]">◀</kbd>
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[10px]">▶</kbd>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15">
                  <span className="text-[11px] font-bold text-amber-300">Jump</span>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[10px]">W</kbd>
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[10px]">▲</kbd>
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[8px]">SPACE</kbd>
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15">
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] font-bold text-amber-300">Super Jump</span>
                    <span className="text-[9px] text-yellow-400 font-bold">(20 Coins)</span>
                  </div>
                  <div className="flex gap-1">
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[8px]">SHIFT</kbd>
                    <span className="text-[9px] text-amber-400/60 self-center">+</span>
                    <kbd className="px-2 py-1 bg-[#261e0b] border border-yellow-500/40 rounded-lg text-yellow-300 font-mono font-bold text-[8px]">SPACE</kbd>
                  </div>
                </div>
              </div>

              {/* Power-up Tips & Mechanics */}
              <div className="mt-1 pt-2.5 border-t border-yellow-500/15 grid grid-cols-2 gap-2 text-[10px]">
                <div className="flex items-center gap-2 bg-[#0a0802]/60 p-2 rounded-lg border border-yellow-500/10">
                  <CoinIcon className="w-4 h-4" />
                  <span>Collect coins to build your Treasury Bank!</span>
                </div>
                <div className="flex items-center gap-2 bg-[#0a0802]/60 p-2 rounded-lg border border-yellow-500/10">
                  <span className="text-yellow-400 font-bold text-xs">🚀 Springs</span>
                  <span>Bounce high on green spring platforms!</span>
                </div>
              </div>
            </section>

            {/* Mechanics & Platforms Guide */}
            <section className="w-full bg-[#171206]/95 backdrop-blur-md rounded-2xl p-4 shadow-xl border border-yellow-500/30 flex flex-col gap-3 font-mono text-yellow-200/80 text-xs">
              <h3 className="text-[10px] font-bold font-press-start text-yellow-300 uppercase tracking-wider text-center border-b border-yellow-500/20 pb-2">
                PLATFORMS & COLLECTIBLES
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                <div className="flex items-center gap-2.5 bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15">
                  <span className="text-yellow-400 font-bold text-sm">🏞️</span>
                  <div className="min-w-0">
                    <span className="text-yellow-300 font-bold text-[10px] block">Standard Ledge</span>
                    <p className="text-[9px] text-amber-200/60 leading-tight">Rocky mountain platform. Safe to land on.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15">
                  <span className="text-amber-400 font-bold text-sm">🪵</span>
                  <div className="min-w-0">
                    <span className="text-amber-400 font-bold text-[10px] block">Moving Log</span>
                    <p className="text-[9px] text-amber-200/60 leading-tight">Floating fallen tree log. Slides side to side.</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15">
                  <span className="text-red-400 font-bold text-sm">⚠️</span>
                  <div className="min-w-0">
                    <span className="text-red-400 font-bold text-[10px] block">Loose Rock</span>
                    <p className="text-[9px] text-amber-200/60 leading-tight">Crumbling cliff edge. Breaks when landed on!</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15">
                  <span className="text-yellow-400 font-bold text-sm">🚀</span>
                  <div className="min-w-0">
                    <span className="text-yellow-300 font-bold text-[10px] block">Spring Pad</span>
                    <p className="text-[9px] text-amber-200/60 leading-tight">Super trampoline moss. Launches you skyward!</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-[#0a0802] p-2.5 rounded-xl border border-yellow-500/15 sm:col-span-2">
                  <CoinIcon className="w-5 h-5" />
                  <div className="min-w-0">
                    <span className="text-yellow-300 font-bold text-[10px] block">Spinning Gold Coin</span>
                    <p className="text-[9px] text-amber-200/60 leading-tight">+50 score points & deposits 1 coin into your Treasury Bank for token payouts!</p>
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
