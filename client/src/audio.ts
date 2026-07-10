// Sound effects with two layers:
//  1. Custom files: drop mp3s into client/public/sounds/ (see the README there)
//     named after each SoundName — they are used automatically when present.
//  2. Fallback: small WebAudio-synthesized tones, so the game has sound
//     out of the box with no assets.

export type SoundName =
  | 'tick'
  | 'draw'
  | 'discard'
  | 'pong'
  | 'chow'
  | 'kong'
  | 'win'
  | 'lose'
  | 'yourTurn'
  | 'bomb'
  | 'boom'
  | 'powerup';

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
}

// ── custom sound files ──────────────────────────────────────────────────────

const customSounds = new Map<SoundName, HTMLAudioElement>();

for (const name of SOUND_NAMES) {
  const el = new Audio(`/sounds/${name}.mp3`);
  el.preload = 'auto';
  el.addEventListener('canplaythrough', () => customSounds.set(name, el), { once: true });
  // a missing file (404 or SPA-fallback HTML) fires error/never canplays — synth is used
}

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
};

export function play(name: SoundName): void {
  if (state.muted || state.volume <= 0) return;
  const custom = customSounds.get(name);
  if (custom) {
    const el = custom.cloneNode() as HTMLAudioElement;
    el.volume = state.volume;
    void el.play().catch(() => {});
    return;
  }
  try {
    SYNTH[name]();
  } catch {
    /* audio unavailable (e.g. pre-gesture) — stay silent */
  }
}
