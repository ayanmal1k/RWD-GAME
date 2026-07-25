'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/lib/retro-climber';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
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

  const { primaryWallet, setShowAuthFlow } = useDynamicContext();

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
              <div className="absolute inset-0 bg-[#0a0802] flex flex-col items-center justify-center p-6 text-center text-white z-40">
                 <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider font-press-start text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 via-amber-400 to-yellow-500 drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] mb-8">
                   $REAL CLIMBER
                 </h1>

                 <div className="relative w-32 h-32 sm:w-40 sm:h-40 mb-12">
                   <img 
                     src="/idle.png" 
                     alt="Character Idle" 
                     className="w-full h-full object-contain pixelated animate-breathe drop-shadow-[0_0_15px_rgba(250,204,21,0.3)]"
                   />
                   <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-black/60 rounded-[50%] blur-sm animate-shadow-breathe"></div>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-3">
                   <button 
                     onClick={handlePlayClick}
                     className="px-8 py-4 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-[#0a0802] font-bold font-press-start text-xs sm:text-sm rounded-2xl border-4 border-yellow-300 shadow-[0_0_25px_rgba(234,179,8,0.5)] hover:shadow-[0_0_35px_rgba(234,179,8,0.8)] cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                   >
                     {primaryWallet ? "PLAY NOW" : "CONNECT TO PLAY"}
                   </button>
                   <button 
                     onClick={handleOpenHistory}
                     className="px-5 py-4 bg-[#171206] hover:bg-[#261e0b] text-yellow-300 font-bold font-press-start text-xs rounded-2xl border-2 border-yellow-500/40 flex items-center justify-center gap-2 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                   >
                     <History className="w-4 h-4 text-amber-400" />
                     HISTORY
                   </button>
                   <button 
                     onClick={handleOpenLeaderboard}
                     className="px-5 py-4 bg-[#171206] hover:bg-[#261e0b] text-yellow-300 font-bold font-press-start text-xs rounded-2xl border-2 border-yellow-500/40 flex items-center justify-center gap-2 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                   >
                     <Trophy className="w-4 h-4 text-yellow-400" />
                     LEADERBOARD
                   </button>
                 </div>

                 {/* EMBEDDED LEADERBOARD PREVIEW (BELOW BUTTONS) */}
                 {leaderboardData && leaderboardData.enabled && (
                   <div className="mt-6 w-full max-w-sm bg-[#171206]/90 border border-yellow-500/30 rounded-2xl p-3 shadow-lg text-left space-y-2">
                     <div className="flex items-center justify-between text-[10px] font-press-start text-yellow-400 pb-1 border-b border-yellow-500/15">
                       <span className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-yellow-400" /> TOP CLIMBERS</span>
                       {leaderboardData.startDate && leaderboardData.endDate && (
                         <span className="text-[8px] font-mono text-amber-400/70">{leaderboardData.startDate} to {leaderboardData.endDate}</span>
                       )}
                     </div>
                     <div className="space-y-1">
                       {leaderboardData.topPlayers.slice(0, 3).map((player) => (
                         <div key={player.rank} className="flex items-center justify-between text-[10px] font-mono bg-black/40 px-2.5 py-1 rounded-lg border border-yellow-500/10">
                           <span className="font-bold text-amber-300">
                             #{player.rank} {player.userAddress.slice(0, 4)}...{player.userAddress.slice(-4)}
                           </span>
                           <span className="font-press-start text-[9px] text-yellow-400">{player.score} PTS</span>
                         </div>
                       ))}
                     </div>
                   </div>
                 )}

                 {isMobile && !isFullscreen && (
                   <p className="mt-4 text-[9px] font-mono text-amber-400/70">Game will launch in fullscreen mode.</p>
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
              <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
                <div className="w-full max-w-lg bg-[#0a0802] border-2 border-yellow-500/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(234,179,8,0.25)] text-white relative flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between pb-4 border-b border-yellow-500/20 mb-4">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-yellow-400" />
                      <h3 className="text-xs font-bold font-press-start text-yellow-300">RECENT GAME LOGS</h3>
                    </div>
                    <button 
                      onClick={() => setShowHistoryModal(false)}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-amber-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
                    {isLoadingHistory ? (
                      <div className="py-12 text-center text-xs font-mono text-amber-400/80 animate-pulse">
                        Loading game logs from Firestore...
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
                            className="bg-[#171206]/80 border border-yellow-500/20 rounded-xl p-3 flex items-center justify-between text-xs font-mono"
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
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-200/70 bg-black/40 px-2.5 py-1 rounded-lg border border-yellow-500/10">
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
              <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
                <div className="w-full max-w-lg bg-[#0a0802] border-2 border-yellow-500/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(234,179,8,0.25)] text-white relative flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between pb-4 border-b border-yellow-500/20 mb-4">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-yellow-400" />
                      <h3 className="text-xs font-bold font-press-start text-yellow-300">CLIMBER LEADERBOARD</h3>
                    </div>
                    <button 
                      onClick={() => setShowLeaderboardModal(false)}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-amber-400"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar space-y-3">
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
                          <div className="text-[10px] font-mono text-amber-400/70 bg-[#171206] px-3 py-1.5 rounded-lg border border-yellow-500/20 text-center">
                            Active Season: <span className="font-bold text-yellow-300">{leaderboardData.startDate}</span> to <span className="font-bold text-yellow-300">{leaderboardData.endDate}</span>
                          </div>
                        )}
                        {leaderboardData.topPlayers.map((player) => (
                          <div 
                            key={player.rank}
                            className={`border rounded-xl p-3 flex items-center justify-between text-xs font-mono transition-all ${
                              player.rank === 1
                                ? 'bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                : 'bg-[#171206]/80 border-yellow-500/20'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-press-start text-[10px] font-bold ${
                                player.rank === 1 ? 'bg-yellow-400 text-black' : player.rank === 2 ? 'bg-amber-300/80 text-black' : player.rank === 3 ? 'bg-amber-600/80 text-white' : 'bg-black/40 text-amber-400/70'
                              }`}>
                                #{player.rank}
                              </span>
                              <div className="flex flex-col">
                                <span className="font-bold text-yellow-200">
                                  {player.userAddress ? `${player.userAddress.slice(0, 4)}...${player.userAddress.slice(-4)}` : 'Anonymous'}
                                </span>
                                <span className="text-[10px] text-amber-400/60">{player.durationSeconds}s duration</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="font-press-start text-[11px] text-yellow-300 block">{player.score} PTS</span>
                              <span className="text-[10px] text-amber-400 font-bold">{player.coins} Coins</span>
                            </div>
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

            {/* Mobile touch controls (bottom of canvas in fullscreen) */}
            {isFullscreen && isMobile && (
              <div className="absolute bottom-0 left-0 right-0 z-40 flex items-end justify-between p-1 pb-2" style={{ touchAction: 'manipulation' }}>
                <div className="flex gap-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('left', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('left', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('left', false); }}
                    className="w-16 h-16 sm:w-20 sm:h-20 bg-black/40 border-2 border-white/20 rounded-2xl text-white text-2xl sm:text-3xl flex items-center justify-center active:bg-white/20 select-none touch-none"
                  >◀</button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('right', false); }}
                    className="w-16 h-16 sm:w-20 sm:h-20 bg-black/40 border-2 border-white/20 rounded-2xl text-white text-2xl sm:text-3xl flex items-center justify-center active:bg-white/20 select-none touch-none"
                  >▶</button>
                </div>
                <div className="flex gap-2">
                  <button
                    onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', true); }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('jump', false); }}
                    className="w-16 h-16 sm:w-20 sm:h-20 bg-black/40 border-2 border-white/20 rounded-2xl text-white text-2xl sm:text-3xl flex items-center justify-center active:bg-white/20 select-none touch-none"
                  >▲</button>
                  <button
                    onPointerDown={(e) => { e.preventDefault(); if (coins >= 20) { engineRef.current?.setKeyState('shift', true); engineRef.current?.setKeyState('jump', true); } }}
                    onPointerUp={(e) => { e.preventDefault(); engineRef.current?.setKeyState('shift', false); engineRef.current?.setKeyState('jump', false); }}
                    onPointerLeave={(e) => { e.preventDefault(); engineRef.current?.setKeyState('shift', false); engineRef.current?.setKeyState('jump', false); }}
                    className={`w-16 h-16 sm:w-20 sm:h-20 border-2 rounded-2xl text-xl sm:text-2xl flex items-center justify-center select-none touch-none font-bold ${coins >= 20 ? 'bg-black/40 border-[#81c784]/50 text-[#81c784] active:bg-[#81c784]/20 cursor-pointer' : 'bg-black/20 border-gray-700 text-gray-600 cursor-not-allowed'}`}
                  >▲▲</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panels below canvas (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col items-center px-4 sm:px-8 pb-8">
          <div className="w-full max-w-xl flex flex-col items-center gap-4 z-10">
            {/* Controls */}
            <section className="w-full bg-[#061208]/90 backdrop-blur-md rounded-xl p-3 shadow-md border border-[#103a15] flex flex-col gap-2.5 font-mono text-[#a0c0a0] text-xs">
              <h3 className="text-[10px] font-bold font-press-start text-[#81c784] uppercase tracking-wider text-center border-b border-[#103a15] pb-2">
                Controls
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50 col-span-2">
                  <span className="text-[10px]">Move</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">A</kbd>
                    <span className="text-[7px] text-[#406050] self-center">/</span>
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">D</kbd>
                    <span className="text-[7px] text-[#406050] self-center mx-0.5">or</span>
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">◀</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">▶</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50">
                  <span className="text-[10px]">Jump</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">W</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">▲</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[7px]">SPACE</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50">
                  <span className="text-[10px]">Power Jump <span className="text-[#ffd700]">(costs 20 coins)</span></span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#81c784] font-sans font-bold text-[9px]">SHIFT</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#81c784] font-sans font-bold text-[9px]">▲</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50 col-span-2">
                  <span className="text-[10px]">Start / Retry</span>
                  <kbd className="px-1.5 py-0.5 bg-[#081a0c] border border-[#103a15] rounded text-[#a0c0a0] font-sans font-bold text-[9px]">ANY KEY</kbd>
                </div>
              </div>
            </section>

            {/* Mechanics & Platforms Guide */}
            <section className="w-full bg-[#061208]/90 backdrop-blur-md rounded-xl p-3 shadow-md border border-[#103a15] flex flex-col gap-2.5 font-mono text-[#a0c0a0] text-xs">
              <h3 className="text-[10px] font-bold font-press-start text-[#81c784] uppercase tracking-wider text-center border-b border-[#103a15] pb-2">
                Platforms & Collectibles
              </h3>
              <div className="flex flex-row flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50 flex-1 min-w-[160px]">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" style={{ imageRendering: 'pixelated' }}>
                    <rect x="0" y="12" width="24" height="12" fill="#5d4037" />
                    <rect x="0" y="8" width="24" height="6" fill="#81c784" />
                    <rect x="2" y="4" width="6" height="8" fill="#4caf50" />
                    <rect x="14" y="6" width="8" height="6" fill="#4caf50" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[#81c784] font-bold text-[9px]">Standard</span>
                    <p className="text-[7px] text-[#608070] leading-tight">Rocky ledges with flowers. Safe to jump on.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50 flex-1 min-w-[160px]">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" style={{ imageRendering: 'pixelated' }}>
                    <rect x="0" y="8" width="24" height="12" rx="4" fill="#5D4037" />
                    <rect x="0" y="20" width="24" height="2" fill="#3E2723" />
                    <rect x="2" y="10" width="20" height="2" fill="#4E342E" />
                    <rect x="4" y="14" width="16" height="2" fill="#4E342E" />
                    <rect x="1" y="8" width="3" height="12" fill="#795548" />
                    <rect x="20" y="8" width="3" height="12" fill="#795548" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[#8D6E63] font-bold text-[9px]">Log</span>
                    <p className="text-[7px] text-[#608070] leading-tight">Floating fallen tree log. Moves side to side.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50 flex-1 min-w-[160px]">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" style={{ imageRendering: 'pixelated' }}>
                    <rect x="0" y="8" width="24" height="12" fill="#757575" />
                    <rect x="0" y="20" width="24" height="2" fill="#424242" />
                    <rect x="6" y="8" width="2" height="4" fill="#212121" />
                    <rect x="6" y="12" width="5" height="2" fill="#212121" />
                    <rect x="11" y="12" width="2" height="4" fill="#212121" />
                    <rect x="17" y="8" width="2" height="4" fill="#212121" />
                    <rect x="15" y="12" width="4" height="2" fill="#212121" />
                    <rect x="4" y="22" width="2" height="2" fill="#616161" />
                    <rect x="18" y="21" width="2" height="2" fill="#616161" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[#9E9E9E] font-bold text-[9px]">Loose Rock</span>
                    <p className="text-[7px] text-[#608070] leading-tight">Broken cliff edge. Crumbles when landed on!</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#020a05]/50 p-1.5 rounded-lg border border-[#0f2a15]/50 flex-1 min-w-[160px]">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" style={{ imageRendering: 'pixelated' }}>
                    <rect x="2" y="12" width="20" height="10" rx="3" fill="#64DD17" />
                    <rect x="2" y="22" width="20" height="2" fill="#33691E" />
                    <rect x="0" y="14" width="24" height="6" rx="2" fill="#76FF03" />
                    <rect x="4" y="16" width="3" height="2" fill="#B2FF59" />
                    <rect x="12" y="15" width="4" height="2" fill="#B2FF59" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[#76FF03] font-bold text-[9px]">Moss</span>
                    <p className="text-[7px] text-[#608070] leading-tight">Thick bright moss trampoline. Bounces you high!</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#020a05]/50 p-1.5 rounded-lg border border-[#81c784]/20 flex-1 min-w-[160px]">
                  <div className="w-5 h-5 shrink-0 rounded-full" style={{ backgroundImage: 'url(/coin.png)', backgroundSize: '600% 100%', backgroundPosition: '0% 0%', imageRendering: 'pixelated' }} />
                  <div className="min-w-0">
                    <span className="text-[#ffd700] font-bold text-[9px]">Gold Coin</span>
                    <p className="text-[7px] text-[#608070] leading-tight">+50 pts. Spend 20 for Mega Jump!</p>
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
