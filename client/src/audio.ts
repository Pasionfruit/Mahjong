// Sound effects with two layers:
//  1. Custom files: drop mp3s (or wavs) into client/public/sounds/ (see the
//     README there) named after each SoundName — they are used automatically
//     when present. The repo ships synthesized placeholder .wav files for
//     every name; replacing one is just dropping a real .mp3 next to it.
//  2. Fallback: small WebAudio-synthesized tones, so the game has sound
//     even with no assets at all.

export type SoundName =
  // mahjong / rooms
  | 'tick'
  | 'draw'
  | 'discard'
  | 'pong'
  | 'chow'
  | 'kong'
  | 'win'
  | 'lose'
  | 'yourTurn'
  // bomberman
  | 'bomb'
  | 'boom'
  | 'powerup'
  | 'hurt'
  | 'eliminated'
  | 'gameOver'
  // app-wide UI
  | 'hover'
  | 'click'
  | 'start'
  | 'countdownTick'
  | 'countdownGo'
  // shared game actions (each arcade game picks from this kit)
  | 'point'
  | 'flap'
  | 'jump'
  | 'land'
  | 'spring'
  | 'bounce'
  | 'brick'
  | 'peg'
  | 'merge'
  | 'slide'
  | 'place'
  | 'reveal'
  | 'flag'
  | 'drain'
  | 'bucket'
  | 'pour'
  | 'pop'
  | 'error'
  | 'car'
  | 'letter'
  | 'combo';

export const SOUND_NAMES: SoundName[] = [
  'tick',
  'draw',
  'discard',
  'pong',
  'chow',
  'kong',
  'win',
  'lose',
  'yourTurn',
  'bomb',
  'boom',
  'powerup',
  'hurt',
  'eliminated',
  'gameOver',
  'hover',
  'click',
  'start',
  'countdownTick',
  'countdownGo',
  'point',
  'flap',
  'jump',
  'land',
  'spring',
  'bounce',
  'brick',
  'peg',
  'merge',
  'slide',
  'place',
  'reveal',
  'flag',
  'drain',
  'bucket',
  'pour',
  'pop',
  'error',
  'car',
  'letter',
  'combo',
];

const STORAGE_KEY = 'mahjong.audio';

interface AudioState {
  volume: number; // 0..1
  muted: boolean;
}

let state: AudioState = { volume: 0.7, muted: false };
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as AudioState;
    if (typeof parsed.volume === 'number' && typeof parsed.muted === 'boolean') {
      state = { volume: Math.min(Math.max(parsed.volume, 0), 1), muted: parsed.muted };
    }
  }
} catch {
  /* keep defaults */
}

export function getAudioState(): AudioState {
  return { ...state };
}

export function setAudio(patch: Partial<AudioState>): void {
  state = { ...state, ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  // Volume slider / mute apply to the running background music immediately.
  syncMusic();
}

// ── custom sound files ──────────────────────────────────────────────────────

const customSounds = new Map<SoundName, HTMLAudioElement>();

/** mp3 first (a real replacement), then wav (the shipped placeholder). A
 *  missing file 404s / never canplays — the next extension, then synth. */
function loadCustom(name: SoundName, exts: string[]): void {
  const [ext, ...rest] = exts;
  if (!ext) return;
  const el = new Audio(`/sounds/${name}.${ext}`);
  el.preload = 'auto';
  el.addEventListener('canplaythrough', () => customSounds.set(name, el), { once: true });
  el.addEventListener('error', () => loadCustom(name, rest), { once: true });
}

for (const name of SOUND_NAMES) loadCustom(name, ['mp3', 'wav']);

/** Per-sound loudness trim for file playback — UI blips should sit well
 *  under the game sounds even though the files are normalized. */
const FILE_GAIN: Partial<Record<SoundName, number>> = {
  hover: 0.14,
  click: 0.3,
  letter: 0.25,
  reveal: 0.3,
  slide: 0.3,
  tick: 0.35,
  countdownTick: 0.45,
  drain: 0.3,
};

// ── synthesized fallbacks ───────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// Browsers keep the context suspended until a user gesture; unlock on first input.
window.addEventListener(
  'pointerdown',
  () => {
    if (ctx?.state === 'suspended') void ctx.resume();
  },
  { passive: true },
);

interface Note {
  freq: number;
  at: number; // seconds from now
  dur: number;
  type?: OscillatorType;
  gain?: number;
}

function playNotes(notes: Note[]): void {
  const c = audioCtx();
  const now = c.currentTime;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.value = n.freq;
    const peak = (n.gain ?? 0.18) * state.volume;
    g.gain.setValueAtTime(0, now + n.at);
    g.gain.linearRampToValueAtTime(peak, now + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, now + n.at + n.dur);
    osc.connect(g).connect(c.destination);
    osc.start(now + n.at);
    osc.stop(now + n.at + n.dur + 0.05);
  }
}

const SYNTH: Record<SoundName, () => void> = {
  tick: () => playNotes([{ freq: 1050, at: 0, dur: 0.04, type: 'square', gain: 0.05 }]),
  draw: () => playNotes([{ freq: 340, at: 0, dur: 0.06, gain: 0.1 }]),
  discard: () => playNotes([{ freq: 190, at: 0, dur: 0.08, type: 'triangle', gain: 0.14 }]),
  pong: () =>
    playNotes([
      { freq: 392, at: 0, dur: 0.1, type: 'triangle' },
      { freq: 523, at: 0.09, dur: 0.14, type: 'triangle' },
    ]),
  chow: () =>
    playNotes([
      { freq: 330, at: 0, dur: 0.08, type: 'triangle' },
      { freq: 392, at: 0.07, dur: 0.08, type: 'triangle' },
      { freq: 494, at: 0.14, dur: 0.12, type: 'triangle' },
    ]),
  kong: () =>
    playNotes([
      { freq: 262, at: 0, dur: 0.12, type: 'triangle', gain: 0.22 },
      { freq: 196, at: 0.11, dur: 0.18, type: 'triangle', gain: 0.22 },
    ]),
  win: () =>
    playNotes([
      { freq: 523, at: 0, dur: 0.14 },
      { freq: 659, at: 0.12, dur: 0.14 },
      { freq: 784, at: 0.24, dur: 0.14 },
      { freq: 1047, at: 0.36, dur: 0.34, gain: 0.22 },
    ]),
  lose: () =>
    playNotes([
      { freq: 392, at: 0, dur: 0.18 },
      { freq: 311, at: 0.16, dur: 0.18 },
      { freq: 262, at: 0.32, dur: 0.3, gain: 0.14 },
    ]),
  yourTurn: () =>
    playNotes([
      { freq: 659, at: 0, dur: 0.09, gain: 0.12 },
      { freq: 880, at: 0.08, dur: 0.16, gain: 0.12 },
    ]),
  // bomberman
  bomb: () => playNotes([{ freq: 240, at: 0, dur: 0.06, type: 'square', gain: 0.08 }]),
  boom: () =>
    playNotes([
      { freq: 110, at: 0, dur: 0.22, type: 'sawtooth', gain: 0.24 },
      { freq: 55, at: 0.02, dur: 0.32, type: 'triangle', gain: 0.26 },
      { freq: 220, at: 0, dur: 0.08, type: 'square', gain: 0.1 },
    ]),
  powerup: () =>
    playNotes([
      { freq: 523, at: 0, dur: 0.07, type: 'square', gain: 0.09 },
      { freq: 659, at: 0.06, dur: 0.07, type: 'square', gain: 0.09 },
      { freq: 1047, at: 0.12, dur: 0.14, type: 'square', gain: 0.1 },
    ]),
  // took a hit but survived (lost a spare life)
  hurt: () =>
    playNotes([
      { freq: 620, at: 0, dur: 0.06, type: 'square', gain: 0.12 },
      { freq: 392, at: 0.05, dur: 0.09, type: 'square', gain: 0.12 },
    ]),
  // out of the game for good
  eliminated: () =>
    playNotes([
      { freq: 392, at: 0, dur: 0.12, type: 'triangle', gain: 0.16 },
      { freq: 294, at: 0.11, dur: 0.12, type: 'triangle', gain: 0.16 },
      { freq: 196, at: 0.22, dur: 0.26, type: 'triangle', gain: 0.18 },
    ]),
  // the game ended with no winner
  gameOver: () =>
    playNotes([
      { freq: 220, at: 0, dur: 0.22, type: 'triangle', gain: 0.18 },
      { freq: 147, at: 0.2, dur: 0.4, type: 'triangle', gain: 0.2 },
    ]),
  // app-wide UI
  hover: () => playNotes([{ freq: 900, at: 0, dur: 0.04, gain: 0.03 }]),
  click: () => playNotes([{ freq: 620, at: 0, dur: 0.05, type: 'triangle', gain: 0.08 }]),
  start: () =>
    playNotes([
      { freq: 392, at: 0, dur: 0.1, type: 'triangle' },
      { freq: 523, at: 0.09, dur: 0.1, type: 'triangle' },
      { freq: 659, at: 0.18, dur: 0.2, type: 'triangle' },
    ]),
  countdownTick: () => playNotes([{ freq: 880, at: 0, dur: 0.07, type: 'square', gain: 0.09 }]),
  countdownGo: () =>
    playNotes([
      { freq: 784, at: 0, dur: 0.1, type: 'square', gain: 0.12 },
      { freq: 1175, at: 0.09, dur: 0.24, type: 'square', gain: 0.12 },
    ]),
  // shared game-action kit
  point: () =>
    playNotes([
      { freq: 988, at: 0, dur: 0.06, type: 'square', gain: 0.1 },
      { freq: 1319, at: 0.05, dur: 0.1, type: 'square', gain: 0.1 },
    ]),
  flap: () => playNotes([{ freq: 560, at: 0, dur: 0.08, gain: 0.12 }]),
  jump: () => playNotes([{ freq: 380, at: 0, dur: 0.12, type: 'square', gain: 0.1 }]),
  land: () => playNotes([{ freq: 130, at: 0, dur: 0.07, type: 'triangle', gain: 0.14 }]),
  spring: () => playNotes([{ freq: 330, at: 0, dur: 0.18, type: 'triangle', gain: 0.14 }]),
  bounce: () => playNotes([{ freq: 320, at: 0, dur: 0.06, gain: 0.12 }]),
  brick: () => playNotes([{ freq: 720, at: 0, dur: 0.05, type: 'square', gain: 0.1 }]),
  peg: () => playNotes([{ freq: 1100, at: 0, dur: 0.06, gain: 0.11 }]),
  merge: () =>
    playNotes([
      { freq: 440, at: 0, dur: 0.07, type: 'triangle', gain: 0.12 },
      { freq: 660, at: 0.05, dur: 0.12, type: 'triangle', gain: 0.13 },
    ]),
  slide: () => playNotes([{ freq: 240, at: 0, dur: 0.05, type: 'triangle', gain: 0.06 }]),
  place: () => playNotes([{ freq: 260, at: 0, dur: 0.06, type: 'triangle', gain: 0.13 }]),
  reveal: () => playNotes([{ freq: 700, at: 0, dur: 0.04, gain: 0.07 }]),
  flag: () =>
    playNotes([
      { freq: 520, at: 0, dur: 0.05, type: 'square', gain: 0.09 },
      { freq: 780, at: 0.05, dur: 0.06, type: 'square', gain: 0.09 },
    ]),
  drain: () => playNotes([{ freq: 200, at: 0, dur: 0.12, type: 'triangle', gain: 0.06 }]),
  bucket: () =>
    playNotes([
      { freq: 330, at: 0, dur: 0.07, type: 'triangle', gain: 0.13 },
      { freq: 495, at: 0.06, dur: 0.09, type: 'triangle', gain: 0.12 },
    ]),
  pour: () => playNotes([{ freq: 520, at: 0, dur: 0.2, gain: 0.08 }]),
  pop: () => playNotes([{ freq: 520, at: 0, dur: 0.05, gain: 0.14 }]),
  error: () =>
    playNotes([
      { freq: 220, at: 0, dur: 0.09, type: 'square', gain: 0.1 },
      { freq: 185, at: 0.1, dur: 0.12, type: 'square', gain: 0.1 },
    ]),
  car: () => playNotes([{ freq: 150, at: 0, dur: 0.16, type: 'sawtooth', gain: 0.08 }]),
  letter: () => playNotes([{ freq: 760, at: 0, dur: 0.04, type: 'triangle', gain: 0.06 }]),
  combo: () =>
    playNotes([
      { freq: 660, at: 0, dur: 0.1, type: 'square', gain: 0.1 },
      { freq: 880, at: 0.07, dur: 0.1, type: 'square', gain: 0.1 },
      { freq: 1175, at: 0.14, dur: 0.12, type: 'square', gain: 0.1 },
    ]),
};

export function play(name: SoundName): void {
  if (state.muted || state.volume <= 0) return;
  const custom = customSounds.get(name);
  if (custom) {
    const el = custom.cloneNode() as HTMLAudioElement;
    el.volume = Math.min(1, state.volume * (FILE_GAIN[name] ?? 1));
    void el.play().catch(() => {});
    return;
  }
  try {
    SYNTH[name]();
  } catch {
    /* audio unavailable (e.g. pre-gesture) — stay silent */
  }
}

// ── background music ───────────────────────────────────────────────────────
// Two looping tracks, both following the same volume/mute state: the calm
// 'menu' loop for browsing, zen games, and dailies; the driving 'game' loop
// while a party/room match is actually being played. Drop music.mp3 /
// music-game.mp3 in /sounds to replace the shipped placeholder wavs.
// Browsers block autoplay, so playback actually starts on the first gesture.

type MusicScene = 'menu' | 'game';

const MUSIC_GAIN: Record<MusicScene, number> = { menu: 0.3, game: 0.38 };
const MUSIC_BASE: Record<MusicScene, string> = { menu: 'music', game: 'music-game' };

let musicScene: MusicScene = 'menu';
const musicEls = new Map<MusicScene, HTMLAudioElement>();

function musicElFor(scene: MusicScene): HTMLAudioElement {
  let el = musicEls.get(scene);
  if (!el) {
    el = new Audio(`/sounds/${MUSIC_BASE[scene]}.mp3`);
    el.loop = true;
    // fall back to the placeholder wav if no real track was dropped in
    el.addEventListener(
      'error',
      () => {
        el!.src = `/sounds/${MUSIC_BASE[scene]}.wav`;
        syncMusic();
      },
      { once: true },
    );
    musicEls.set(scene, el);
  }
  return el;
}

function syncMusic(): void {
  for (const [scene, el] of musicEls) {
    if (scene !== musicScene && !el.paused) el.pause();
  }
  const el = musicElFor(musicScene);
  el.volume = Math.min(1, state.volume * MUSIC_GAIN[musicScene]);
  if (state.muted || state.volume <= 0) el.pause();
  else if (el.paused) void el.play().catch(() => {});
}

/** Swap between the calm menu loop and the intense in-game loop. Safe to
 *  call repeatedly; actual playback still waits for a user gesture. */
export function setMusicScene(scene: MusicScene): void {
  if (scene === musicScene) return;
  musicScene = scene;
  syncMusic();
}

// ── app-wide UI sounds ─────────────────────────────────────────────────────
// One pair of delegated listeners covers every button in the app — no
// per-component wiring. Hover only fires for mouse pointers (touch would
// double-fire it right before the click).

document.addEventListener(
  'click',
  (e) => {
    if ((e.target as Element | null)?.closest?.('button')) play('click');
    // The click that just happened is a user gesture — the moment music is
    // finally allowed to start (and to resume after unmute).
    syncMusic();
  },
  true,
);

document.addEventListener(
  'pointerover',
  (e) => {
    if (e.pointerType !== 'mouse') return;
    const to = (e.target as Element | null)?.closest?.('button');
    const from = (e.relatedTarget as Element | null)?.closest?.('button');
    if (to && to !== from && !(to as HTMLButtonElement).disabled) play('hover');
  },
  true,
);
