import {
  DEFAULT_QUORIDOR_SETTINGS,
  applyMove,
  inBoard,
  inWallGrid,
  moveNotation,
  newGame,
  type Move,
  type PlayerIndex,
  type QuoridorAction,
  type QuoridorOnlineView,
  type QuoridorSettings,
  type QuoridorState,
} from '@shared/quoridor';
import { DISCONNECT_TURN_GRACE_MS, THEMES, TURN_TIMER_CHOICES } from '@shared/settings';
import type { ClientGameView, GameEvent } from '@shared/view';
import type { GameModule, SeatMeta } from '../GameModule';
import { easyMove } from './ai/easy';
import { searchBestMove } from './ai/search';

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  if (x.t === 'pawn') {
    const to = x.to as Record<string, unknown> | undefined;
    return (
      typeof to === 'object' &&
      to !== null &&
      Number.isInteger(to.r) &&
      Number.isInteger(to.c) &&
      inBoard(to.r as number, to.c as number)
    );
  }
  if (x.t === 'wall') {
    return (
      (x.o === 'h' || x.o === 'v') &&
      Number.isInteger(x.r) &&
      Number.isInteger(x.c) &&
      inWallGrid(x.r as number, x.c as number)
    );
  }
  return false;
}

function sanitizeSettings(
  current: QuoridorSettings,
  patch: Partial<QuoridorSettings>,
): QuoridorSettings | null {
  const next = { ...current };
  if (patch.turnTimerSeconds !== undefined) {
    if (!(TURN_TIMER_CHOICES as readonly number[]).includes(patch.turnTimerSeconds)) return null;
    next.turnTimerSeconds = patch.turnTimerSeconds;
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}

interface OnlineState {
  game: QuoridorState;
  settings: QuoridorSettings;
  round: number;
}

function wallIndices(grid: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] === 1) out.push(i);
  return out;
}

function view(
  s: OnlineState,
  viewerSeat: number,
  seats: SeatMeta[],
  deadline: number | null,
  paused: boolean,
): QuoridorOnlineView {
  const g = s.game;
  return {
    g: 'quoridor',
    yourSeat: viewerSeat,
    turnSeat: g.turn,
    pawns: [{ ...g.pawns[0] }, { ...g.pawns[1] }],
    hWalls: wallIndices(g.hWalls),
    vWalls: wallIndices(g.vWalls),
    wallsLeft: [g.wallsLeft[0], g.wallsLeft[1]],
    players: seats.map((meta, seat) => ({
      seat,
      nickname: meta.nickname,
      connected: meta.connected,
      isHost: meta.isHost,
      isBot: meta.isBot,
      wins: meta.wins,
      wallsLeft: g.wallsLeft[seat as PlayerIndex] ?? 0,
      pawn: { ...g.pawns[seat as PlayerIndex]! },
    })),
    lastMove: g.history.length > 0 ? { ...g.history[g.history.length - 1]!.move } : null,
    history: g.history.map((h) => moveNotation(h.move)),
    deadline,
    paused,
    settings: { ...s.settings },
    round: s.round,
    result: g.winner !== null ? { winnerSeat: g.winner } : null,
  };
}

function applyFor(s: OnlineState, seat: number, move: Move): GameEvent[] | null {
  if (s.game.turn !== seat || s.game.winner !== null) return null;
  if (!applyMove(s.game, move)) return null;
  const events: GameEvent[] = [{ t: 'place', seat }];
  if (s.game.winner !== null) events.push({ t: 'win', seat: s.game.winner, by: 'lastStanding' });
  return events;
}

/** Online Quoridor: the shared engine behind a 2-seat room module with bots. */
export const quoridorModule: GameModule = {
  id: 'quoridor',
  minPlayers: 2,
  maxPlayers: 2,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: true,

  defaultSettings: () => ({ ...DEFAULT_QUORIDOR_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as QuoridorSettings, (patch ?? {}) as Partial<QuoridorSettings>),

  startRound: (settings, _playerCount, dealerSeat, round) => {
    const game = newGame();
    game.turn = (dealerSeat % 2) as PlayerIndex; // opening move alternates
    const state: OnlineState = { game, settings: settings as QuoridorSettings, round };
    return { state, events: [{ t: 'roundStart', round, dealerSeat }] };
  },

  applyAction: (state, seat, action) => {
    const events = applyFor(state as OnlineState, seat, action as QuoridorAction);
    return events ? { ok: true, events } : { ok: false, error: 'illegal move' };
  },
  applyTimeout: (state) => {
    const s = state as OnlineState;
    if (s.game.winner !== null) return [];
    const seat = s.game.turn;
    const events: GameEvent[] = [{ t: 'timeout', seat }];
    const auto = easyMove(s.game);
    return [...events, ...(applyFor(s, seat, auto) ?? [])];
  },
  isRoundOver: (state) => (state as OnlineState).game.winner !== null,

  deadlineHintMs: (state) => {
    const t = (state as OnlineState).settings.turnTimerSeconds;
    return t > 0 ? t * 1000 : null;
  },
  awaitingSeat: (state) => {
    const s = state as OnlineState;
    return s.game.winner === null ? s.game.turn : null;
  },
  pendingSeats: (state) => {
    const s = state as OnlineState;
    return s.game.winner === null ? [{ seat: s.game.turn, kind: 'turn', fast: false }] : [];
  },
  settleDisconnected: () => [], // the turn timer / grace unsticks the game

  // Server-side budgets are modest so a hard bot never stalls the event loop.
  botDelayMs: (difficulty) => (difficulty === 'easy' ? 900 : difficulty === 'medium' ? 800 : 700),
  chooseAction: (state, _seat, difficulty): QuoridorAction => {
    const g = (state as OnlineState).game;
    if (difficulty === 'easy') return easyMove(g);
    if (difficulty === 'medium') {
      return searchBestMove(g, {
        maxDepth: 2,
        timeBudgetMs: 120,
        gateWalls: true,
        wallCap: 8,
        noise: 75,
        rng: Math.random,
      }).move;
    }
    return searchBestMove(g, { maxDepth: 4, timeBudgetMs: 220 }).move;
  },
  fallbackAction: (state): QuoridorAction => easyMove((state as OnlineState).game),

  validateAction,
  redactFor: (state, viewerSeat, seats, deadline, paused): ClientGameView =>
    view(state as OnlineState, viewerSeat, seats, deadline, paused),
};
