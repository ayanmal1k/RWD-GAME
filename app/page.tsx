'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '@/lib/retro-climber';
import {
  Pause,
  Volume2,
  VolumeX,
  Trophy,
  Maximize2,
  Minimize2
} from 'lucide-react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'>('START');
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
      onGameOver: (finalScore) => {
        const currentHigh = parseInt(localStorage.getItem('omu_crazy_climber_high_score') || '0', 10);
        if (finalScore > currentHigh) {
          localStorage.setItem('omu_crazy_climber_high_score', finalScore.toString());
          setHighScore(finalScore);
        }
      }
    });

    engineRef.current = engine;
    engine.audio.setMute(isMuted);

    return () => {
      engine.cleanUp();
    };
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.audio.setMute(isMuted);
    }
  }, [isMuted]);

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
    <main className={`${isFullscreen ? 'overflow-hidden' : 'min-h-screen'} w-full bg-gradient-to-b from-[#1a0505] via-[#2d0a0a] to-[#1a0505] text-[#e8d5c4] antialiased font-sans`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(120,30,30,0.3),transparent_60%)] pointer-events-none" />

      {/* Normal page header & highscore (hidden in fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col items-center p-4 sm:px-8 sm:pt-8 sm:pb-0">
          <header className="mb-5 text-center select-none z-10 flex flex-col items-center gap-1">
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-wider font-press-start text-transparent bg-clip-text bg-gradient-to-r from-[#e85d3a] via-[#f4a259] to-[#e85d3a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
              OMU CRAZY CLIMBER
            </h1>
            <p className="text-[9px] sm:text-xs font-bold text-[#a06050]/80 tracking-widest uppercase font-mono">
              How high can you climb?
            </p>
          </header>

          <div className="w-full max-w-xl flex flex-col items-center gap-4 z-10">
            <div className="w-full text-center">
              <span className="text-[9px] font-press-start text-[#705040] tracking-widest uppercase">
                Best Score: <span className="text-[#f4a259]">{highScore}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Game canvas - always rendered in DOM, only styling changes */}
      <div className={isFullscreen ? 'fixed inset-0 z-50 bg-[#1a0505] flex items-center justify-center overflow-hidden' : 'w-full max-w-xl mx-auto px-4 pb-4'}>
        <div className={isFullscreen ? 'relative' : 'w-full relative bg-[#0d0505] rounded-2xl p-2 shadow-[0_16px_32px_rgba(0,0,0,0.6)] border-2 border-[#3a1510] overflow-hidden'} style={isFullscreen ? { width: 'min(100%, calc(100vh * 3 / 4))', aspectRatio: '3/4' } : undefined}>
          <div className={`relative overflow-hidden bg-[#0a0a12] ${isFullscreen ? 'w-full h-full rounded-none' : 'aspect-[3/4] rounded-xl'}`}>
            <canvas
              ref={canvasRef}
              width={480}
              height={640}
              className="w-full h-full pixelated select-none pointer-events-none"
            />

            {/* START OVERLAY */}
            {gameState === 'START' && (
              <div className="absolute inset-0 bg-[#0a0202]/85 flex flex-col items-center justify-center p-6 text-center text-white">
                {isMobile && !isFullscreen ? (
                  <>
                    <h2 className="text-lg font-extrabold font-press-start text-[#f4a259] mb-2">TAP TO PLAY</h2>
                    <p className="text-[9px] font-mono text-[#a08070] mb-5 max-w-xs leading-relaxed">Enter fullscreen to start climbing!</p>
                    <button onClick={toggleFullscreen} className="px-5 py-2.5 bg-gradient-to-r from-[#e85d3a] to-[#c04020] hover:from-[#f06d4a] hover:to-[#d05030] text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-[#e85d3a]/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">ENTER FULLSCREEN</button>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-extrabold font-press-start text-[#f4a259] mb-2">READY TO CLIMB?</h2>
                    <p className="text-[9px] font-mono text-[#a08070] mb-5 uppercase max-w-xs leading-relaxed">Use A/D or arrows to move. Collect coins and climb higher!</p>
                    <p className="text-[7px] font-mono text-[#705040] mb-3">Press any key to start</p>
                    <button onClick={handleStartRestart} className="px-5 py-2.5 bg-gradient-to-r from-[#e85d3a] to-[#c04020] hover:from-[#f06d4a] hover:to-[#d05030] text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-[#e85d3a]/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">PLAY NOW</button>
                  </>
                )}
              </div>
            )}

            {/* PAUSED OVERLAY */}
            {gameState === 'PAUSED' && (
              <div className="absolute inset-0 bg-[#0a0202]/85 flex flex-col items-center justify-center p-6 text-center text-white">
                <h2 className="text-lg font-extrabold font-press-start text-[#f4a259] mb-2 animate-pulse">PAUSED</h2>
                <p className="text-[9px] font-mono text-[#a08070] mb-5">TAKE A BREATH</p>
                <button onClick={handlePauseResume} className="px-5 py-2.5 bg-gradient-to-r from-[#f4a259] to-[#d08030] hover:from-[#f5b269] hover:to-[#e09040] text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-[#f4a259]/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">RESUME</button>
              </div>
            )}

            {/* GAME OVER OVERLAY */}
            {gameState === 'GAME_OVER' && (
              <div className="absolute inset-0 bg-[#0a0202]/90 flex flex-col items-center justify-center p-6 text-center text-white">
                <h2 className="text-xl font-extrabold font-press-start text-[#d04030] mb-2 drop-shadow-md">FELL!</h2>
                <p className="text-[9px] font-press-start text-[#a08070] mt-1 mb-1">SCORE: {score}</p>
                <p className="text-[9px] font-press-start text-[#f4a259] mb-5">COINS: {coins}</p>
                <p className="text-[7px] font-mono text-[#705040] mb-3">Press W / ▲ / Space to retry</p>
                <button onClick={handleStartRestart} className="px-5 py-2.5 bg-gradient-to-r from-[#d04030] to-[#a03020] hover:from-[#e05040] hover:to-[#b04030] text-white font-bold font-press-start text-[10px] rounded-xl border-2 border-[#d04030]/50 shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 transition-all">TRY AGAIN</button>
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
                    className={`w-16 h-16 sm:w-20 sm:h-20 border-2 rounded-2xl text-xl sm:text-2xl flex items-center justify-center select-none touch-none font-bold ${coins >= 20 ? 'bg-black/40 border-[#f4a259]/50 text-[#f4a259] active:bg-[#f4a259]/20 cursor-pointer' : 'bg-black/20 border-gray-700 text-gray-600 cursor-not-allowed'}`}
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
            <section className="w-full bg-[#120606]/90 backdrop-blur-md rounded-xl p-3 shadow-md border border-[#3a1510] flex flex-col gap-2.5 font-mono text-[#c0a090] text-xs">
              <h3 className="text-[10px] font-bold font-press-start text-[#f4a259] uppercase tracking-wider text-center border-b border-[#3a1510] pb-2">
                Controls
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50 col-span-2">
                  <span className="text-[10px]">Move</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">A</kbd>
                    <span className="text-[7px] text-[#605040] self-center">/</span>
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">D</kbd>
                    <span className="text-[7px] text-[#605040] self-center mx-0.5">or</span>
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">◀</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">▶</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50">
                  <span className="text-[10px]">Jump</span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">W</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">▲</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[7px]">SPACE</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50">
                  <span className="text-[10px]">Power Jump <span className="text-[#ffd700]">(costs 20 coins)</span></span>
                  <div className="flex gap-0.5">
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#f4a259] font-sans font-bold text-[9px]">SHIFT</kbd>
                    <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#f4a259] font-sans font-bold text-[9px]">▲</kbd>
                  </div>
                </div>
                <div className="flex items-center justify-between bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50 col-span-2">
                  <span className="text-[10px]">Start / Retry</span>
                  <kbd className="px-1.5 py-0.5 bg-[#1a0808] border border-[#3a1510] rounded text-[#c0a090] font-sans font-bold text-[9px]">ANY KEY</kbd>
                </div>
              </div>
            </section>

            {/* Mechanics & Platforms Guide */}
            <section className="w-full bg-[#120606]/90 backdrop-blur-md rounded-xl p-3 shadow-md border border-[#3a1510] flex flex-col gap-2.5 font-mono text-[#c0a090] text-xs">
              <h3 className="text-[10px] font-bold font-press-start text-[#f4a259] uppercase tracking-wider text-center border-b border-[#3a1510] pb-2">
                Platforms & Collectibles
              </h3>
              <div className="flex flex-row flex-wrap gap-2">
                <div className="flex items-center gap-2 bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50 flex-1 min-w-[160px]">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" style={{ imageRendering: 'pixelated' }}>
                    <rect x="0" y="8" width="24" height="16" fill="#5d4037" />
                    <rect x="0" y="8" width="24" height="4" fill="#4caf50" />
                    <rect x="2" y="8" width="6" height="5" fill="#2e7d32" />
                    <rect x="16" y="8" width="6" height="5" fill="#2e7d32" />
                    <rect x="0" y="22" width="24" height="2" fill="#3e2723" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[#4caf50] font-bold text-[9px]">Standard</span>
                    <p className="text-[7px] text-[#807060] leading-tight">Mossy grass-topped dirt blocks. Safe to jump on.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50 flex-1 min-w-[160px]">
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
                    <p className="text-[7px] text-[#807060] leading-tight">Floating fallen tree log. Moves side to side.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50 flex-1 min-w-[160px]">
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
                    <p className="text-[7px] text-[#807060] leading-tight">Broken cliff edge. Crumbles when landed on!</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#2a0f0a]/50 flex-1 min-w-[160px]">
                  <svg width="20" height="20" viewBox="0 0 24 24" className="shrink-0" style={{ imageRendering: 'pixelated' }}>
                    <rect x="2" y="12" width="20" height="10" rx="3" fill="#64DD17" />
                    <rect x="2" y="22" width="20" height="2" fill="#33691E" />
                    <rect x="0" y="14" width="24" height="6" rx="2" fill="#76FF03" />
                    <rect x="4" y="16" width="3" height="2" fill="#B2FF59" />
                    <rect x="12" y="15" width="4" height="2" fill="#B2FF59" />
                  </svg>
                  <div className="min-w-0">
                    <span className="text-[#76FF03] font-bold text-[9px]">Moss</span>
                    <p className="text-[7px] text-[#807060] leading-tight">Thick bright moss trampoline. Bounces you high!</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-[#0a0202]/50 p-1.5 rounded-lg border border-[#f4a259]/20 flex-1 min-w-[160px]">
                  <div className="w-5 h-5 shrink-0 rounded-full" style={{ backgroundImage: 'url(/coin.png)', backgroundSize: '600% 100%', backgroundPosition: '0% 0%', imageRendering: 'pixelated' }} />
                  <div className="min-w-0">
                    <span className="text-[#ffd700] font-bold text-[9px]">Gold Coin</span>
                    <p className="text-[7px] text-[#807060] leading-tight">+50 pts. Spend 20 for Shift mega jump!</p>
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
