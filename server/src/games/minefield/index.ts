import {
  DEFAULT_MINEFIELD_SETTINGS,
  MINEFIELD_MAX_PLAYERS,
  MINEFIELD_MIN_PLAYERS,
  MINEFIELD_PRESET_CHOICES,
  MINEFIELD_PRESETS,
  type MinefieldAction,
  type MinefieldCellView,
  type MinefieldSettings,
  type MinefieldView,
} from '@shared/minefield';
import { DISCONNECT_TURN_GRACE_MS } from '@shared/settings';
import type { ClientGameView } from '@shared/view';
import type { GameModule, SeatMeta } from '../GameModule';
import { applyMinefieldAction, newMinefieldGame, type MfCell, type MinefieldState } from './engine';

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  return x.t === 'mf' && x.op === 'reveal' && typeof x.index === 'number' && Number.isInteger(x.index);
}

function sanitizeSettings(
  current: MinefieldSettings,
  patch: Partial<MinefieldSettings>,
): MinefieldSettings | null {
  const next = { ...current };
  if (patch.preset !== undefined) {
    if (!MINEFIELD_PRESET_CHOICES.includes(patch.preset)) return null;
    next.preset = patch.preset;
  }
  if (patch.noGuess !== undefined) {
    if (typeof patch.noGuess !== 'boolean') return null;
    next.noGuess = patch.noGuess;
  }
  return next;
}

// ── redaction ───────────────────────────────────────────────────────────────

function cellView(c: MfCell, over: boolean): MinefieldCellView {
  if (c.revealed || over) {
    if (c.mine) return { revealed: true, mine: true, owner: c.owner ?? -1 };
    return { revealed: true, mine: false, adjacent: c.adjacent, owner: c.owner };
  }
  return { revealed: false };
}

function view(s: MinefieldState, viewerSeat: number, seats: SeatMeta[], paused: boolean): MinefieldView {
  const players = s.eliminated.map((eliminated, seat) => {
    const meta = seats[seat]!;
    return {
      seat,
      nickname: meta.nickname,
      connected: meta.connected,
      isHost: meta.isHost,
      isBot: meta.isBot,
      wins: meta.wins,
      revealedCount: s.revealedCount[seat]!,
      eliminated,
    };
  });
  return {
    g: 'minefield',
    yourSeat: viewerSeat,
    players,
    rows: s.rows,
    cols: s.cols,
    mineCount: s.mineCount,
    cells: s.cells.map((c) => cellView(c, s.over)),
    paused,
    settings: { ...s.settings },
    round: s.round,
    result: s.over && s.winnerSeats ? { winnerSeats: s.winnerSeats } : null,
  };
}

/** Minefield: real-time shared-board Minesweeper battle (2–8 players). Every
 *  reveal is broadcast to the whole table; hit a mine and you're eliminated
 *  from the round but the board keeps going without you. */
export const minefieldModule: GameModule = {
  id: 'minefield',
  minPlayers: MINEFIELD_MIN_PLAYERS,
  maxPlayers: MINEFIELD_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: false,

  defaultSettings: () => ({ ...DEFAULT_MINEFIELD_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as MinefieldSettings, (patch ?? {}) as Partial<MinefieldSettings>),

  startRound: (settings, playerCount, _dealerSeat, round, seed) => ({
    state: newMinefieldGame(settings as MinefieldSettings, playerCount, round, seed),
    events: [{ t: 'roundStart', round, dealerSeat: 0 }],
  }),

  applyAction: (state, seat, action) =>
    applyMinefieldAction(state as MinefieldState, seat, action as MinefieldAction),
  applyTimeout: () => [], // no deadlines: the race is its own clock
  isRoundOver: (state) => (state as MinefieldState).over,

  deadlineHintMs: () => null,
  awaitingSeat: () => null,
  pendingSeats: () => [],
  settleDisconnected: () => [], // a vanished player just stops clicking; the board goes on

  botDelayMs: () => 0,
  // No bots and no deadlines — never called; keep them well-formed.
  chooseAction: (): MinefieldAction => ({ t: 'mf', op: 'reveal', index: 0 }),
  fallbackAction: (): MinefieldAction => ({ t: 'mf', op: 'reveal', index: 0 }),

  validateAction,
  redactFor: (state, viewerSeat, seats, _deadline, paused): ClientGameView =>
    view(state as MinefieldState, viewerSeat, seats, paused),
};

// Re-exported so the preset dimensions are visible from one import if a
// future settings/lobby helper needs them without reaching into @shared.
export { MINEFIELD_PRESETS };
