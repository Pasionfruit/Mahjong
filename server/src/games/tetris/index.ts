import {
  DEFAULT_TETRIS_SETTINGS,
  PIECE_KINDS,
  TETRIS_H,
  TETRIS_MAX_PLAYERS,
  TETRIS_MIN_PLAYERS,
  TETRIS_START_LEVELS,
  TETRIS_TICK_MS,
  TETRIS_W,
  type PieceKind,
  type TetrisAction,
  type TetrisPlayerView,
  type TetrisSettings,
  type TetrisView,
} from '@shared/tetris';
import { DISCONNECT_TURN_GRACE_MS, THEMES } from '@shared/settings';
import type { ClientGameView } from '@shared/view';
import type { GameModule, SeatMeta } from '../GameModule';
import {
  applyTetrisInput,
  newTetrisGame,
  nextKinds,
  tetrisTick,
  type TetrisPlayer,
  type TetrisState,
} from './engine';

const OPS = new Set(['left', 'right', 'cw', 'soft', 'hard', 'hold']);

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  return x.t === 'tetris' && typeof x.op === 'string' && OPS.has(x.op);
}

function sanitizeSettings(
  current: TetrisSettings,
  patch: Partial<TetrisSettings>,
): TetrisSettings | null {
  const next = { ...current };
  if (patch.startLevel !== undefined) {
    if (!(TETRIS_START_LEVELS as readonly number[]).includes(patch.startLevel)) return null;
    next.startLevel = patch.startLevel;
  }
  if (patch.garbage !== undefined) {
    if (typeof patch.garbage !== 'boolean') return null;
    next.garbage = patch.garbage;
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}

// ── redaction (everything in tetris is public) ──────────────────────────────

const CELL_CHARS = ['.', 'I', 'O', 'T', 'S', 'Z', 'J', 'L', 'G'] as const;

function gridRows(p: TetrisPlayer): string[] {
  const rows: string[] = [];
  for (let r = 0; r < TETRIS_H; r++) {
    let row = '';
    for (let c = 0; c < TETRIS_W; c++) {
      row += CELL_CHARS[p.grid[r * TETRIS_W + c]!]!;
    }
    rows.push(row);
  }
  return rows;
}

function playerView(s: TetrisState, p: TetrisPlayer, meta: SeatMeta): TetrisPlayerView {
  return {
    seat: p.seat,
    nickname: meta.nickname,
    connected: meta.connected,
    isHost: meta.isHost,
    isBot: meta.isBot,
    wins: meta.wins,
    grid: gridRows(p),
    active: p.active
      ? {
          kind: PIECE_KINDS[p.active.kind]!,
          rot: p.active.rot,
          x: p.active.x,
          y: p.active.y,
        }
      : null,
    hold: p.hold >= 0 ? PIECE_KINDS[p.hold]! : null,
    next: nextKinds(s, p, 3).map((k) => PIECE_KINDS[k]!) as PieceKind[],
    level: p.level,
    lines: p.lines,
    score: p.score,
    incoming: p.pendingGarbage,
    alive: p.alive,
  };
}

function view(s: TetrisState, viewerSeat: number, seats: SeatMeta[], paused: boolean): TetrisView {
  return {
    g: 'tetris',
    yourSeat: viewerSeat,
    players: s.players.map((p) => playerView(s, p, seats[p.seat]!)),
    paused,
    settings: { ...s.settings },
    round: s.round,
    result: s.over ? { winnerSeat: s.winnerSeat } : null,
  };
}

/** Tetris: real-time versus (1–4 players), line clears trade garbage. */
export const tetrisModule: GameModule = {
  id: 'tetris',
  minPlayers: TETRIS_MIN_PLAYERS,
  maxPlayers: TETRIS_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: false,
  tickMs: TETRIS_TICK_MS,
  tick: (state) => tetrisTick(state as TetrisState),

  defaultSettings: () => ({ ...DEFAULT_TETRIS_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as TetrisSettings, (patch ?? {}) as Partial<TetrisSettings>),

  startRound: (settings, playerCount, _dealerSeat, round, seed) => ({
    state: newTetrisGame(settings as TetrisSettings, playerCount, round, seed),
    events: [{ t: 'roundStart', round, dealerSeat: 0 }],
  }),

  applyAction: (state, seat, action) => {
    const s = state as TetrisState;
    const a = action as TetrisAction;
    const events = applyTetrisInput(s, seat, a.op);
    // Movement is silent (the 50ms tick broadcasts it); locks/clears/deaths
    // carry events and get the full broadcast immediately.
    if (events.length === 0) return { ok: true, events, sync: 'none' };
    return { ok: true, events };
  },
  applyTimeout: () => [], // the tick loop is the only clock
  isRoundOver: (state) => (state as TetrisState).over,

  deadlineHintMs: () => null,
  awaitingSeat: () => null,
  pendingSeats: () => [],
  settleDisconnected: () => [], // a vanished player's stack simply tops out

  botDelayMs: () => 0,
  chooseAction: (): TetrisAction => ({ t: 'tetris', op: 'soft' }),
  fallbackAction: (): TetrisAction => ({ t: 'tetris', op: 'soft' }),

  validateAction,
  redactFor: (state, viewerSeat, seats, _deadline, paused): ClientGameView =>
    view(state as TetrisState, viewerSeat, seats, paused),
};
