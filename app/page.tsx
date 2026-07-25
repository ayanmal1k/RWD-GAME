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

        // Save game history to Firestore
        if (primaryWallet?.address) {
          const saveRun = async () => {
            try {
              await addDoc(collection(db, 'game_history'), {
                userAddress: primaryWallet.address,
                score: finalScore,
                coins: finalCoins,
                durationSeconds: durationSeconds,
                createdAt: serverTimestamp(),
              });
              console.log("Game history saved to Firestore!");
            } catch (e) {
              console.error("Error saving game history:", e);
            }
          };
          saveRun();
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

  const handleStartRestart = () => {
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
    <main className={`${isFullscreen ? 'overflow-hidden' : 'min-h-screen'} w-full bg-gradient-to-b from-[#051a0a] via-[#0a2d14] to-[#051a0a] text-[#d4e8d5] antialiased font-sans`}>
      <ConnectWalletButton />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(30,120,40,0.3),transparent_60%)] pointer-events-none" />

      {/* Normal page header & highscore (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col items-center p-4 sm:px-8 sm:pt-8 sm:pb-0">
          <header className="mb-5 text-center select-none z-10 flex flex-col items-center gap-1">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-wider font-press-start text-transparent bg-clip-text bg-gradient-to-r from-[#4caf50] via-[#81c784] to-[#4caf50] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              $REAL Mountain Climber
            </h1>
            <p className="text-[9px] sm:text-xs font-bold text-[#50a060]/80 tracking-widest uppercase font-mono">
              How high can you climb?
            </p>
          </header>

          <div className="w-full max-w-xl flex flex-col items-center gap-4 z-10">
            <div className="w-full text-center">
              <span className="text-[9px] font-press-start text-[#407050] tracking-widest uppercase">
                Best Score: <span className="text-[#81c784]">{highScore}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Game canvas - always rendered in DOM, only styling changes */}
      <div className={isFullscreen ? 'fixed inset-0 z-50 bg-[#051a0a] flex items-center justify-center overflow-hidden' : 'w-full max-w-xl mx-auto px-4 pb-4'}>
        <div className={isFullscreen ? 'relative' : 'w-full relative bg-[#050d08] rounded-2xl p-2 shadow-[0_16px_32px_rgba(0,0,0,0.6)] border-2 border-[#103a15] overflow-hidden'} style={isFullscreen ? { width: 'min(100%, calc(100vh * 3 / 4))', aspectRatio: '3/4' } : undefined}>
          <div className={`relative overflow-hidden bg-[#0a120a] ${isFullscreen ? 'w-full h-full rounded-none' : 'aspect-[3/4] rounded-xl'}`}>
            <canvas
              ref={canvasRef}
              width={480}
              height={640}
              className="w-full h-full pixelated select-none pointer-events-none"
            />

            {/* START OVERLAY */}
            {gameState === 'START' && (
              <div className="absolute inset-0 bg-[#051a0a] flex flex-col items-center justify-center p-6 text-center text-white z-40">
                 <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider font-press-start text-transparent bg-clip-text bg-gradient-to-b from-[#81c784] to-[#4caf50] drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] mb-8">
                   $REAL CLIMBER
                 </h1>

                 <div className="relative w-32 h-32 sm:w-40 sm:h-40 mb-12">
                   <img 
                     src="/idle.png" 
                     alt="Character Idle" 
                     className="w-full h-full object-contain pixelated animate-breathe"
                   />
                   <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-16 h-3 bg-black/40 rounded-[50%] blur-sm animate-shadow-breathe"></div>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-3">
                   <button 
                     onClick={handlePlayClick}
                     className="px-8 py-4 bg-gradient-to-r from-[#4caf50] to-[#2e7d32] hover:from-[#66bb6a] hover:to-[#388e3c] text-white font-bold font-press-start text-xs sm:text-sm rounded-2xl border-4 border-[#81c784] shadow-[0_0_20px_rgba(76,175,80,0.5)] hover:shadow-[0_0_30px_rgba(76,175,80,0.8)] cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                   >
                     {primaryWallet ? "PLAY NOW" : "CONNECT TO PLAY"}
                   </button>
                   <button 
                     onClick={handleOpenHistory}
                     className="px-5 py-4 bg-[#103a15]/80 hover:bg-[#1b5e20] text-[#81c784] font-bold font-press-start text-xs rounded-2xl border-2 border-[#4caf50]/40 flex items-center justify-center gap-2 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                   >
                     <History className="w-4 h-4" />
                     HISTORY
                   </button>
                 </div>
                 {isMobile && !isFullscreen && (
                   <p className="mt-4 text-[9px] font-mono text-[#70a080]">Game will launch in fullscreen mode.</p>
                 )}
              </div>
            )}

            {/* PAUSED OVERLAY */}
            {gameState === 'PAUSED' && (
              <div className="absolute inset-0 bg-[#020a05]/85 flex flex-col items-center justify-center p-6 text-center text-white">
                <h2 className="text-lg font-extrabold font-press-start text-[#81c784] mb-2 animate-pulse">PAUSED</h2>
                <p className="text-[9px] font-mono text-[#70a080] mb-5">TAKE A BREATH</p>
                <button onClick={handlePauseResume} className="px-5 py-2.5 bg-gradient-to-r from-[#81c784] to-[#388e3c] hover:from-[#aed581] hover:to-[#4caf50] text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-[#81c784]/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">RESUME</button>
              </div>
            )}

            {/* GAME OVER OVERLAY */}
            {gameState === 'GAME_OVER' && (
              <div className="absolute inset-0 bg-[#020a05]/90 flex flex-col items-center justify-center p-6 text-center text-white z-40">
                <h2 className="text-xl font-extrabold font-press-start text-[#d04030] mb-2 drop-shadow-md">FELL!</h2>
                <p className="text-[9px] font-press-start text-[#70a080] mt-1 mb-1">SCORE: {score}</p>
                <p className="text-[9px] font-press-start text-[#81c784] mb-4">COINS: {coins}</p>
                <div className="flex gap-2 mb-3">
                  <button onClick={handleStartRestart} className="px-5 py-2.5 bg-gradient-to-r from-[#4caf50] to-[#2e7d32] hover:from-[#66bb6a] hover:to-[#388e3c] text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-[#4caf50]/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">TRY AGAIN</button>
                  <button onClick={handleOpenHistory} className="px-4 py-2.5 bg-[#103a15] hover:bg-[#1b5e20] text-[#81c784] font-bold font-press-start text-[10px] rounded-xl border border-[#4caf50]/40 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> HISTORY</button>
                </div>
              </div>
            )}

            {/* HISTORY MODAL */}
            {showHistoryModal && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[200]">
                <div className="w-full max-w-lg bg-[#051a0a] border-2 border-[#4caf50]/40 rounded-3xl p-6 shadow-[0_0_50px_rgba(76,175,80,0.3)] text-white relative flex flex-col max-h-[85vh]">
                  <div className="flex items-center justify-between pb-4 border-b border-[#4caf50]/20 mb-4">
                    <div className="flex items-center gap-2">
                      <History className="w-5 h-5 text-[#81c784]" />
                      <h3 className="text-sm font-bold font-press-start text-[#81c784]">GAME HISTORY</h3>
                    </div>
                    <button 
                      onClick={() => setShowHistoryModal(false)}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5 text-white/70" />
                    </button>
                  </div>

                  <div className="overflow-y-auto flex-1 pr-1 custom-scrollbar">
                    {isLoadingHistory ? (
                      <div className="py-12 text-center text-xs font-mono text-[#70a080] animate-pulse">
                        Loading game logs from Firestore...
                      </div>
                    ) : historyLogs.length === 0 ? (
                      <div className="py-12 text-center text-xs font-mono text-[#70a080]">
                        No game history recorded yet. Play a run!
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {historyLogs.map((item, idx) => (
                          <div 
                            key={item.id || idx}
                            className="bg-[#0a2612]/70 border border-[#4caf50]/20 rounded-xl p-3 flex items-center justify-between text-xs font-mono"
                          >
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[10px] text-[#407050] font-bold">
                                {item.userAddress ? `${item.userAddress.slice(0, 4)}...${item.userAddress.slice(-4)}` : 'Anonymous'}
                              </span>
                              <div className="flex items-center gap-3 text-white font-bold">
                                <span className="text-[#81c784] font-press-start text-[10px]">{item.score} PTS</span>
                                <span className="flex items-center gap-1 text-yellow-400 text-[10px]"><Coins className="w-3 h-3" /> {item.coins}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-[#70a080] bg-black/30 px-2.5 py-1 rounded-lg border border-white/5">
                              <Clock className="w-3 h-3 text-[#4caf50]" />
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
