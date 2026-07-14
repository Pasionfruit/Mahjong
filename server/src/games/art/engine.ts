import {
  ART_CHOOSE_SECONDS,
  ART_IMPOSTER_RESULT_SECONDS,
  ART_MAX_CANVAS_STROKES,
  ART_MAX_GUESS_LENGTH,
  ART_MAX_STROKE_POINTS,
  ART_TURN_RESULT_SECONDS,
  ART_VOTE_SECONDS,
  ART_CANVAS_UNITS,
  parseCustomPairs,
  parseCustomWords,
  type ArtAction,
  type ArtPhase,
  type ArtSettings,
  type ArtStroke,
  type ArtTurnArchive,
} from '@shared/art';
import type { GameEvent } from '@shared/view';
import type { ApplyResult } from '../GameModule';
import { mulberry32 } from '../../engine/rng';
import { DEFAULT_WORDS, IMPOSTER_PAIRS } from './words';

// ── state ───────────────────────────────────────────────────────────────────

export interface ArtCanvas {
  key: string;
  prompt: string;
  strokes: ArtStroke[];
  /** Seats that drew on it, in turn order (swap). */
  contributors: number[];
  ownerSeat: number | null;
}

interface StoredMessage {
  id: number;
  seat: number;
  text: string;
  kind: 'chat' | 'correct' | 'close' | 'system';
  /** Who may read it: everyone, or only the drawer + correct guessers. */
  visibility: 'all' | 'insiders';
  /** When set, only this seat receives it (e.g. "close!" nudges). */
  toSeat?: number;
}

interface ArtStateBase {
  settings: ArtSettings;
  playerCount: number;
  round: number;
  rng: () => number;
  phase: ArtPhase;
  /** Seconds elapsed in the current phase — advanced by tick(), so it freezes
   *  while the room is paused and hint/scoring math stays pause-safe. */
  phaseTick: number;
  /** Current phase length in seconds; null = untimed (terminal phases). */
  phaseSeconds: number | null;
  scores: number[];
  connected: boolean[];
  /** "I'm finished drawing" flags (swap/imposter draw phases). */
  done: boolean[];
  over: boolean;
  winnerSeats: number[];
  chatSeq: number;
}

export interface SwapArtState extends ArtStateBase {
  mode: 'swap';
  canvases: ArtCanvas[];
  /** Random rank per seat; seat draws canvas (rank + turn) % playerCount. */
  order: number[];
  turn: number;
  turns: number;
  revealIndex: number | null;
}

export interface ImposterArtState extends ArtStateBase {
  mode: 'imposter';
  subRound: number;
  imposterSeat: number;
  commonWord: string;
  imposterWord: string;
  /** One private canvas per seat. */
  canvases: ArtCanvas[];
  votes: (number | null)[];
  lastResult: {
    imposterSeat: number;
    commonWord: string;
    imposterWord: string;
    votes: { voter: number; target: number }[];
    caught: boolean;
    points: { seat: number; delta: number; reason: string }[];
  } | null;
  pairPool: [string, string][];
  pairCursor: number;
}

export interface GuessArtState extends ArtStateBase {
  mode: 'guess';
  turnIndex: number;
  turnCount: number;
  turnOrder: number[];
  drawerSeat: number;
  choices: string[];
  word: string | null;
  /** Maskable char indices of the word, in hint-reveal order. */
  letterOrder: number[];
  hintCount: number;
  canvas: ArtCanvas | null;
  /** Correct guesses this turn. */
  correct: { seat: number; tick: number; points: number }[];
  messages: StoredMessage[];
  archive: (ArtTurnArchive & { strokes: ArtStroke[] })[];
  wordPool: string[];
  wordCursor: number;
  turnResult: { word: string; points: { seat: number; delta: number }[]; everyoneGuessed: boolean } | null;
  // per-seat stats for the final screen
  drawnCount: number[];
  correctCount: number[];
  guessMsSum: number[];
}

export type ArtState = SwapArtState | ImposterArtState | GuessArtState;

// ── helpers ─────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

function buildWordPool(settings: ArtSettings, rng: () => number): string[] {
  const custom = parseCustomWords(settings.customWords);
  const pool =
    settings.customOnly && custom.length >= 10
      ? [...custom]
      : [...new Set([...DEFAULT_WORDS, ...custom])];
  return shuffle(pool, rng);
}

function buildPairPool(settings: ArtSettings, rng: () => number): [string, string][] {
  const custom = parseCustomPairs(settings.customPairs);
  const pool: [string, string][] =
    settings.customOnly && custom.length >= 3
      ? [...custom]
      : [...IMPOSTER_PAIRS.map((p): [string, string] => [p[0], p[1]]), ...custom];
  return shuffle(pool, rng);
}

/** Draw `count` words off the shuffled pool, reshuffling at the wrap. */
function nextWords(state: { wordPool: string[]; wordCursor: number; rng: () => number }, count: number): string[] {
  const out: string[] = [];
  while (out.length < count) {
    if (state.wordCursor >= state.wordPool.length) {
      shuffle(state.wordPool, state.rng);
      state.wordCursor = 0;
    }
    const w = state.wordPool[state.wordCursor++]!;
    if (!out.includes(w)) out.push(w);
    else if (state.wordPool.length <= count) out.push(w); // tiny pools: allow repeats
  }
  return out;
}

const MASKABLE = /[\p{L}\p{N}]/u;

/** Indices of the word's hidden-by-default characters. */
export function maskableIndices(word: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < word.length; i++) if (MASKABLE.test(word[i]!)) out.push(i);
  return out;
}

/** How many letters are revealed once `fraction` of the timer has elapsed. */
export function hintCountFor(letterCount: number, fraction: number, enabled: boolean): number {
  if (!enabled || letterCount <= 1) return 0;
  const cap = letterCount - 1;
  if (fraction >= 0.75) return Math.min(cap, Math.max(3, Math.round(letterCount * 0.6)));
  if (fraction >= 0.5) return Math.min(cap, Math.max(2, Math.round(letterCount * 0.35)));
  if (fraction >= 0.25) return Math.min(cap, Math.max(1, Math.round(letterCount * 0.15)));
  return 0;
}

/** The masked word guessers see: revealed letters in place, '_' elsewhere. */
export function maskWord(word: string, letterOrder: number[], hintCount: number): string {
  const revealed = new Set(letterOrder.slice(0, hintCount));
  let out = '';
  for (let i = 0; i < word.length; i++) {
    out += MASKABLE.test(word[i]!) && !revealed.has(i) ? '_' : word[i]!;
  }
  return out;
}

export function normalizeGuess(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Levenshtein distance, for "you're close!" nudges. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function fail(error: string): ApplyResult {
  return { ok: false, error };
}

function stepOk(events: GameEvent[] = []): ApplyResult {
  return { ok: true, events };
}

function phaseEvent(state: ArtState, events: GameEvent[]): void {
  events.push({ t: 'artPhase', phase: state.phase });
}

function setPhase(state: ArtState, phase: ArtPhase, seconds: number | null): void {
  state.phase = phase;
  state.phaseTick = 0;
  state.phaseSeconds = seconds;
}

function systemMessage(state: GuessArtState, text: string, opts?: Partial<StoredMessage>): void {
  state.messages.push({
    id: state.chatSeq++,
    seat: -1,
    text,
    kind: 'system',
    visibility: 'all',
    ...opts,
  });
  if (state.messages.length > 120) state.messages.splice(0, state.messages.length - 120);
}

// ── game setup ──────────────────────────────────────────────────────────────

export function newArtGame(
  settings: ArtSettings,
  playerCount: number,
  dealerSeat: number,
  round: number,
  seed: number,
): { state: ArtState; events: GameEvent[] } {
  const rng = mulberry32(seed);
  const base = {
    settings: { ...settings },
    playerCount,
    round,
    rng,
    phaseTick: 0,
    scores: Array(playerCount).fill(0) as number[],
    connected: Array(playerCount).fill(true) as boolean[],
    done: Array(playerCount).fill(false) as boolean[],
    over: false,
    winnerSeats: [] as number[],
    chatSeq: 0,
  };
  const events: GameEvent[] = [{ t: 'roundStart', round, dealerSeat }];

  if (settings.mode === 'swap') {
    const wordState = { wordPool: buildWordPool(settings, rng), wordCursor: 0, rng };
    const prompts = nextWords(wordState, playerCount);
    const turns =
      settings.swapCount > 0 ? Math.min(settings.swapCount, playerCount) : playerCount;
    const state: SwapArtState = {
      ...base,
      mode: 'swap',
      phase: 'draw',
      phaseSeconds: settings.drawSeconds,
      canvases: prompts.map((prompt, i) => ({
        key: `s${i}`,
        prompt,
        strokes: [],
        contributors: [],
        ownerSeat: null,
      })),
      order: shuffle(Array.from({ length: playerCount }, (_, i) => i), rng),
      turn: 0,
      turns,
      revealIndex: null,
    };
    phaseEvent(state, events);
    return { state, events };
  }

  if (settings.mode === 'imposter') {
    const state: ImposterArtState = {
      ...base,
      mode: 'imposter',
      phase: 'draw',
      phaseSeconds: settings.drawSeconds,
      subRound: 0,
      imposterSeat: 0,
      commonWord: '',
      imposterWord: '',
      canvases: [],
      votes: Array(playerCount).fill(null) as (number | null)[],
      lastResult: null,
      pairPool: buildPairPool(settings, rng),
      pairCursor: 0,
    };
    beginImposterRound(state);
    phaseEvent(state, events);
    return { state, events };
  }

  const turnOrder: number[] = [];
  for (let r = 0; r < settings.rounds; r++) {
    for (let i = 0; i < playerCount; i++) turnOrder.push((dealerSeat + i) % playerCount);
  }
  const state: GuessArtState = {
    ...base,
    mode: 'guess',
    phase: 'choose',
    phaseSeconds: ART_CHOOSE_SECONDS,
    turnIndex: 0,
    turnCount: turnOrder.length,
    turnOrder,
    drawerSeat: turnOrder[0]!,
    choices: [],
    word: null,
    letterOrder: [],
    hintCount: 0,
    canvas: null,
    correct: [],
    messages: [],
    archive: [],
    wordPool: buildWordPool(settings, rng),
    wordCursor: 0,
    turnResult: null,
    drawnCount: Array(playerCount).fill(0) as number[],
    correctCount: Array(playerCount).fill(0) as number[],
    guessMsSum: Array(playerCount).fill(0) as number[],
  };
  beginChoose(state, events);
  return { state, events };
}

// ── swap: assignment & flow ─────────────────────────────────────────────────

/** Canvas index the seat draws on during the given turn. */
export function swapCanvasIndex(state: SwapArtState, seat: number, turn = state.turn): number {
  return (state.order[seat]! + turn) % state.playerCount;
}

/** Seat assigned to the canvas during the given turn. */
export function swapSeatFor(state: SwapArtState, canvasIndex: number, turn = state.turn): number {
  const rank = (canvasIndex - turn + state.playerCount * state.turns) % state.playerCount;
  return state.order.indexOf(rank);
}

function endSwapTurn(state: SwapArtState, events: GameEvent[]): void {
  for (let c = 0; c < state.canvases.length; c++) {
    state.canvases[c]!.contributors.push(swapSeatFor(state, c));
  }
  state.turn += 1;
  state.done.fill(false);
  if (state.turn >= state.turns) {
    state.revealIndex = 0;
    setPhase(state, 'reveal', state.settings.revealSeconds);
  } else {
    setPhase(state, 'draw', state.settings.drawSeconds);
  }
  phaseEvent(state, events);
}

function advanceReveal(state: SwapArtState, events: GameEvent[]): void {
  state.revealIndex = (state.revealIndex ?? 0) + 1;
  if (state.revealIndex >= state.canvases.length) {
    state.revealIndex = null;
    setPhase(state, 'gallery', null);
    state.over = true;
  } else {
    setPhase(state, 'reveal', state.settings.revealSeconds);
  }
  phaseEvent(state, events);
}

// ── imposter: flow & scoring ────────────────────────────────────────────────

function beginImposterRound(state: ImposterArtState): void {
  if (state.pairCursor >= state.pairPool.length) {
    shuffle(state.pairPool, state.rng);
    state.pairCursor = 0;
  }
  const pair = state.pairPool[state.pairCursor++]!;
  const flip = state.rng() < 0.5;
  state.commonWord = flip ? pair[1] : pair[0];
  state.imposterWord = flip ? pair[0] : pair[1];
  state.imposterSeat = Math.floor(state.rng() * state.playerCount);
  state.canvases = Array.from({ length: state.playerCount }, (_, seat) => ({
    key: `i${state.subRound}_${seat}`,
    prompt: seat === state.imposterSeat ? state.imposterWord : state.commonWord,
    strokes: [],
    contributors: [seat],
    ownerSeat: seat,
  }));
  state.votes = Array(state.playerCount).fill(null) as (number | null)[];
  state.done.fill(false);
  setPhase(state, 'draw', state.settings.drawSeconds);
}

function tallyImposterVotes(state: ImposterArtState, events: GameEvent[]): void {
  const received = Array(state.playerCount).fill(0) as number[];
  const votes: { voter: number; target: number }[] = [];
  state.votes.forEach((target, voter) => {
    if (target === null) return;
    votes.push({ voter, target });
    received[target]! += 1;
  });
  const most = Math.max(0, ...received);
  const caught = most > 0 && received[state.imposterSeat] === most;

  const points: { seat: number; delta: number; reason: string }[] = [];
  const award = (seat: number, delta: number, reason: string) => {
    state.scores[seat]! += delta;
    points.push({ seat, delta, reason });
  };
  for (const { voter, target } of votes) {
    if (target === state.imposterSeat && voter !== state.imposterSeat) {
      award(voter, 100, 'spotted the imposter');
    }
  }
  if (!caught) award(state.imposterSeat, 250, 'escaped detection');
  if (received[state.imposterSeat] === 0) award(state.imposterSeat, 100, 'not a single vote');

  state.lastResult = {
    imposterSeat: state.imposterSeat,
    commonWord: state.commonWord,
    imposterWord: state.imposterWord,
    votes,
    caught,
    points,
  };
  setPhase(state, 'result', ART_IMPOSTER_RESULT_SECONDS);
  phaseEvent(state, events);
}

function finishWithScores(state: ArtState, events: GameEvent[]): void {
  const top = Math.max(...state.scores);
  state.winnerSeats = top > 0 ? state.scores.flatMap((s, seat) => (s === top ? [seat] : [])) : [];
  setPhase(state, 'final', null);
  state.over = true;
  for (const seat of state.winnerSeats) events.push({ t: 'win', seat, by: 'lastStanding' });
  phaseEvent(state, events);
}

// ── guess: flow & scoring ───────────────────────────────────────────────────

function beginChoose(state: GuessArtState, events: GameEvent[]): void {
  // Skip drawers who are gone; if everyone is gone, fall through to the first.
  let hops = 0;
  while (
    state.turnIndex < state.turnCount &&
    !state.connected[state.turnOrder[state.turnIndex]!] &&
    hops < state.playerCount
  ) {
    state.turnIndex += 1;
    hops += 1;
  }
  if (state.turnIndex >= state.turnCount) {
    finishGuess(state, events);
    return;
  }
  state.drawerSeat = state.turnOrder[state.turnIndex]!;
  state.choices = nextWords(state, state.settings.wordChoices);
  state.word = null;
  state.canvas = null;
  state.correct = [];
  state.turnResult = null;
  state.hintCount = 0;
  setPhase(state, 'choose', ART_CHOOSE_SECONDS);
  phaseEvent(state, events);
}

function beginGuessDrawing(state: GuessArtState, word: string, events: GameEvent[]): void {
  state.word = word;
  state.letterOrder = shuffle(maskableIndices(word), state.rng);
  state.hintCount = 0;
  state.canvas = {
    key: `t${state.turnIndex}`,
    prompt: word,
    strokes: [],
    contributors: [state.drawerSeat],
    ownerSeat: state.drawerSeat,
  };
  // seat >= 0 on a system line = "<nickname> {text}", rendered client-side.
  systemMessage(state, 'is drawing now!', { seat: state.drawerSeat });
  setPhase(state, 'draw', state.settings.drawSeconds);
  phaseEvent(state, events);
}

function guesserPoints(state: GuessArtState): number {
  const total = state.phaseSeconds ?? state.settings.drawSeconds;
  const left = Math.max(0, total - state.phaseTick);
  return 100 + Math.round((200 * left) / total);
}

const DRAWER_POINTS_PER_GUESS = 50;

function activeGuessers(state: GuessArtState): number[] {
  const out: number[] = [];
  for (let seat = 0; seat < state.playerCount; seat++) {
    if (seat === state.drawerSeat || !state.connected[seat]) continue;
    if (!state.correct.some((c) => c.seat === seat)) out.push(seat);
  }
  return out;
}

function endGuessTurn(state: GuessArtState, events: GameEvent[]): void {
  const word = state.word ?? '';
  const drawerPoints = state.correct.length * DRAWER_POINTS_PER_GUESS;
  state.scores[state.drawerSeat]! += drawerPoints;
  state.drawnCount[state.drawerSeat]! += 1;

  const points = state.correct.map((c) => ({ seat: c.seat, delta: c.points }));
  if (drawerPoints > 0) points.push({ seat: state.drawerSeat, delta: drawerPoints });
  const everyoneGuessed =
    state.correct.length > 0 &&
    activeGuessers(state).length === 0;

  state.turnResult = { word, points, everyoneGuessed };
  state.archive.push({
    turnIndex: state.turnIndex,
    round: Math.floor(state.turnIndex / state.playerCount) + 1,
    drawerSeat: state.drawerSeat,
    word,
    canvasKey: state.canvas?.key ?? `t${state.turnIndex}`,
    correct: state.correct.map((c) => ({ seat: c.seat, ms: c.tick * 1000, points: c.points })),
    drawerPoints,
    strokes: state.canvas?.strokes ?? [],
  });
  systemMessage(state, `The word was "${word}"`);
  setPhase(state, 'turnResult', ART_TURN_RESULT_SECONDS);
  phaseEvent(state, events);
}

function finishGuess(state: GuessArtState, events: GameEvent[]): void {
  finishWithScores(state, events);
}

// ── actions ─────────────────────────────────────────────────────────────────

/** The canvas the seat may draw on right now, or null. */
export function drawableCanvas(state: ArtState, seat: number): ArtCanvas | null {
  if (state.phase !== 'draw') return null;
  if (state.mode === 'swap') {
    if (state.done[seat]) return null;
    return state.canvases[swapCanvasIndex(state, seat)] ?? null;
  }
  if (state.mode === 'imposter') {
    if (state.done[seat]) return null;
    return state.canvases[seat] ?? null;
  }
  return seat === state.drawerSeat ? state.canvas : null;
}

function strokeSync(state: ArtState, seat: number, events: GameEvent[]): ApplyResult {
  // Guess-mode strokes are public — stream them; private modes store silently.
  if (state.mode === 'guess') return { ok: true, events, sync: 'events', exceptSeat: seat };
  return { ok: true, events: [], sync: 'none' };
}

function applyStroke(
  state: ArtState,
  seat: number,
  a: Extract<ArtAction, { t: 'stroke' }>,
): ApplyResult {
  const canvas = drawableCanvas(state, seat);
  if (!canvas) return fail('you cannot draw right now');
  if (canvas.key !== a.cv) return fail('wrong canvas');
  if (!/^#[0-9a-fA-F]{6}$/.test(a.color)) return fail('invalid color');
  if (!Array.isArray(a.pts) || a.pts.length === 0 || a.pts.length % 2 !== 0) {
    return fail('invalid points');
  }
  if (a.pts.length > 2048 || !a.pts.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return fail('invalid points');
  }
  const pts = a.pts.map((n) => Math.max(0, Math.min(ART_CANVAS_UNITS, Math.round(n))));
  const size = Math.max(1, Math.min(100, Math.round(a.size)));

  const existing = canvas.strokes.find((s) => s.seat === seat && s.id === a.id);
  if (existing) {
    const room = ART_MAX_STROKE_POINTS * 2 - existing.pts.length;
    if (room <= 0) return fail('stroke too long');
    existing.pts.push(...pts.slice(0, room));
  } else {
    if (canvas.strokes.length >= ART_MAX_CANVAS_STROKES) return fail('canvas is full');
    canvas.strokes.push({
      seat,
      id: a.id,
      color: a.color,
      size,
      ...(a.erase ? { erase: true } : {}),
      pts: pts.slice(0, ART_MAX_STROKE_POINTS * 2),
    });
  }
  return strokeSync(state, seat, [
    {
      t: 'stroke',
      cv: canvas.key,
      seat,
      id: a.id,
      color: a.color,
      size,
      ...(a.erase ? { erase: true } : {}),
      pts,
    },
  ]);
}

function applyStrokeUndo(state: ArtState, seat: number, cv: string, id: number): ApplyResult {
  const canvas = drawableCanvas(state, seat);
  if (!canvas || canvas.key !== cv) return fail('you cannot draw right now');
  let idx = -1;
  for (let i = canvas.strokes.length - 1; i >= 0; i--) {
    const s = canvas.strokes[i]!;
    if (s.seat === seat && s.id === id) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return fail('no such stroke');
  canvas.strokes.splice(idx, 1);
  return strokeSync(state, seat, [{ t: 'strokeUndo', cv, seat, id }]);
}

function applyStrokeClear(state: ArtState, seat: number, cv: string): ApplyResult {
  const canvas = drawableCanvas(state, seat);
  if (!canvas || canvas.key !== cv) return fail('you cannot draw right now');
  canvas.strokes = canvas.strokes.filter((s) => s.seat !== seat);
  return strokeSync(state, seat, [{ t: 'strokeClear', cv, seat }]);
}

function applyDone(state: ArtState, seat: number, done: boolean): ApplyResult {
  if (state.phase !== 'draw' || state.mode === 'guess') return fail('nothing to finish');
  state.done[seat] = done;
  const events: GameEvent[] = [];
  const everyoneDone = state.connected.every((on, s) => !on || state.done[s]);
  if (done && everyoneDone && state.connected.some(Boolean)) {
    endDrawPhase(state, events);
  }
  return stepOk(events);
}

function endDrawPhase(state: ArtState, events: GameEvent[]): void {
  if (state.mode === 'swap') endSwapTurn(state, events);
  else if (state.mode === 'imposter') {
    setPhase(state, 'vote', ART_VOTE_SECONDS);
    phaseEvent(state, events);
  }
}

function applyChooseWord(state: ArtState, seat: number, index: number): ApplyResult {
  if (state.mode !== 'guess' || state.phase !== 'choose') return fail('no word to choose');
  if (seat !== state.drawerSeat) return fail('you are not the drawer');
  const word = state.choices[index];
  if (!word) return fail('invalid choice');
  const events: GameEvent[] = [];
  beginGuessDrawing(state, word, events);
  return stepOk(events);
}

function applyGuess(state: ArtState, seat: number, rawText: string): ApplyResult {
  if (state.mode !== 'guess') return fail('no guessing in this mode');
  const text = rawText.trim().slice(0, ART_MAX_GUESS_LENGTH);
  if (!text) return fail('say something');
  const s = state;
  const isInsider =
    seat === s.drawerSeat || s.correct.some((c) => c.seat === seat) || s.phase !== 'draw';

  // Insiders (drawer + already-correct) chat privately; no scoring, no leaks.
  if (isInsider) {
    const visibility = s.phase === 'draw' ? 'insiders' : 'all';
    s.messages.push({ id: s.chatSeq++, seat, text, kind: 'chat', visibility });
    return stepOk();
  }

  const word = s.word!;
  const guess = normalizeGuess(text);
  const target = normalizeGuess(word);
  if (guess === target) {
    const points = guesserPoints(s);
    s.correct.push({ seat, tick: s.phaseTick, points });
    s.scores[seat]! += points;
    s.correctCount[seat]! += 1;
    s.guessMsSum[seat]! += s.phaseTick * 1000;
    // Announce without echoing the word itself.
    s.messages.push({ id: s.chatSeq++, seat, text: '', kind: 'correct', visibility: 'all' });
    const events: GameEvent[] = [{ t: 'artGuess', seat, correct: true }];
    if (activeGuessers(s).length === 0) endGuessTurn(s, events);
    return stepOk(events);
  }

  s.messages.push({ id: s.chatSeq++, seat, text, kind: 'chat', visibility: 'all' });
  const close = editDistance(guess, target) <= (target.length >= 6 ? 2 : 1);
  if (close) {
    s.messages.push({
      id: s.chatSeq++,
      seat: -1,
      text: `"${text}" is close!`,
      kind: 'close',
      visibility: 'all',
      toSeat: seat,
    });
  }
  return { ok: true, events: [{ t: 'artGuess', seat, correct: false }] };
}

function applyVote(state: ArtState, seat: number, target: number): ApplyResult {
  if (state.mode !== 'imposter' || state.phase !== 'vote') return fail('no vote in progress');
  if (!Number.isInteger(target) || target < 0 || target >= state.playerCount) {
    return fail('invalid vote');
  }
  if (target === seat) return fail('you cannot vote for yourself');
  const first = state.votes[seat] === null;
  state.votes[seat] = target;
  const everyoneVoted = state.connected.every((on, s) => !on || state.votes[s] !== null);
  if (everyoneVoted) {
    const events: GameEvent[] = [];
    tallyImposterVotes(state, events);
    return stepOk(events);
  }
  // Mid-phase votes ride as events so the (heavy) vote view isn't rebroadcast.
  return first
    ? { ok: true, events: [{ t: 'artVote', seat }], sync: 'events' }
    : { ok: true, events: [], sync: 'none' };
}

function applyAdvance(state: ArtState): ApplyResult {
  if (state.mode !== 'swap' || state.phase !== 'reveal') return fail('nothing to advance');
  const events: GameEvent[] = [];
  advanceReveal(state, events);
  return stepOk(events);
}

export function applyArtAction(state: ArtState, seat: number, action: ArtAction): ApplyResult {
  if (state.over && action.t !== 'guess') return fail('the game is over');
  if (seat < 0 || seat >= state.playerCount) return fail('not seated');
  switch (action.t) {
    case 'stroke':
      return applyStroke(state, seat, action);
    case 'strokeUndo':
      return applyStrokeUndo(state, seat, action.cv, action.id);
    case 'strokeClear':
      return applyStrokeClear(state, seat, action.cv);
    case 'done':
      return applyDone(state, seat, action.done);
    case 'chooseWord':
      return applyChooseWord(state, seat, action.index);
    case 'guess':
      return applyGuess(state, seat, action.text);
    case 'vote':
      return applyVote(state, seat, action.seat);
    case 'advance':
      return applyAdvance(state);
    default:
      return fail('unknown action');
  }
}

// ── timers ──────────────────────────────────────────────────────────────────

export function artTimeout(state: ArtState): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.over) return events;
  if (state.mode === 'swap') {
    if (state.phase === 'draw') endSwapTurn(state, events);
    else if (state.phase === 'reveal') advanceReveal(state, events);
    return events;
  }
  if (state.mode === 'imposter') {
    if (state.phase === 'draw') endDrawPhase(state, events);
    else if (state.phase === 'vote') tallyImposterVotes(state, events);
    else if (state.phase === 'result') {
      state.subRound += 1;
      if (state.subRound >= state.settings.rounds) finishWithScores(state, events);
      else {
        beginImposterRound(state);
        phaseEvent(state, events);
      }
    }
    return events;
  }
  // guess
  if (state.phase === 'choose') {
    // Auto-pick for a slow (or vanished) drawer so nobody waits forever.
    const index = Math.floor(state.rng() * state.choices.length);
    beginGuessDrawing(state, state.choices[index]!, events);
  } else if (state.phase === 'draw') {
    endGuessTurn(state, events);
  } else if (state.phase === 'turnResult') {
    state.turnIndex += 1;
    beginChoose(state, events);
  }
  return events;
}

/** One-second heartbeat: advances phase clocks and unlocks letter hints. */
export function artTick(state: ArtState): { events: GameEvent[]; changed: boolean } {
  if (state.over) return { events: [], changed: false };
  state.phaseTick += 1;
  if (state.mode === 'guess' && state.phase === 'draw' && state.word) {
    const fraction = state.phaseTick / (state.phaseSeconds ?? state.settings.drawSeconds);
    const target = hintCountFor(
      state.letterOrder.length,
      fraction,
      state.settings.hintsEnabled,
    );
    if (target > state.hintCount) {
      state.hintCount = target;
      return { events: [], changed: true };
    }
  }
  return { events: [], changed: false };
}

export function artSettleDisconnected(
  state: ArtState,
  connected: (seat: number) => boolean,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (let seat = 0; seat < state.playerCount; seat++) state.connected[seat] = connected(seat);
  if (state.over) return events;
  const anyone = state.connected.some(Boolean);
  if (!anyone) return events;

  if (state.phase === 'draw' && state.mode !== 'guess') {
    if (state.connected.every((on, s) => !on || state.done[s]) && state.done.some(Boolean)) {
      endDrawPhase(state, events);
    }
  } else if (state.mode === 'imposter' && state.phase === 'vote') {
    if (state.connected.every((on, s) => !on || state.votes[s] !== null)) {
      tallyImposterVotes(state, events);
    }
  } else if (state.mode === 'guess' && state.phase === 'draw') {
    if (state.correct.length > 0 && activeGuessers(state).length === 0) {
      endGuessTurn(state, events);
    }
  }
  return events;
}

export function artDeadlineMs(state: ArtState): number | null {
  if (state.over || state.phaseSeconds === null) return null;
  return Math.max(0, state.phaseSeconds - state.phaseTick) * 1000 + 250;
}

/** Seat whose absence should shorten the phase (guess drawer only). */
export function artAwaitingSeat(state: ArtState): number | null {
  if (state.over || state.mode !== 'guess') return null;
  return state.phase === 'choose' || state.phase === 'draw' ? state.drawerSeat : null;
}
