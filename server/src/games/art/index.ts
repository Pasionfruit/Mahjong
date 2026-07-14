import {
  ART_ABSOLUTE_MAX_PLAYERS,
  ART_IMPOSTER_MIN_PLAYERS,
  ART_MIN_PLAYERS,
  DEFAULT_ART_SETTINGS,
  type ArtAction,
  type ArtCanvasView,
  type ArtChatMessage,
  type ArtGuessStats,
  type ArtPlayerView,
  type ArtSettings,
  type ArtView,
} from '@shared/art';
import type { ClientGameView, GameEvent } from '@shared/view';
import { DISCONNECT_TURN_GRACE_MS } from '@shared/settings';
import type { GameModule, SeatMeta } from '../GameModule';
import {
  applyArtAction,
  artAwaitingSeat,
  artDeadlineMs,
  artSettleDisconnected,
  artTick,
  artTimeout,
  maskWord,
  newArtGame,
  swapCanvasIndex,
  type ArtCanvas,
  type ArtState,
  type GuessArtState,
  type ImposterArtState,
  type SwapArtState,
} from './engine';
import { sanitizeArtSettings } from './settings';

// Canvas keys: s{index} (swap), i{round}_{seat} (imposter), t{turn} (guess).
const CV_RE = /^[a-z]\d{1,4}(?:_\d{1,4})?$/;

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  switch (x.t) {
    case 'stroke':
      return (
        typeof x.cv === 'string' &&
        CV_RE.test(x.cv) &&
        typeof x.id === 'number' &&
        typeof x.color === 'string' &&
        x.color.length <= 7 &&
        typeof x.size === 'number' &&
        Array.isArray(x.pts) &&
        x.pts.length <= 2048 &&
        (x.erase === undefined || typeof x.erase === 'boolean')
      );
    case 'strokeUndo':
      return typeof x.cv === 'string' && CV_RE.test(x.cv) && typeof x.id === 'number';
    case 'strokeClear':
      return typeof x.cv === 'string' && CV_RE.test(x.cv);
    case 'done':
      return typeof x.done === 'boolean';
    case 'chooseWord':
      return typeof x.index === 'number' && Number.isInteger(x.index) && x.index >= 0 && x.index < 8;
    case 'guess':
      return typeof x.text === 'string' && x.text.length > 0 && x.text.length <= 200;
    case 'vote':
      return typeof x.seat === 'number' && Number.isInteger(x.seat);
    case 'advance':
      return true;
    default:
      return false;
  }
}

// ── redaction ───────────────────────────────────────────────────────────────

function canvasView(
  canvas: ArtCanvas,
  opts: { strokes?: boolean; prompt?: boolean } = {},
): ArtCanvasView {
  return {
    key: canvas.key,
    ...(opts.strokes ? { strokes: canvas.strokes.map((s) => ({ ...s, pts: [...s.pts] })) } : {}),
    ...(opts.prompt ? { prompt: canvas.prompt } : {}),
    ownerSeat: canvas.ownerSeat,
    contributors: [...canvas.contributors],
  };
}

function basePlayers(state: ArtState, seats: SeatMeta[]): ArtPlayerView[] {
  return seats.map((meta, seat) => ({
    seat,
    nickname: meta.nickname,
    connected: meta.connected,
    isHost: meta.isHost,
    isBot: meta.isBot,
    wins: meta.wins,
    score: state.scores[seat] ?? 0,
    done: state.done[seat] ?? false,
    voted: state.mode === 'imposter' ? state.votes[seat] !== null : false,
    correct: state.mode === 'guess' ? state.correct.some((c) => c.seat === seat) : false,
  }));
}

function swapView(state: SwapArtState, viewer: number, view: ArtView): void {
  view.subRound = { current: Math.min(state.turn + 1, state.turns), total: state.turns };
  const revealedUpTo =
    state.phase === 'gallery' ? state.canvases.length : (state.revealIndex ?? -1) + 1;
  view.swap = {
    revealIndex: state.revealIndex,
    entries: state.canvases.slice(0, Math.max(0, revealedUpTo)).map((c) => ({
      key: c.key,
      prompt: c.prompt,
      contributors: [...c.contributors],
    })),
  };
  if (state.phase === 'draw' && viewer >= 0 && viewer < state.playerCount) {
    const canvas = state.canvases[swapCanvasIndex(state, viewer)]!;
    view.canvases = [canvasView(canvas, { strokes: true, prompt: true })];
    view.yourPrompt = canvas.prompt;
    view.yourCanvasKey = state.done[viewer] ? null : canvas.key;
  } else if (state.phase === 'reveal' && state.revealIndex !== null) {
    const canvas = state.canvases[state.revealIndex]!;
    view.canvases = [canvasView(canvas, { strokes: true, prompt: true })];
  }
  // Gallery renders from the client stroke cache (filled during the reveal).
}

function imposterView(state: ImposterArtState, viewer: number, view: ArtView): void {
  view.subRound = { current: Math.min(state.subRound + 1, state.settings.rounds), total: state.settings.rounds };
  view.imposter = {
    votedSeats: state.votes.flatMap((v, seat) => (v !== null ? [seat] : [])),
    yourVote: viewer >= 0 ? (state.votes[viewer] ?? null) : null,
    result: state.phase === 'result' || state.phase === 'final' ? state.lastResult : null,
  };
  if (state.phase === 'draw') {
    if (viewer >= 0 && viewer < state.playerCount) {
      const canvas = state.canvases[viewer]!;
      view.canvases = [canvasView(canvas, { strokes: true, prompt: true })];
      view.yourPrompt = canvas.prompt;
      view.yourCanvasKey = state.done[viewer] ? null : canvas.key;
    }
  } else if (state.phase === 'vote' || state.phase === 'result') {
    view.canvases = state.canvases.map((c) => canvasView(c, { strokes: true }));
  }
}

function guessView(state: GuessArtState, viewer: number, view: ArtView): void {
  const round = Math.min(Math.floor(state.turnIndex / state.playerCount) + 1, state.settings.rounds);
  view.subRound = { current: round, total: state.settings.rounds };
  const isDrawer = viewer === state.drawerSeat;
  const isInsider = isDrawer || state.correct.some((c) => c.seat === viewer);
  const wordVisible = state.word !== null && (isInsider || state.phase !== 'draw');

  const messages: ArtChatMessage[] = [];
  for (const m of state.messages) {
    if (m.toSeat !== undefined && m.toSeat !== viewer) continue;
    if (m.visibility === 'insiders' && !isInsider) continue;
    messages.push({ id: m.id, seat: m.seat, text: m.text, kind: m.kind });
  }

  let stats: ArtGuessStats[] | null = null;
  if (state.phase === 'final') {
    stats = state.scores.map((score, seat) => ({
      seat,
      score,
      correctGuesses: state.correctCount[seat] ?? 0,
      drawingsCompleted: state.drawnCount[seat] ?? 0,
      avgGuessMs:
        (state.correctCount[seat] ?? 0) > 0
          ? Math.round(state.guessMsSum[seat]! / state.correctCount[seat]!)
          : null,
    }));
  }

  view.guess = {
    drawerSeat: state.drawerSeat,
    turnIndex: state.turnIndex,
    turnCount: state.turnCount,
    choices: state.phase === 'choose' && isDrawer ? [...state.choices] : null,
    wordPattern:
      state.phase === 'draw' && state.word && !isInsider
        ? maskWord(state.word, state.letterOrder, state.hintCount)
        : null,
    word: wordVisible ? state.word : null,
    messages: messages.slice(-60),
    correctSeats: state.correct.map((c) => c.seat),
    turnResult: state.phase === 'turnResult' ? state.turnResult : null,
    archive:
      state.phase === 'final'
        ? state.archive.map(({ strokes: _strokes, ...meta }) => ({ ...meta, correct: [...meta.correct] }))
        : null,
    stats,
  };
  if (state.canvas && (state.phase === 'draw' || state.phase === 'turnResult')) {
    view.canvases = [canvasView(state.canvas)];
    if (state.phase === 'draw' && isDrawer) view.yourCanvasKey = state.canvas.key;
  }
  if (isDrawer && state.word) view.yourPrompt = state.word;
}

function redact(
  state: ArtState,
  viewer: number,
  seats: SeatMeta[],
  deadline: number | null,
  paused: boolean,
): ArtView {
  const view: ArtView = {
    g: 'art',
    mode: state.mode,
    phase: state.phase,
    yourSeat: viewer,
    round: state.round,
    subRound: null,
    deadline,
    paused,
    players: basePlayers(state, seats),
    settings: { ...state.settings },
    canvases: [],
    yourCanvasKey: null,
    yourPrompt: null,
    swap: null,
    imposter: null,
    guess: null,
    result: state.over ? { winnerSeats: [...state.winnerSeats] } : null,
  };
  if (state.mode === 'swap') swapView(state, viewer, view);
  else if (state.mode === 'imposter') imposterView(state, viewer, view);
  else guessView(state, viewer, view);
  return view;
}

// ── resync (rebuild a rejoining client's stroke cache) ──────────────────────

function strokeEvents(canvas: ArtCanvas): GameEvent[] {
  return canvas.strokes.map((s) => ({
    t: 'stroke' as const,
    cv: canvas.key,
    seat: s.seat,
    id: s.id,
    color: s.color,
    size: s.size,
    ...(s.erase ? { erase: true } : {}),
    pts: [...s.pts],
    full: true,
  }));
}

function resync(state: ArtState): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.mode === 'swap') {
    // Reveal/gallery render from the cache; the draw-phase view carries its own.
    const upTo =
      state.phase === 'gallery'
        ? state.canvases.length
        : state.phase === 'reveal'
          ? (state.revealIndex ?? 0) + 1
          : 0;
    for (const canvas of state.canvases.slice(0, upTo)) events.push(...strokeEvents(canvas));
  } else if (state.mode === 'guess') {
    for (const turn of state.archive) {
      events.push(
        ...strokeEvents({
          key: turn.canvasKey,
          prompt: turn.word,
          strokes: turn.strokes,
          contributors: [],
          ownerSeat: turn.drawerSeat,
        }),
      );
    }
    if (state.canvas) events.push(...strokeEvents(state.canvas));
  }
  // Imposter views always carry the strokes the viewer may see.
  return events;
}

// ── module ──────────────────────────────────────────────────────────────────

/** The art-games module: swap / imposter / guess, all player-only (no bots). */
export const artModule: GameModule = {
  id: 'art',
  minPlayers: ART_MIN_PLAYERS,
  maxPlayers: ART_ABSOLUTE_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: false,
  tickMs: 1000,
  tick: (state) => artTick(state as ArtState),

  defaultSettings: () => ({ ...DEFAULT_ART_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeArtSettings(current as ArtSettings, (patch ?? {}) as Partial<ArtSettings>),
  playerBounds: (settings) => {
    const s = settings as ArtSettings;
    return {
      min: s.mode === 'imposter' ? ART_IMPOSTER_MIN_PLAYERS : ART_MIN_PLAYERS,
      max: Math.min(s.maxPlayers, ART_ABSOLUTE_MAX_PLAYERS),
    };
  },

  startRound: (settings, playerCount, dealerSeat, round, seed) =>
    newArtGame(settings as ArtSettings, playerCount, dealerSeat, round, seed),

  applyAction: (state, seat, action) => applyArtAction(state as ArtState, seat, action as ArtAction),
  applyTimeout: (state) => artTimeout(state as ArtState),
  isRoundOver: (state) => (state as ArtState).over,

  deadlineHintMs: (state) => artDeadlineMs(state as ArtState),
  awaitingSeat: (state) => artAwaitingSeat(state as ArtState),
  pendingSeats: () => [], // player-only game: no bot scheduling
  settleDisconnected: (state, connected) => artSettleDisconnected(state as ArtState, connected),

  botDelayMs: () => 0,
  chooseAction: (): ArtAction => ({ t: 'done', done: true }),
  fallbackAction: (): ArtAction => ({ t: 'done', done: true }),

  validateAction,
  redactFor: (state, viewerSeat, seats, deadline, paused): ClientGameView =>
    redact(state as ArtState, viewerSeat, seats, deadline, paused),
  resyncEvents: (state) => resync(state as ArtState),
};
