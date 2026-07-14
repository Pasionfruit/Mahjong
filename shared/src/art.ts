import type { ThemeId } from './settings';

/**
 * Art games: three player-only drawing modes hosted by one `art` module.
 *  - swap:     everyone draws at once; canvases rotate until each player has
 *              contributed to every drawing, then the gallery is revealed.
 *  - imposter: everyone secretly draws their prompt — one player's prompt is
 *              subtly different. Vote out the imposter.
 *  - guess:    one player draws, the rest race to guess the word (skribbl-style).
 */
export const ART_MODES = ['swap', 'imposter', 'guess'] as const;
export type ArtMode = (typeof ART_MODES)[number];

export const ART_MODE_NAMES: Record<ArtMode, string> = {
  swap: 'Swap Artist',
  imposter: 'Imposter Drawing',
  guess: 'Guess the Word',
};

export const ART_MODE_TAGLINES: Record<ArtMode, string> = {
  swap: 'Take turns finishing each other’s masterpieces.',
  imposter: 'One artist got a different word. Find them.',
  guess: 'One draws, everyone else races to guess.',
};

// ── host-configurable choices ───────────────────────────────────────────────

export const ART_DRAW_SECONDS_CHOICES = [30, 45, 60, 90, 120, 180] as const;
export type ArtDrawSeconds = (typeof ART_DRAW_SECONDS_CHOICES)[number];

/** Swap reveal: seconds each finished canvas stays on screen. */
export const ART_REVEAL_SECONDS_CHOICES = [5, 8, 12, 20] as const;

export const ART_ROUNDS_CHOICES = [1, 2, 3, 4, 5] as const;

/** Guess: how many words the drawer picks from. */
export const ART_WORD_CHOICE_COUNTS = [2, 3, 4, 5] as const;

export const ART_MAX_PLAYER_CHOICES = [4, 6, 8, 10, 12] as const;

export const ART_MIN_PLAYERS = 2;
/** Imposter voting is meaningless below three players. */
export const ART_IMPOSTER_MIN_PLAYERS = 3;
export const ART_ABSOLUTE_MAX_PLAYERS = 12;

export interface ArtSettings {
  mode: ArtMode;
  theme: ThemeId;
  /** Room cap for this table (joins are refused beyond it). */
  maxPlayers: number;
  /** Seconds per drawing phase (per swap turn / imposter round / guess turn). */
  drawSeconds: ArtDrawSeconds;
  /** Imposter & guess: number of rounds (guess: everyone draws once per round). */
  rounds: number;
  /** Swap: drawing turns per game; 0 = auto (one per player, full rotation). */
  swapCount: number;
  /** Swap: auto-advance seconds per revealed canvas. */
  revealSeconds: number;
  /** Guess: word options offered to the drawer. */
  wordChoices: number;
  /** Guess: reveal letters as time runs down. */
  hintsEnabled: boolean;
  /** Custom prompt words (swap & guess), comma/newline separated. */
  customWords: string;
  /** Imposter: custom prompt pairs, one per line as "word / imposter word". */
  customPairs: string;
  /** Use only the custom entries (when enough of them), skipping built-ins. */
  customOnly: boolean;
}

export const DEFAULT_ART_SETTINGS: ArtSettings = {
  mode: 'guess',
  theme: 'ocean',
  maxPlayers: 8,
  drawSeconds: 90,
  rounds: 3,
  swapCount: 0,
  revealSeconds: 8,
  wordChoices: 3,
  hintsEnabled: true,
  customWords: '',
  customPairs: '',
  customOnly: false,
};

// Fixed pacing (not host-configurable, kept snappy).
export const ART_CHOOSE_SECONDS = 15;
export const ART_VOTE_SECONDS = 45;
export const ART_TURN_RESULT_SECONDS = 7;
export const ART_IMPOSTER_RESULT_SECONDS = 14;

// ── drawing data ────────────────────────────────────────────────────────────

/** Strokes live in a square normalized space: 0..1000 on both axes. */
export const ART_CANVAS_UNITS = 1000;
export const ART_MAX_STROKE_POINTS = 1200;
export const ART_MAX_CANVAS_STROKES = 800;
export const ART_MAX_GUESS_LENGTH = 40;

export const ART_BRUSH_COLORS = [
  '#111111', // ink
  '#7a7a7a', // grey
  '#ffffff', // white (on paper this is the eraser's cousin)
  '#d8342c', // red
  '#f07c22', // orange
  '#f2c114', // yellow
  '#3f9d3a', // green
  '#2f80d0', // blue
  '#6a3fb5', // purple
  '#e06a9e', // pink
  '#7b4a21', // brown
  '#8fd8f0', // sky
] as const;

/** Brush diameters in canvas units (÷1000 of the canvas side). */
export const ART_BRUSH_SIZES = [6, 12, 24, 48] as const;

export interface ArtStroke {
  /** Seat that drew it. */
  seat: number;
  /** Client-assigned id, unique per seat within a game. */
  id: number;
  color: string;
  /** Diameter in canvas units. */
  size: number;
  /** Eraser stroke: painted in paper color. */
  erase?: boolean;
  /** Flattened points: x0, y0, x1, y1, … in 0..1000 ints. */
  pts: number[];
}

// ── redacted view ───────────────────────────────────────────────────────────

export type ArtPhase =
  | 'draw' //       swap / imposter / guess: pens down
  | 'reveal' //     swap: canvases shown one at a time
  | 'gallery' //    swap: terminal — browse everything
  | 'vote' //       imposter: pick the fake
  | 'result' //     imposter: round reveal
  | 'choose' //     guess: drawer picks a word
  | 'turnResult' // guess: word + points between turns
  | 'final'; //     imposter / guess: terminal scoreboard

export interface ArtPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
  /** Cumulative score this game (always 0 in swap — it has no scoring). */
  score: number;
  /** Finished drawing (swap/imposter draw phases). */
  done: boolean;
  /** Has cast a vote (imposter vote phase). */
  voted: boolean;
  /** Guessed the current word (guess draw phase). */
  correct: boolean;
}

/**
 * A canvas the viewer is allowed to see right now. When `strokes` is present
 * the client replaces its cached copy wholesale (the server is authoritative);
 * when absent the client renders from its stroke cache (fed by events).
 */
export interface ArtCanvasView {
  key: string;
  strokes?: ArtStroke[];
  prompt?: string | null;
  ownerSeat?: number | null;
  /** Seats that drew on it, in turn order (swap reveal/gallery). */
  contributors?: number[];
}

export interface ArtChatMessage {
  id: number;
  /** -1 = system line. */
  seat: number;
  text: string;
  kind: 'chat' | 'correct' | 'close' | 'system';
}

/** One finished guess-mode turn, for the end-of-game replay browser. */
export interface ArtTurnArchive {
  turnIndex: number;
  /** 1-based guess round this turn belonged to. */
  round: number;
  drawerSeat: number;
  word: string;
  /** Stroke-cache key of the drawing (strokes arrive via events/resync). */
  canvasKey: string;
  correct: { seat: number; ms: number; points: number }[];
  drawerPoints: number;
}

export interface ArtGuessStats {
  seat: number;
  score: number;
  correctGuesses: number;
  drawingsCompleted: number;
  /** Mean time-to-correct-guess in ms, or null if they never guessed one. */
  avgGuessMs: number | null;
}

export interface ArtView {
  g: 'art';
  mode: ArtMode;
  phase: ArtPhase;
  yourSeat: number;
  /** Which game this is (the room's round counter). */
  round: number;
  /** Internal progress: swap turns, imposter rounds, or guess turns. */
  subRound: { current: number; total: number } | null;
  deadline: number | null;
  paused: boolean;
  players: ArtPlayerView[];
  settings: ArtSettings;
  canvases: ArtCanvasView[];
  /** Canvas key your strokes go to right now, or null when you can't draw. */
  yourCanvasKey: string | null;
  /** Your private prompt (swap/imposter), or the word when you're the drawer. */
  yourPrompt: string | null;
  swap: {
    /** Reveal phase: index of the canvas on screen, else null. */
    revealIndex: number | null;
    /** Reveal/gallery listing: every canvas with prompt + contributors. */
    entries: { key: string; prompt: string; contributors: number[] }[];
  } | null;
  imposter: {
    votedSeats: number[];
    yourVote: number | null;
    result: {
      imposterSeat: number;
      commonWord: string;
      imposterWord: string;
      votes: { voter: number; target: number }[];
      caught: boolean;
      points: { seat: number; delta: number; reason: string }[];
    } | null;
  } | null;
  guess: {
    drawerSeat: number;
    turnIndex: number;
    turnCount: number;
    /** Offered words — drawer only, choose phase. */
    choices: string[] | null;
    /**
     * Masked word for active guessers: revealed letters in place, '_' for
     * hidden ones, spaces/punctuation kept (e.g. "e_e_h__t").
     */
    wordPattern: string | null;
    /** The word — drawer, correct guessers, and everyone once the turn ends. */
    word: string | null;
    messages: ArtChatMessage[];
    correctSeats: number[];
    turnResult: { word: string; points: { seat: number; delta: number }[]; everyoneGuessed: boolean } | null;
    /** Final phase: per-turn replay metadata (drawings come from the cache). */
    archive: ArtTurnArchive[] | null;
    stats: ArtGuessStats[] | null;
  } | null;
  /** Terminal phases: winners by top score (empty for swap — no scoring). */
  result: { winnerSeats: number[] } | null;
}

// ── player actions ──────────────────────────────────────────────────────────

export type ArtAction =
  /** Add points to a stroke; chunks stream in sharing the same id. */
  | { t: 'stroke'; cv: string; id: number; color: string; size: number; erase?: boolean; pts: number[] }
  /** Remove one of your own strokes. */
  | { t: 'strokeUndo'; cv: string; id: number }
  /** Remove all of your strokes on this canvas. */
  | { t: 'strokeClear'; cv: string }
  /** Toggle "I'm finished drawing" (swap/imposter). */
  | { t: 'done'; done: boolean }
  /** Guess: drawer picks one of the offered words. */
  | { t: 'chooseWord'; index: number }
  /** Guess: submit a guess (or, once correct, chat with other insiders). */
  | { t: 'guess'; text: string }
  /** Imposter: vote for who drew the odd one out. */
  | { t: 'vote'; seat: number }
  /** Swap reveal: skip ahead to the next canvas. */
  | { t: 'advance' };

// ── custom prompt parsing (shared so the lobby can preview counts) ──────────

const WORD_RE = /^[\p{L}\p{N}][\p{L}\p{N} '&-]{0,29}$/u;

function cleanWord(raw: string): string | null {
  const w = raw.trim().replace(/\s+/g, ' ');
  if (w.length < 2 || !WORD_RE.test(w)) return null;
  return w;
}

/** Parse a custom word list (commas/newlines/semicolons): trimmed, deduped. */
export function parseCustomWords(text: string, cap = 400): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(/[\n,;]/)) {
    const w = cleanWord(part);
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
    if (out.length >= cap) break;
  }
  return out;
}

/** Parse imposter pairs: one per line, the two prompts split by "/". */
export function parseCustomPairs(text: string, cap = 200): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\n/)) {
    const bits = line.split('/');
    if (bits.length !== 2) continue;
    const a = cleanWord(bits[0]!);
    const b = cleanWord(bits[1]!);
    if (!a || !b || a.toLowerCase() === b.toLowerCase()) continue;
    const key = `${a.toLowerCase()}/${b.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
    if (out.length >= cap) break;
  }
  return out;
}
