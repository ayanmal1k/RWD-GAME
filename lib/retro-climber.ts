/**
 * Retro Climber 2D Game Engine
 * Features:
 * - HTML5 Canvas 2D pixelated rendering
 * - Web Audio API retro sound effects & background chiptune synthesizer
 * - Procedural platforms (Standard, Moving, Crumbling, Spring)
 * - Custom pixel-art platform renderers
 * - Coin collection and score calculations (1 score = 10px climbed)
 * - Sprite animation (6 frames walk/coin, idle & jump on frame 1)
 * - Parallax scrolling background (ground.png at bottom, sky.png stacked above)
 */

export interface GameEngineCallbacks {
  onScoreChange: (score: number) => void;
  onCoinChange: (coins: number) => void;
  onStateChange: (state: 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER') => void;
  onGameOver: (finalScore: number, finalCoins: number, durationSeconds: number) => void;
}

export type CharacterId = 'red' | 'blue' | 'orange' | 'green';

export interface CharacterConfig {
  id: CharacterId;
  idleSrc: string;
  jumpSrc: string;
  walkSrc: string;
}

export const CHARACTERS: Record<CharacterId, CharacterConfig> = {
  red: {
    id: 'red',
    idleSrc: '/characters/red/5.png',
    jumpSrc: '/characters/red/6.png',
    walkSrc: '/characters/red/red.png',
  },
  blue: {
    id: 'blue',
    idleSrc: '/characters/blue/7.png',
    jumpSrc: '/characters/blue/8.png',
    walkSrc: '/characters/blue/blue.png',
  },
  orange: {
    id: 'orange',
    idleSrc: '/characters/orange/9.png',
    jumpSrc: '/characters/orange/10.png',
    walkSrc: '/characters/orange/orange.png',
  },
  green: {
    id: 'green',
    idleSrc: '/characters/green/11.png',
    jumpSrc: '/characters/green/12.png',
    walkSrc: '/characters/green/green.png',
  },
};

export const CHARACTER_LIST: CharacterConfig[] = [
  CHARACTERS.red,
  CHARACTERS.blue,
  CHARACTERS.orange,
  CHARACTERS.green,
];

type PlatformType = 'STANDARD' | 'MOVING' | 'CRUMBLING' | 'SPRING';

interface Platform {
  id: number;
  x: number;
  y: number; // World coordinates (Y increases as you go UP)
  width: number;
  height: number;
  type: PlatformType;
  vx: number; // Horizontal velocity for moving platforms
  crumbleTimer?: number; // Count down to crumble
  crumbled?: boolean;
  springTimer?: number; // Animation timer for spring compression
  springState?: 'idle' | 'compressed' | 'extended';
  shakeOffset?: number;
  rockyImg?: number; // 5, 13, or 17
}

interface Coin {
  id: number;
  x: number;
  y: number; // World coordinates
  width: number;
  height: number;
  frame: number;
  frameTimer: number;
  active: boolean;
}

interface MarioNpc {
  id: number;
  platformId: number;
  xOffset: number;
  y: number;
  width: number;
  height: number;
  touched: boolean;
  state: 'waiting' | 'cheering';
  frame: number;
  frameTimer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity?: boolean;
  text?: string;
}

// Retro Sound Synthesizer using Web Audio API
class SoundSystem {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private musicInterval: any = null;
  private musicTempo = 180; // BPM
  private musicBeat = 0;
  private musicNotes = [
    // Simple happy retro climbing theme (Arpeggio in C Major and A Minor)
    329.63, 392.00, 523.25, 493.88, 392.00, 440.00, 493.88, 392.00, // E4, G4, C5, B4, G4, A4, B4, G4
    349.23, 440.00, 392.00, 329.63, 293.66, 329.63, 261.63, 293.66, // F4, A4, G4, E4, D4, E4, C4, D4
    329.63, 392.00, 523.25, 587.33, 659.25, 523.25, 587.33, 493.88, // E4, G4, C5, D5, E5, C5, D5, B4
    440.00, 523.25, 493.88, 440.00, 392.00, 293.66, 329.63, 261.63  // A4, C5, B4, A4, G4, D4, E4, C4
  ];

  constructor() {
    // Init Audio Context on first interaction
  }

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setMute(mute: boolean) {
    this.isMuted = mute;
    if (mute) {
      this.stopMusic();
    } else {
      this.initCtx();
      this.startMusic();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public playJump() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(800, time + 0.15);

    gain.gain.setValueAtTime(0.15, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  public playCoin() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Arpeggio: B5 then E6
    osc.frequency.setValueAtTime(987.77, time);
    osc.frequency.setValueAtTime(1318.51, time + 0.08);

    gain.gain.setValueAtTime(0.1, time);
    gain.gain.setValueAtTime(0.1, time + 0.08);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.25);
  }

  public playMario() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    const notes = [392.00, 523.25, 659.25, 783.99]; // G4, C5, E5, G5
    notes.forEach((freq, idx) => {
      osc.frequency.setValueAtTime(freq, time + idx * 0.08);
    });

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.linearRampToValueAtTime(0.01, time + notes.length * 0.08 + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + notes.length * 0.08 + 0.1);
  }

  public playSpring() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(1500, time + 0.3);

    gain.gain.setValueAtTime(0.12, time);
    gain.gain.linearRampToValueAtTime(0.01, time + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.35);
  }

  public playCrumble() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;

    const time = this.ctx.currentTime;
    
    // Retro rock crack: a few sharp, low-pitched square wave pops
    const makeCrack = (t: number, pitch: number, vol: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(pitch, t);
      // Rapid pitch drop creates a "thud" or "crunch" impact
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.1, t + 0.06);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(vol, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
      
      // Lowpass filter to remove the harsh synthetic buzz and make it sound chunky like stone
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, t);
      filter.frequency.linearRampToValueAtTime(300, t + 0.06);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx!.destination);
      
      osc.start(t);
      osc.stop(t + 0.06);
    };
    
    // Staggered popping impacts to simulate stone fracturing
    makeCrack(time, 400, 0.15);
    makeCrack(time + 0.04, 250, 0.2);
    makeCrack(time + 0.1, 150, 0.25);
    makeCrack(time + 0.16, 100, 0.15);
  }

  public playGameOver() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;

    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    // Descending tones
    const notes = [293.66, 261.63, 220.00, 196.00, 146.83];
    notes.forEach((freq, idx) => {
      osc.frequency.setValueAtTime(freq, time + idx * 0.15);
    });

    gain.gain.setValueAtTime(0.15, time);
    gain.gain.linearRampToValueAtTime(0.01, time + notes.length * 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + notes.length * 0.15);
  }

  public startMusic() {
    this.initCtx();
    if (this.isMuted || !this.ctx) return;
    if (this.musicInterval) return;

    const stepTime = 60 / this.musicTempo; // Duration of a single note
    this.musicInterval = setInterval(() => {
      if (!this.ctx || this.isMuted) return;

      const time = this.ctx.currentTime;
      const noteFreq = this.musicNotes[this.musicBeat];
      this.musicBeat = (this.musicBeat + 1) % this.musicNotes.length;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(noteFreq, time);

      // Cute short pluck sound
      gain.gain.setValueAtTime(0.04, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + stepTime - 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(time);
      osc.stop(time + stepTime);
    }, stepTime * 1000);
  }

  public stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  public cleanUp() {
    this.stopMusic();
  }
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameEngineCallbacks;

  // Assets
  private characterSprites: Record<CharacterId, { walk: HTMLImageElement; idle: HTMLImageElement; jump: HTMLImageElement }> = {
    red: { walk: new Image(), idle: new Image(), jump: new Image() },
    blue: { walk: new Image(), idle: new Image(), jump: new Image() },
    orange: { walk: new Image(), idle: new Image(), jump: new Image() },
    green: { walk: new Image(), idle: new Image(), jump: new Image() },
  };
  private currentCharacterId: CharacterId = 'red';
  private walkSprite = new Image();
  private idleSprite = new Image();
  private jumpSprite = new Image();
  private coinSprite = new Image();
  private groundBg = new Image();
  private skyBg = new Image();
  private sky2Bg = new Image();
  private rockyBg = new Image();
  private mossBg = new Image();
  private pipeBg = new Image();
  private crumblingBg = new Image();
  private rocky5Bg = new Image();
  private rocky13Bg = new Image();
  private rocky17Bg = new Image();
  private marioWaitingImg = new Image();
  private marioCheerImg = new Image();
  private assetsLoaded = false;

  public setCharacter(id: CharacterId) {
    this.currentCharacterId = id;
    const sprites = this.characterSprites[id];
    if (sprites) {
      this.walkSprite = sprites.walk;
      this.idleSprite = sprites.idle;
      this.jumpSprite = sprites.jump;
    }
  }

  public getCharacter(): CharacterId {
    return this.currentCharacterId;
  }

  // Sound System
  public audio: SoundSystem;

  // Game Loop
  private animId: number | null = null;
  private state: 'START' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' = 'START';

  // Game Variables
  public score = 0;
  public coinsCount = 0;
  private cameraY = 0; // Camera offset (Y goes up)
  private maxWorldY = 0; // Highest altitude reached
  private nextPlatformId = 1;

  // Player Settings (Logical sizing)
  private player = {
    x: 0,
    y: 100, // World Y coordinate
    vx: 0,
    vy: 0, // Vertical velocity
    width: 56,
    height: 56,
    facingRight: true,
    onGround: false,
    walkFrame: 0,
    walkFrameTime: 0,
    jumpDustSpawned: false
  };

  // World physics properties
  private readonly gravity = 0.38;
  private readonly friction = 0.80;
  private readonly acceleration = 0.45;
  private readonly maxSpeedX = 3.8;
  private readonly jumpStrength = -10.0;
  private readonly powerJumpStrength = -16.0;
  private readonly springStrength = -16.5;

  // Game Objects
  private platforms: Platform[] = [];
  private coins: Coin[] = [];
  private marios: MarioNpc[] = [];
  private particles: Particle[] = [];

  // Inputs
  private keys = { left: false, right: false, jump: false, shift: false };

  // Screen shake
  private shakeTime = 0;
  private shakeAmount = 0;
  private gameStartTime = 0;

  constructor(canvas: HTMLCanvasElement, callbacks: GameEngineCallbacks) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get Canvas 2D Context');
    this.ctx = context;
    this.callbacks = callbacks;
    this.audio = new SoundSystem();

    // Pre-fill canvas with dark background so no white flash before assets load
    this.ctx.fillStyle = '#0a0a12';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.initInputs();
    this.loadAssets();
  }

  private loadAssets() {
    const charEntries = Object.entries(CHARACTERS) as [CharacterId, CharacterConfig][];
    const totalAssets = charEntries.length * 3 + 13;
    let loaded = 0;

    const onAssetLoad = () => {
      loaded++;
      if (loaded >= totalAssets) {
        this.assetsLoaded = true;
        this.setCharacter(this.currentCharacterId);
        this.resetGame();
        this.drawStartScreen();
      }
    };

    const handleLoadError = (name: string, fallbackColor: string, src: string) => {
      console.warn(`Asset failed to load: ${src}. Generating pixelated fallback.`);
      // Create colored dummy image
      const canvas = document.createElement('canvas');
      const isSpriteSheet = name.startsWith('walk') || name === 'coin' || name.startsWith('mario');
      canvas.width = isSpriteSheet ? (name.startsWith('mario') ? 512 : (name === 'coin' ? 1536 : 1536)) : (name.startsWith('idle') || name.startsWith('jump')) ? 256 : 937;
      canvas.height = isSpriteSheet ? 256 : (name.startsWith('idle') || name.startsWith('jump')) ? 256 : 1678;
      const ctx = canvas.getContext('2d')!;
      
      if (name.startsWith('walk')) {
        // Draw 6 frames of character walking
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = fallbackColor;
          ctx.fillRect(i * 256 + 64, 64, 128, 128); // main character body
          ctx.fillStyle = '#000000';
          ctx.fillRect(i * 256 + 140, 90, 20, 20); // eyes
          // Little legs
          ctx.fillStyle = '#ff3f80';
          ctx.fillRect(i * 256 + 80 + (i % 2) * 20, 192, 30, 40);
          ctx.fillRect(i * 256 + 140 - (i % 2) * 20, 192, 30, 40);
        }
      } else if (name.startsWith('idle') || name.startsWith('jump')) {
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(64, 64, 128, 128);
        ctx.fillStyle = '#000000';
        ctx.fillRect(140, 90, 20, 20);
        ctx.fillStyle = '#ff3f80';
        ctx.fillRect(100, 192, 30, 40);
        ctx.fillRect(130, 192, 30, 40);
      } else if (name === 'coin') {
        // Draw 6 frames of spinning golden coin
        for (let i = 0; i < 6; i++) {
          const coinWidth = Math.max(30, 256 - (i % 6) * 40);
          const xOffset = i * 256 + (256 - coinWidth) / 2;
          ctx.fillStyle = fallbackColor;
          ctx.beginPath();
          ctx.ellipse(xOffset + coinWidth / 2, 128, coinWidth / 2, 110, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#d4af37';
          ctx.lineWidth = 12;
          ctx.stroke();
        }
      } else if (name.startsWith('mario')) {
        // Draw 2 frames of Mario
        for (let i = 0; i < 2; i++) {
          ctx.fillStyle = fallbackColor;
          ctx.fillRect(i * 256 + 64, 64, 128, 128);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(i * 256 + 96, 96, 64, 64);
        }
      } else {
        // Backgrounds
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Add random pattern
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        for (let idx = 0; idx < 40; idx++) {
          ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 40, 40);
        }
      }

      const img = new Image();
      img.src = canvas.toDataURL();
      img.onload = () => {
        if (name.startsWith('walk-')) {
          const charId = name.replace('walk-', '') as CharacterId;
          if (this.characterSprites[charId]) this.characterSprites[charId].walk = img;
        } else if (name.startsWith('idle-')) {
          const charId = name.replace('idle-', '') as CharacterId;
          if (this.characterSprites[charId]) this.characterSprites[charId].idle = img;
        } else if (name.startsWith('jump-')) {
          const charId = name.replace('jump-', '') as CharacterId;
          if (this.characterSprites[charId]) this.characterSprites[charId].jump = img;
        } else if (name === 'coin') this.coinSprite = img;
        else if (name === 'ground') this.groundBg = img;
        else if (name === 'sky') this.skyBg = img;
        else if (name === 'sky2') this.sky2Bg = img;
        else if (name === 'rocky') this.rockyBg = img;
        else if (name === 'moss') this.mossBg = img;
        else if (name === 'pipe') this.pipeBg = img;
        else if (name === 'crumbling') this.crumblingBg = img;
        else if (name === 'rocky-5') this.rocky5Bg = img;
        else if (name === 'rocky-13') this.rocky13Bg = img;
        else if (name === 'rocky-17') this.rocky17Bg = img;
        else if (name === 'mario-waiting') this.marioWaitingImg = img;
        else if (name === 'mario-cheer') this.marioCheerImg = img;
        onAssetLoad();
      };
    };

    // Load Character Sprites for all 4 characters
    for (const [id, cfg] of charEntries) {
      const sprites = this.characterSprites[id];
      sprites.walk.src = cfg.walkSrc;
      sprites.walk.onload = onAssetLoad;
      sprites.walk.onerror = () => handleLoadError(`walk-${id}`, '#ec4899', cfg.walkSrc);

      sprites.idle.src = cfg.idleSrc;
      sprites.idle.onload = onAssetLoad;
      sprites.idle.onerror = () => handleLoadError(`idle-${id}`, '#a78bfa', cfg.idleSrc);

      sprites.jump.src = cfg.jumpSrc;
      sprites.jump.onload = onAssetLoad;
      sprites.jump.onerror = () => handleLoadError(`jump-${id}`, '#f472b6', cfg.jumpSrc);
    }

    // Load Coin Sprite
    this.coinSprite.src = '/coin.png';
    this.coinSprite.onload = onAssetLoad;
    this.coinSprite.onerror = () => handleLoadError('coin', '#ffd700', '/coin.png');

    // Load Ground Background
    this.groundBg.src = '/ground.png';
    this.groundBg.onload = onAssetLoad;
    this.groundBg.onerror = () => handleLoadError('ground', '#1e293b', '/ground.png');

    // Load Sky Background
    this.skyBg.src = '/sky.png';
    this.skyBg.onload = onAssetLoad;
    this.skyBg.onerror = () => handleLoadError('sky', '#0284c7', '/sky.png');

    // Load Sky2 Background (used for index >= 2)
    this.sky2Bg.src = '/sky2.png';
    this.sky2Bg.onload = onAssetLoad;
    this.sky2Bg.onerror = () => handleLoadError('sky2', '#1e3a5f', '/sky2.png');

    // Load Rocky Background
    this.rockyBg.src = '/rocky.png';
    this.rockyBg.onload = onAssetLoad;
    this.rockyBg.onerror = () => handleLoadError('rocky', '#5d4037', '/rocky.png');

    // Load Moss Background
    this.mossBg.src = '/moss.png';
    this.mossBg.onload = onAssetLoad;
    this.mossBg.onerror = () => handleLoadError('moss', '#64DD17', '/moss.png');

    // Load Pipe Background
    this.pipeBg.src = '/pipe-64x256.png';
    this.pipeBg.onload = onAssetLoad;
    this.pipeBg.onerror = () => handleLoadError('pipe', '#2e7d32', '/pipe-64x256.png');

    // Load Crumbling Background
    this.crumblingBg.src = '/breaking-stone.png';
    this.crumblingBg.onload = onAssetLoad;
    this.crumblingBg.onerror = () => handleLoadError('crumbling', '#757575', '/breaking-stone.png');

    // Load new rocky platforms
    this.rocky5Bg.src = '/rocky-5.png';
    this.rocky5Bg.onload = onAssetLoad;
    this.rocky5Bg.onerror = () => handleLoadError('rocky-5', '#5d4037', '/rocky-5.png');

    this.rocky13Bg.src = '/rocky-13.png';
    this.rocky13Bg.onload = onAssetLoad;
    this.rocky13Bg.onerror = () => handleLoadError('rocky-13', '#5d4037', '/rocky-13.png');

    this.rocky17Bg.src = '/rocky-17.png';
    this.rocky17Bg.onload = onAssetLoad;
    this.rocky17Bg.onerror = () => handleLoadError('rocky-17', '#5d4037', '/rocky-17.png');

    // Load Mario Sprites
    this.marioWaitingImg.src = '/cartoons/mario/waiting_mario.png';
    this.marioWaitingImg.onload = onAssetLoad;
    this.marioWaitingImg.onerror = () => handleLoadError('mario-waiting', '#ef4444', '/cartoons/mario/waiting_mario.png');

    this.marioCheerImg.src = '/cartoons/mario/cheer_mario.png';
    this.marioCheerImg.onload = onAssetLoad;
    this.marioCheerImg.onerror = () => handleLoadError('mario-cheer', '#ef4444', '/cartoons/mario/cheer_mario.png');
  }

  private initInputs() {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'KeyW', 'KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault(); // Stop page scrolling
      }

      // Start/restart game handled through React UI and space listener
      if (this.state === 'START' || this.state === 'GAME_OVER') {
        return;
      }

      if (this.state !== 'PLAYING') return;

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.shift = true;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.keys.jump = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.shift = false;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') this.keys.jump = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  // Set keyboard inputs from external buttons/touch pads
  public setKeyState(key: 'left' | 'right' | 'jump' | 'shift', pressed: boolean) {
    if (this.state === 'PLAYING') {
      this.keys[key] = pressed;
    }
  }

  public startGame() {
    if (this.state === 'START' || this.state === 'GAME_OVER') {
      this.resetGame();
      this.gameStartTime = Date.now();
      this.state = 'PLAYING';
      this.callbacks.onStateChange(this.state);
      this.audio.playJump();
      if (!this.audio.getMuted()) {
        this.audio.startMusic();
      }
      this.animId = requestAnimationFrame(this.gameLoop);
    }
  }

  public pauseGame() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      this.callbacks.onStateChange(this.state);
      this.audio.stopMusic();
      if (this.animId) cancelAnimationFrame(this.animId);
    }
  }

  public resumeGame() {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.callbacks.onStateChange(this.state);
      if (!this.audio.getMuted()) {
        this.audio.startMusic();
      }
      this.lastFrameTs = 0;
      this.accumulator = 0;
      this.animId = requestAnimationFrame(this.gameLoop);
    }
  }

  public forceStop() {
    this.state = 'START';
    this.callbacks.onStateChange(this.state);
    this.audio.stopMusic();
    if (this.animId) cancelAnimationFrame(this.animId);
    this.resetGame();
    this.drawStartScreen();
  }

  public triggerGameOver() {
    this.state = 'GAME_OVER';
    this.callbacks.onStateChange(this.state);
    this.audio.stopMusic();
    this.audio.playGameOver();
    const durationSeconds = Math.max(1, Math.round((Date.now() - (this.gameStartTime || Date.now())) / 1000));
    this.callbacks.onGameOver(this.score, this.coinsCount, durationSeconds);
    if (this.animId) cancelAnimationFrame(this.animId);
    this.drawGameOverScreen();
  }

  private resetGame() {
    this.score = 0;
    this.coinsCount = 0;
    this.cameraY = 0;
    this.nextPlatformId = 1;
    this.shakeTime = 0;
    this.shakeAmount = 0;
    this.lastFrameTs = 0;

    // Reset Player
    const groundHeight = Math.round(163 * (this.canvas.width / 937));
    // Character should stand 18px lower into the grass on the ground
    const groundCollisionY = groundHeight - 18; 
    this.player.x = this.canvas.width / 2 - this.player.width / 2;
    this.player.y = groundCollisionY + this.player.height; // Stand on bottom ground dynamically
    this.maxWorldY = this.player.y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facingRight = true;
    this.player.onGround = true;
    this.player.walkFrame = 0;
    this.player.walkFrameTime = 0;
    this.player.jumpDustSpawned = false;

    this.keys = { left: false, right: false, jump: false, shift: false };
    this.platforms = [];
    this.coins = [];
    this.marios = [];
    this.particles = [];

    // 1. Bottom Starting Ground Platform (spanning entire canvas width)
    this.platforms.push({
      id: this.nextPlatformId++,
      x: 0,
      y: groundCollisionY, // Ground top collision sits 20px below visual grass top
      width: this.canvas.width,
      height: groundHeight,
      type: 'STANDARD',
      vx: 0
    });

    // Populate initial platforms
    this.generatePlatforms(0, this.canvas.height + 400);

    // Callbacks
    this.callbacks.onScoreChange(this.score);
    this.callbacks.onCoinChange(this.coinsCount);
  }

  // Generate platforms between yMin and yMax
  private generatePlatforms(yMin: number, yMax: number) {
    const groundHeight = Math.round(163 * (this.canvas.width / 937));
    let currentY = yMin === 0 ? groundHeight + 90 : yMin;
    const minHorizontalGap = 40;
    const maxHorizontalGap = this.canvas.width - 150;

    while (currentY < yMax) {
      // Platform width narrows as altitude increases
      const minWidth = Math.max(50, 160 - (currentY / 150));
      const maxWidth = Math.max(70, 220 - (currentY / 100));
      const width = minWidth + Math.random() * (maxWidth - minWidth);

      // Random position
      const x = Math.random() * (this.canvas.width - width);

      // Decide platform type based on altitude (y)
      let type: PlatformType = 'STANDARD';
      const rand = Math.random() * 100;

      if (currentY > 1500) {
        // High altitude: introduces moving, spring and crumbling platforms
        // Crumbling chance increases with altitude
        const crumblingChance = Math.min(40, 15 + (currentY - 1500) / 60);
        if (rand < 25) {
          type = 'MOVING';
        } else if (rand < 25 + crumblingChance) {
          type = 'CRUMBLING';
        } else if (rand < 33 + crumblingChance) {
          type = 'SPRING';
        }
      } else if (currentY > 600) {
        // Mid altitude: introduces moving & spring platforms
        if (rand < 15) {
          type = 'MOVING';
        } else if (rand < 22) {
          type = 'SPRING';
        }
      }

      const vx = type === 'MOVING' ? (Math.random() > 0.5 ? 1.5 : -1.5) * (1 + (currentY / 4000)) : 0;

      let rockyImg = 0;
      if (type === 'STANDARD' && width >= 100) {
        const choices = [5, 13, 17];
        rockyImg = choices[Math.floor(Math.random() * choices.length)];
      }

      const platformId = this.nextPlatformId++;
      this.platforms.push({
        id: platformId,
        x,
        y: currentY,
        width,
        height: 18,
        type,
        vx,
        springState: type === 'SPRING' ? 'idle' : undefined,
        rockyImg: rockyImg
      });

      // Mario Spawning (10% chance on moving pipe platforms)
      let hasMario = false;
      if (type === 'MOVING' && Math.random() < 0.10) {
        hasMario = true;
        const marioSize = 54;
        this.marios.push({
          id: this.nextPlatformId++,
          platformId: platformId,
          xOffset: Math.max(0, (width - marioSize) / 2),
          y: currentY + marioSize,
          width: marioSize,
          height: marioSize,
          touched: false,
          state: 'waiting',
          frame: 0,
          frameTimer: Math.random() * 2
        });
      }

      // Coin Spawning on Standard/Moving platforms (if Mario is not on it)
      if (type !== 'CRUMBLING' && !hasMario && Math.random() < 0.28) {
        this.coins.push({
          id: this.nextPlatformId++,
          x: x + width / 2 - 14,
          y: currentY + 30, // slightly above platform top
          width: 28,
          height: 28,
          frame: Math.floor(Math.random() * 6),
          frameTimer: Math.random() * 8,
          active: true
        });
      }

      // Vertical spacing increases with altitude (within maximum reach 115px)
      const minVerticalGap = 80;
      const maxVerticalGap = Math.min(115, 85 + (currentY / 300));
      currentY += minVerticalGap + Math.random() * (maxVerticalGap - minVerticalGap);
    }
  }

  // Main game loop — fixed timestep accumulator ensures 60fps on any refresh rate
  private lastFrameTs = 0;
  private accumulator = 0;
  private readonly FIXED_DT = 1000 / 60;
  private gameLoop = (timestamp: number) => {
    if (this.state !== 'PLAYING') {
    this.lastFrameTs = 0;
    this.accumulator = 0;
      this.accumulator = 0;
      return;
    }
    if (this.lastFrameTs === 0) {
      this.lastFrameTs = timestamp;
      this.animId = requestAnimationFrame(this.gameLoop);
      return;
    }

    const elapsed = Math.min(timestamp - this.lastFrameTs, 50); // cap to avoid spiral
    this.lastFrameTs = timestamp;
    this.accumulator += elapsed;

    while (this.accumulator >= this.FIXED_DT) {
      this.update();
      this.accumulator -= this.FIXED_DT;
    }

    this.render();
    this.animId = requestAnimationFrame(this.gameLoop);
  };

  // Update game state, physics, collisions
  private update() {
    // 1. Apply Screen Shake
    if (this.shakeTime > 0) {
      this.shakeTime--;
    }

    // 2. Horizontal Movement Physics
    if (this.keys.left) {
      this.player.vx -= this.acceleration;
      this.player.facingRight = false;
    } else if (this.keys.right) {
      this.player.vx += this.acceleration;
      this.player.facingRight = true;
    } else {
      this.player.vx *= this.friction; // Glide decelerating
    }

    // Speed clamping
    if (this.player.vx > this.maxSpeedX) this.player.vx = this.maxSpeedX;
    if (this.player.vx < -this.maxSpeedX) this.player.vx = -this.maxSpeedX;

    this.player.x += this.player.vx;

    // Left/Right Out of Frame Death
    if (this.player.x < -8 || this.player.x + this.player.width > this.canvas.width + 8) {
      this.shakeScreen(15, 30);
      this.triggerGameOver();
      return;
    }

    // 3. Vertical Gravity Physics
    this.player.vy += this.gravity;
    this.player.y -= this.player.vy; // Subtract because Y-coord increases upwards in world

    // 4. Jump trigger
    if (this.keys.jump && this.player.onGround) {
      if (this.keys.shift && this.coinsCount >= 20) {
        this.player.vy = this.powerJumpStrength;
        this.coinsCount -= 20;
        this.callbacks.onCoinChange(this.coinsCount);
        this.audio.playSpring();
        this.spawnJumpDust(this.player.x + this.player.width / 2, this.player.y);
      } else {
        this.player.vy = this.jumpStrength;
        this.audio.playJump();
        this.spawnJumpDust(this.player.x + this.player.width / 2, this.player.y);
      }
      this.player.onGround = false;
    }

    // 5. Platforms update & collisions
    this.player.onGround = false;

    // Filter off-screen platforms below camera
    const cleanupLimit = this.cameraY - 150;
    this.platforms = this.platforms.filter((p) => p.y >= cleanupLimit || p.id === 1);
    this.coins = this.coins.filter((c) => c.y >= cleanupLimit);
    this.marios = this.marios.filter((m) => m.y >= cleanupLimit);

    // Update remaining platforms
    this.platforms.forEach((platform) => {
      // A. Moving platforms
      if (platform.type === 'MOVING') {
        platform.x += platform.vx;
        // Bounce on screen edges
        if (platform.x <= 0 || platform.x + platform.width >= this.canvas.width) {
          platform.vx = -platform.vx;
        }
      }

      // B. Crumbling Platforms timers
      if (platform.type === 'CRUMBLING' && platform.crumbleTimer !== undefined) {
        platform.crumbleTimer--;
        // Shake platforms as they prepare to crumble
        platform.shakeOffset = (platform.crumbleTimer % 4 >= 2) ? 2 : -2;

        if (platform.crumbleTimer <= 0) {
          platform.crumbled = true;
          platform.shakeOffset = 0;
          this.triggerCrumbleExplosion(platform.x + platform.width / 2, platform.y, platform.width);
          delete platform.crumbleTimer;
        }
      }

      // C. Spring platform timer animations
      if (platform.type === 'SPRING' && platform.springTimer !== undefined) {
        platform.springTimer--;
        if (platform.springTimer <= 0) {
          platform.springState = 'idle';
          delete platform.springTimer;
        }
      }

      // Skip collision checks if crumbled
      if (platform.crumbled) return;

      // D. Collision Check: AABB one-way (player lands ONLY when falling down)
      const prevFeetY = (this.player.y - this.player.height) + this.player.vy; // previous feet Y
      const currFeetY = this.player.y - this.player.height; // current feet Y

      // Platform check
      // Player is falling (vy >= 0)
      if (this.player.vy >= 0 && prevFeetY >= platform.y - 2 && currFeetY <= platform.y + 6) {
        // Horizontal overlap check with a forgiving 8px inset buffer on edges
        if (
          this.player.x + this.player.width - 8 >= platform.x &&
          this.player.x + 8 <= platform.x + platform.width
        ) {
          // Lands on platform
          this.player.y = platform.y + this.player.height;
          this.player.vy = 0;
          this.player.onGround = true;

          // React based on platform type
          if (platform.type === 'SPRING' && platform.springState === 'idle') {
            platform.springState = 'compressed';
            platform.springTimer = 25; // 25 frames compression sequence
            this.player.vy = this.springStrength;
            this.player.onGround = false;
            this.audio.playSpring();
            this.triggerSpringGlow(platform.x + platform.width / 2, platform.y);
            this.shakeScreen(6, 15);
          } else if (platform.type === 'CRUMBLING' && platform.crumbleTimer === undefined) {
            platform.crumbleTimer = 30; // 500ms crumbling delay
            this.audio.playCrumble();
          } else if (platform.type === 'MOVING') {
            // Stand on moving platform: transfer its speed, but stay in bounds
            this.player.x += platform.vx;
            this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
          }
        }
      }
    });

    // 6. Coins collision & animation
    this.coins.forEach((coin) => {
      if (!coin.active) return;

      // Spin animation loop
      coin.frameTimer += 0.15;
      coin.frame = Math.floor(coin.frameTimer) % 6;

      // Collision detection: circular radius check
      const playerCenterX = this.player.x + this.player.width / 2;
      const playerCenterY = this.player.y - this.player.height / 2;
      const coinCenterX = coin.x + coin.width / 2;
      const coinCenterY = coin.y - coin.height / 2;
      const distance = Math.hypot(playerCenterX - coinCenterX, playerCenterY - coinCenterY);

      if (distance < 28) {
        coin.active = false;
        this.coinsCount++;
        this.callbacks.onCoinChange(this.coinsCount);
        this.score += 50; // Award 50 bonus points
        this.callbacks.onScoreChange(this.score);
        this.audio.playCoin();
        this.triggerCoinSparks(coinCenterX, coinCenterY);
      }
    });

    // 6.b Mario interaction & 2-frame animation loops
    this.marios.forEach((mario) => {
      const platform = this.platforms.find((p) => p.id === mario.platformId);
      const marioX = platform ? platform.x + mario.xOffset : mario.xOffset;
      mario.y = platform ? platform.y + mario.height : mario.y;

      // 2-frame animation loop (waiting = idle, cheering = celebration loop)
      mario.frameTimer += (mario.state === 'cheering' ? 0.12 : 0.07);
      mario.frame = Math.floor(mario.frameTimer) % 2;

      if (!mario.touched) {
        const playerCenterX = this.player.x + this.player.width / 2;
        const playerCenterY = this.player.y - this.player.height / 2;
        const marioCenterX = marioX + mario.width / 2;
        const marioCenterY = mario.y - mario.height / 2;
        const distance = Math.hypot(playerCenterX - marioCenterX, playerCenterY - marioCenterY);

        const overlapX = this.player.x + this.player.width >= marioX && this.player.x <= marioX + mario.width;
        const overlapY = this.player.y >= mario.y - mario.height && this.player.y - this.player.height <= mario.y;

        if (distance < 48 || (overlapX && overlapY)) {
          mario.touched = true;
          mario.state = 'cheering';
          mario.frameTimer = 0;
          this.score += 100; // Award 100 bonus points on touch
          this.callbacks.onScoreChange(this.score);
          this.audio.playMario();
          this.triggerMarioSparks(marioCenterX, marioCenterY);
        }
      }
    });

    // 7. Particles update
    this.particles.forEach((p) => {
      p.x += p.vx;
      if (p.gravity) {
        p.vy -= 0.25; // gravitational pull downwards
      }
      p.y += p.vy;
      p.life--;
      p.alpha = Math.max(0, p.life / p.maxLife);
    });
    this.particles = this.particles.filter((p) => p.life > 0);

    // 8. Character walk animations
    if (this.player.onGround && Math.abs(this.player.vx) > 0.2) {
      this.player.walkFrameTime += 0.15 + Math.abs(this.player.vx) * 0.05;
      this.player.walkFrame = Math.floor(this.player.walkFrameTime) % 6;
    } else {
      this.player.walkFrame = 0; // idle frame
    }

    // 9. Camera scrolling following the player
    const screenCenterWorldY = this.cameraY + this.canvas.height / 2;
    if (this.player.y > screenCenterWorldY) {
      const diff = this.player.y - screenCenterWorldY;
      // Scroll faster as player gets higher to keep them centered
      this.cameraY += diff * 0.1;
    }

    // 10. Score tracking by maximum height reached
    if (this.player.y > this.maxWorldY) {
      const scoreDiff = Math.floor(this.player.y / 10) - Math.floor(this.maxWorldY / 10);
      if (scoreDiff > 0) {
        this.score += scoreDiff;
        this.callbacks.onScoreChange(this.score);
      }
      this.maxWorldY = this.player.y;
    }

    // Generate endless platforms ahead
    const generationLimit = this.cameraY + this.canvas.height + 400;
    const highestPlatformY = this.platforms.reduce((max, p) => (p.y > max ? p.y : max), 0);
    if (highestPlatformY < generationLimit) {
      this.generatePlatforms(highestPlatformY + 100, generationLimit + 300);
    }

    // 11. Game Over check: Player falls below screen Y
    const screenBottomWorldY = this.cameraY - 40;
    if (this.player.y < screenBottomWorldY) {
      this.shakeScreen(15, 30);
      this.triggerGameOver();
    }
  }

  // Particle Effects
  private triggerMarioSparks(x: number, y: number) {
    // Floating score text (+100)
    this.particles.push({
      x: x - 24,
      y: y + 20,
      vx: 0,
      vy: 1.2,
      size: 14,
      color: '#fbbf24',
      alpha: 1,
      life: 45,
      maxLife: 45,
      text: '+100'
    });

    // Mario celebratory star/confetti sparks
    for (let i = 0; i < 22; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 3.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: ['#ef4444', '#3b82f6', '#ffd700', '#22c55e', '#ffffff'][Math.floor(Math.random() * 5)],
        alpha: 1,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        gravity: true
      });
    }
  }

  private triggerCoinSparks(x: number, y: number) {
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 4,
        color: ['#ffd700', '#f1c40f', '#f39c12', '#ffffff'][Math.floor(Math.random() * 4)],
        alpha: 1,
        life: 20 + Math.random() * 15,
        maxLife: 35
      });
    }
  }

  private spawnJumpDust(x: number, y: number) {
    for (let i = 0; i < 8; i++) {
      const vx = (Math.random() - 0.5) * 2;
      const vy = Math.random() * 1.5; // push slightly upwards
      this.particles.push({
        x,
        y,
        vx,
        vy,
        size: 4 + Math.random() * 5,
        color: 'rgba(238, 238, 238, 0.65)',
        alpha: 0.8,
        life: 15 + Math.random() * 10,
        maxLife: 25
      });
    }
  }

  private triggerSpringGlow(x: number, y: number) {
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 2, // blast upwards
        size: 3 + Math.random() * 5,
        color: ['#38bdf8', '#34d399', '#f43f5e', '#fbbf24'][Math.floor(Math.random() * 4)],
        alpha: 1,
        life: 25 + Math.random() * 15,
        maxLife: 40
      });
    }
  }

  private triggerCrumbleExplosion(x: number, y: number, width: number) {
    this.shakeScreen(5, 12);
    for (let i = 0; i < 18; i++) {
      const px = x - width / 2 + Math.random() * width;
      const py = y;
      const vx = (Math.random() - 0.5) * 3;
      const vy = -(Math.random() * 4); // fall down
      this.particles.push({
        x: px,
        y: py,
        vx,
        vy,
        size: 4 + Math.random() * 6,
        color: ['#a1887f', '#8d6e63', '#795548', '#bcaaa4'][Math.floor(Math.random() * 4)],
        alpha: 1,
        life: 30 + Math.random() * 20,
        maxLife: 50,
        gravity: true
      });
    }
  }

  private shakeScreen(amount: number, time: number) {
    this.shakeAmount = amount;
    this.shakeTime = time;
  }

  // Render Loop
  private render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    // Screen shaking translation offsets
    if (this.shakeTime > 0) {
      const dx = (Math.random() - 0.5) * this.shakeAmount;
      const dy = (Math.random() - 0.5) * this.shakeAmount;
      this.ctx.translate(dx, dy);
    }

    // A. Draw Endless Background
    this.drawEndlessBackground();

    // B. Draw Game Objects (Translate from World coordinates to Canvas screen coordinates)
    this.platforms.forEach((platform) => this.drawPlatform(platform));
    this.coins.forEach((coin) => this.drawCoin(coin));
    this.marios.forEach((mario) => this.drawMario(mario));
    this.drawParticles();

    // C. Draw Player Character
    this.drawPlayer();

    this.ctx.restore();

    // D. Score Overlay in Top Middle (rendered directly in Press Start 2P)
    this.drawScoreOverlay();
  }

  // Draw endless stacked parallax backgrounds
  private drawEndlessBackground() {
    // 937x1678 original aspect ratio
    const bgScale = this.canvas.width / 937;
    const bgScaledHeight = Math.round(1678 * bgScale);

    // Calculate background y positions
    // World coordinates (cameraY is scrolling up). Bottom of screen is at cameraY.
    // Screen coordinates mapping: screenY = canvas.height - (worldY - cameraY)
    
    // 1. Draw ground background at the bottom: world Y: [0, bgScaledHeight]
    //    Ground starts 1px higher and is 1px taller to overlap the first sky by 1px.
    let groundScreenY = Math.round(this.canvas.height - (bgScaledHeight - this.cameraY));
    if (groundScreenY < this.canvas.height && groundScreenY + bgScaledHeight > 0) {
      this.ctx.drawImage(this.groundBg, 0, groundScreenY - 1, this.canvas.width, bgScaledHeight + 1);
    }

    // 2. Draw sky backgrounds repeating endlessly above ground.
    //    First sky (index=1) uses sky.png. All skies above (index>=2) use sky2.png.
    //    Skies tile at exact bgScaledHeight intervals with no overlap between each other.
    const startSkyIndex = Math.max(1, Math.floor(this.cameraY / bgScaledHeight));
    const endSkyIndex = Math.floor((this.cameraY + this.canvas.height) / bgScaledHeight) + 1;

    for (let index = startSkyIndex; index <= endSkyIndex; index++) {
      const skyWorldY = index * bgScaledHeight;
      const skyScreenY = Math.round(this.canvas.height - (skyWorldY + bgScaledHeight - this.cameraY));
      const img = index === 1 ? this.skyBg : this.sky2Bg;
      this.ctx.drawImage(img, 0, skyScreenY, this.canvas.width, bgScaledHeight);
    }
  }

  // Draw Character
  private drawPlayer() {
    // Convert world Y to Screen Y
    const screenY = this.canvas.height - (this.player.y - this.cameraY);

    if (this.assetsLoaded) {
      const frameWidth = 256;
      const frameHeight = 256;

      const isAirborne = !this.player.onGround && Math.abs(this.player.vy) > 0.05;
      const isMoving = Math.abs(this.player.vx) > 0.2;

      let sprite: HTMLImageElement;
      let sx: number;

      if (isAirborne) {
        sprite = this.jumpSprite;
        sx = 0;
      } else if (!isMoving) {
        sprite = this.idleSprite;
        sx = 0;
      } else {
        sprite = this.walkSprite;
        sx = this.player.walkFrame * frameWidth;
      }

      this.ctx.save();
      // Mirror character if facing left
      if (!this.player.facingRight) {
        this.ctx.translate(this.player.x + this.player.width / 2, screenY + this.player.height / 2);
        this.ctx.scale(-1, 1);
        this.ctx.drawImage(
          sprite,
          sx, 0, frameWidth, frameHeight,
          -this.player.width / 2, -this.player.height / 2, this.player.width, this.player.height
        );
      } else {
        this.ctx.drawImage(
          sprite,
          sx, 0, frameWidth, frameHeight,
          this.player.x, screenY, this.player.width, this.player.height
        );
      }
      this.ctx.restore();
    } else {
      // Fallback colored box
      this.ctx.fillStyle = '#ec4899';
      this.ctx.fillRect(this.player.x, screenY, this.player.width, this.player.height);
    }
  }

  // Draw coin with spinning animation
  private drawCoin(coin: Coin) {
    if (!coin.active) return;
    const screenY = this.canvas.height - (coin.y - this.cameraY);

    if (this.assetsLoaded) {
      const frameWidth = 256;
      const frameHeight = 256;
      const sx = coin.frame * frameWidth;

      this.ctx.drawImage(
        this.coinSprite,
        sx, 0, frameWidth, frameHeight,
        coin.x, screenY, coin.width, coin.height
      );
    } else {
      // Fallback
      this.ctx.fillStyle = '#ffd700';
      this.ctx.beginPath();
      this.ctx.arc(coin.x + coin.width / 2, screenY + coin.height / 2, coin.width / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  // Draw Mario NPC (waiting / cheering animation)
  private drawMario(mario: MarioNpc) {
    const platform = this.platforms.find((p) => p.id === mario.platformId);
    const marioX = platform ? platform.x + mario.xOffset : mario.xOffset;
    const screenY = this.canvas.height - (mario.y - this.cameraY);

    if (this.assetsLoaded) {
      const img = mario.state === 'cheering' ? this.marioCheerImg : this.marioWaitingImg;
      if (img && img.complete && img.naturalWidth > 0) {
        const frameWidth = 256;
        const frameHeight = 256;
        const sx = mario.frame * frameWidth;

        this.ctx.drawImage(
          img,
          sx, 0, frameWidth, frameHeight,
          marioX, screenY, mario.width, mario.height
        );
      } else {
        this.ctx.fillStyle = mario.state === 'cheering' ? '#22c55e' : '#ef4444';
        this.ctx.fillRect(marioX, screenY, mario.width, mario.height);
      }
    } else {
      this.ctx.fillStyle = '#ef4444';
      this.ctx.fillRect(marioX, screenY, mario.width, mario.height);
    }
  }

  // Procedural pixel-art platform renderers
  private drawPlatform(platform: Platform) {
    if (platform.crumbled) return;

    // Convert world coordinates to screen coords
    const screenY = this.canvas.height - (platform.y - this.cameraY);
    const shake = platform.shakeOffset || 0;
    const x = platform.x + shake;

    this.ctx.save();

    // Standard starting platform sits on bottom
    if (platform.id === 1) {
      // Standing on background ground artwork - do not draw custom platform
      this.ctx.restore();
      return;
    }

    // Procedural pixel arts based on platform type
    switch (platform.type) {
      case 'STANDARD':
        if (platform.rockyImg && platform.rockyImg > 0) {
          const negSpace = platform.rockyImg;
          let img = this.rocky5Bg;
          if (negSpace === 13) img = this.rocky13Bg;
          if (negSpace === 17) img = this.rocky17Bg;

          if (img && img.complete && img.naturalWidth > 0) {
            // Draw image stretched to width, and aligned such that its top is negSpace above the collision box
            this.ctx.drawImage(img, x, screenY - negSpace, platform.width, img.naturalHeight);
          } else {
            // Fallback
            this.ctx.fillStyle = '#5d4037';
            this.ctx.fillRect(x, screenY, platform.width, platform.height);
          }
        } else if (this.rockyBg && this.rockyBg.complete && this.rockyBg.naturalWidth > 0) {
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.rect(x, screenY, platform.width, platform.height);
          this.ctx.clip();
          
          const pattern = this.ctx.createPattern(this.rockyBg, 'repeat');
          if (pattern) {
             const domMatrix = new DOMMatrix().translate(x, screenY).scale(0.1, 0.1);
             pattern.setTransform(domMatrix);
             this.ctx.fillStyle = pattern;
             this.ctx.fill();
          }
          this.ctx.restore();
          
          // Subtle border for definition removed as requested
          
          // Bottom shadow
          this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          this.ctx.fillRect(x, screenY + platform.height - 3, platform.width, 3);
        } else {
          // 1. Dirt base
          this.ctx.fillStyle = '#5d4037'; // brown
          this.ctx.fillRect(x, screenY, platform.width, platform.height);

          // Brick dividers (random pixels)
          this.ctx.fillStyle = '#3e2723'; // dark brown shadow
          for (let bx = x + 16; bx < x + platform.width; bx += 32) {
            this.ctx.fillRect(bx, screenY + 8, 2, platform.height - 8);
          }
          // Platform bottom shadow
          this.ctx.fillRect(x, screenY + platform.height - 3, platform.width, 3);

          // 2. Mossy Grass Top Layer (6px)
          this.ctx.fillStyle = '#2e7d32'; // dark green
          this.ctx.fillRect(x, screenY, platform.width, 6);

          // Hanging moss highlights
          this.ctx.fillStyle = '#4caf50'; // bright green
          for (let gx = x + 4; gx < x + platform.width; gx += 8) {
            const depth = (gx % 3 === 0) ? 9 : 6;
            this.ctx.fillRect(gx, screenY, 4, depth);
          }
        }
        break;

      case 'MOVING':
        if (this.pipeBg && this.pipeBg.complete && this.pipeBg.naturalWidth > 0) {
          this.ctx.save();
          this.ctx.beginPath();
          // Draw image starting 15px higher, giving character a 15px negative space tolerance on top
          this.ctx.rect(x, screenY - 15, platform.width, platform.height + 15);
          this.ctx.clip();
          
          // Draw pipe image stretched to fit the platform width and height (+ 15px tolerance)
          this.ctx.drawImage(this.pipeBg, x, screenY - 15, platform.width, platform.height + 15);
          this.ctx.restore();
        } else {
          // Floating pipe fallback
          this.ctx.fillStyle = '#2e7d32'; // pipe green base
          this.ctx.fillRect(x, screenY, platform.width, platform.height);

          // Pipe metallic highlight
          this.ctx.fillStyle = '#4caf50'; 
          this.ctx.fillRect(x + 4, screenY + 2, platform.width - 8, 3);

          // Pipe flange ends
          this.ctx.fillStyle = '#1b5e20'; 
          this.ctx.fillRect(x, screenY, 4, platform.height);
          this.ctx.fillRect(x + platform.width - 4, screenY, 4, platform.height);

          // Bottom shadow
          this.ctx.fillStyle = '#0d3810';
          this.ctx.fillRect(x, screenY + platform.height - 3, platform.width, 3);
        }
        break;

      case 'CRUMBLING':
        if (this.crumblingBg && this.crumblingBg.complete && this.crumblingBg.naturalWidth > 0) {
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.rect(x, screenY, platform.width, platform.height);
          this.ctx.clip();
          
          const pattern = this.ctx.createPattern(this.crumblingBg, 'repeat');
          if (pattern) {
             const domMatrix = new DOMMatrix().translate(x, screenY).scale(0.05, 0.05); // scale down 1254x1254
             pattern.setTransform(domMatrix);
             this.ctx.fillStyle = pattern;
             this.ctx.fill();
          }
          this.ctx.restore();
        } else {
          // Loose grey rock ledge fallback
          this.ctx.fillStyle = '#757575';
          this.ctx.fillRect(x, screenY, platform.width, platform.height);

          // Cracks and indentations
          this.ctx.fillStyle = '#212121';
          this.ctx.fillRect(x + 8, screenY, 2, 8);
          this.ctx.fillRect(x + 8, screenY + 8, 6, 2);
          this.ctx.fillRect(x + 20, screenY + 8, 2, 8);
          
          this.ctx.fillRect(x + platform.width - 18, screenY, 2, 6);
          this.ctx.fillRect(x + platform.width - 20, screenY + 6, 6, 2);
          this.ctx.fillRect(x + platform.width - 24, screenY + 10, 6, 2);

          // Bottom shadows
          this.ctx.fillStyle = '#424242';
          this.ctx.fillRect(x, screenY + platform.height - 4, platform.width, 4);
        }

        // Falling pebbles animation
        if (platform.crumbleTimer !== undefined && platform.crumbleTimer < 20) {
          const t = 20 - platform.crumbleTimer;
          this.ctx.fillStyle = '#9e9e9e'; // light grey dust
          this.ctx.fillRect(x + Math.sin(platform.crumbleTimer) * 15 + platform.width/2, screenY + 10 + t*2, 3, 3);
          this.ctx.fillRect(x + Math.cos(platform.crumbleTimer) * 20 + platform.width/3, screenY + 12 + t*3, 2, 2);
          this.ctx.fillRect(x - Math.sin(platform.crumbleTimer) * 10 + platform.width/4, screenY + 14 + t*1.5, 4, 4);
          
          this.ctx.fillStyle = '#616161'; // dark pebbles
          this.ctx.fillRect(x + platform.width/2 + 10, screenY + 15 + t*2.5, 3, 3);
          this.ctx.fillRect(x + 10, screenY + 18 + t*2, 2, 2);
        } else {
          // Just a few static pebbles under it to hint danger
          this.ctx.fillStyle = '#616161';
          const pulse = Math.floor(Date.now() / 200) % 2;
          if (pulse === 0) {
             this.ctx.fillRect(x + 10, screenY + platform.height + 2, 2, 2);
             this.ctx.fillRect(x + platform.width - 15, screenY + platform.height + 4, 2, 2);
          }
        }
        break;

      case 'SPRING':
        let mossOffset = 0;
        let mossSquash = 0;
        
        if (platform.springState === 'compressed') {
           mossSquash = 6;
           mossOffset = 6;
        } else if (platform.springState === 'extended') {
           mossSquash = -6; // stretches up
           mossOffset = -6;
        }

        if (this.mossBg && this.mossBg.complete && this.mossBg.naturalWidth > 0) {
          this.ctx.save();
          this.ctx.beginPath();
          // Full width and height of the platform block, adjusted by squash
          this.ctx.rect(x, screenY + mossOffset, platform.width, platform.height - mossSquash);
          this.ctx.clip();
          
          const pattern = this.ctx.createPattern(this.mossBg, 'repeat');
          if (pattern) {
             const domMatrix = new DOMMatrix().translate(x, screenY + mossOffset).scale(0.05, 0.05);
             pattern.setTransform(domMatrix);
             this.ctx.fillStyle = pattern;
             this.ctx.fill();
          }
          this.ctx.restore();
        } else {
          // Moss Trampoline base fallback
          this.ctx.fillStyle = '#33691E'; // dark moss root base
          this.ctx.fillRect(x, screenY + platform.height - 4, platform.width, 4);

          // Main Moss Body fallback
          this.ctx.fillStyle = '#64DD17'; // vibrant green moss
          this.ctx.fillRect(x + 2, screenY + mossOffset, platform.width - 4, platform.height - 4 - mossSquash);

          // Fluffy Moss Highlights on top
          this.ctx.fillStyle = '#76FF03'; 
          this.ctx.fillRect(x, screenY + mossOffset - 2, platform.width, 6);
          
          // Brighter spots
          this.ctx.fillStyle = '#B2FF59';
          this.ctx.fillRect(x + 6, screenY + mossOffset, 4, 2);
          this.ctx.fillRect(x + 18, screenY + mossOffset, 6, 2);
          if (platform.width > 24) {
             this.ctx.fillRect(x + platform.width - 14, screenY + mossOffset - 1, 4, 2);
          }
        }
        break;
    }

    this.ctx.restore();
  }

  // Draw particle system
  private drawParticles() {
    this.particles.forEach((p) => {
      const screenY = this.canvas.height - (p.y - this.cameraY);
      this.ctx.save();
      this.ctx.globalAlpha = p.alpha;
      if (p.text) {
        this.ctx.font = '14px "Press Start 2P", monospace';
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillText(p.text, p.x + 2, screenY + 2);
        this.ctx.fillStyle = p.color;
        this.ctx.fillText(p.text, p.x, screenY);
      } else {
        this.ctx.fillStyle = p.color;
        this.ctx.fillRect(p.x, screenY, p.size, p.size);
      }
      this.ctx.restore();
    });
  }

  // Draw overlay score and coin count directly in canvas
  private drawScoreOverlay() {
    this.ctx.save();

    // Score - top center
    this.ctx.font = '28px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    this.ctx.fillText(`${this.score}`, this.canvas.width / 2 + 3, 18);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(`${this.score}`, this.canvas.width / 2, 15);

    // Coins - top left
    this.ctx.font = '16px "Press Start 2P", monospace';
    this.ctx.textAlign = 'left';

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    this.ctx.fillText(`x${this.coinsCount}`, 15, 24);
    this.ctx.fillStyle = '#ffd700';
    this.ctx.fillText(`x${this.coinsCount}`, 12, 21);

    this.ctx.restore();
  }

  // Screen drawing overlays (Start, Game Over)
  private drawStartScreen() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawEndlessBackground();

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(7, 4, 13, 0.85)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Title Logo
    this.ctx.font = '18px "Press Start 2P", monospace';
    this.ctx.fillStyle = '#9333ea';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('$RWD Mountain Climber', this.canvas.width / 2, 220);
    this.ctx.fillStyle = '#e879f9';
    this.ctx.fillText('$RWD Mountain Climber', this.canvas.width / 2 - 2, 218);

    // Help instructions
    this.ctx.font = '11px "Press Start 2P", monospace';
    this.ctx.fillStyle = '#f5d0fe';
    this.ctx.fillText('CLIMB HIGH. COLLECT COINS.', this.canvas.width / 2, 320);
    this.ctx.fillText('AVOID THE FALL!', this.canvas.width / 2, 345);

    this.ctx.font = '10px "Press Start 2P", monospace';
    this.ctx.fillStyle = '#c084fc';
    this.ctx.fillText('A / D OR ARROWS : MOVE LEFT/RIGHT', this.canvas.width / 2, 430);
    this.ctx.fillText('SPACE OR W / UP : JUMP', this.canvas.width / 2, 460);

    // Prompt to click
    const blinkVal = Math.floor(Date.now() / 600) % 2;
    if (blinkVal === 0) {
      this.ctx.font = '14px "Press Start 2P", monospace';
      this.ctx.fillStyle = '#d946ef';
      this.ctx.fillText('CLICK PLAY TO START', this.canvas.width / 2, 580);
    }

    this.ctx.restore();
  }

  private drawGameOverScreen() {
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(7, 4, 13, 0.9)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Game Over Text
    this.ctx.font = '36px "Press Start 2P", monospace';
    this.ctx.fillStyle = '#ef4444';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('GAME OVER', this.canvas.width / 2, 240);
    this.ctx.fillStyle = '#b91c1c';
    this.ctx.fillText('GAME OVER', this.canvas.width / 2 - 3, 237);

    // Score report
    this.ctx.font = '16px "Press Start 2P", monospace';
    this.ctx.fillStyle = '#f5d0fe';
    this.ctx.fillText(`SCORE: ${this.score}`, this.canvas.width / 2, 340);
    this.ctx.fillStyle = '#e879f9';
    this.ctx.fillText(`COINS: ${this.coinsCount}`, this.canvas.width / 2, 390);

    // Prompt
    const blinkVal = Math.floor(Date.now() / 600) % 2;
    if (blinkVal === 0) {
      this.ctx.font = '12px "Press Start 2P", monospace';
      this.ctx.fillStyle = '#c084fc';
      this.ctx.fillText('CLICK RESTART TO TRY AGAIN', this.canvas.width / 2, 540);
    }

    this.ctx.restore();
  }

  public cleanUp() {
    if (this.animId) cancelAnimationFrame(this.animId);
    this.audio.cleanUp();
  }
}
