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
import {
  applyMinefieldAction,
  newMinefieldGame,
  type MfCellLayout,
  type MfPlayerBoard,
  type MinefieldState,
} from './engine';

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
  if (patch.eliminateOnMine !== undefined) {
    if (typeof patch.eliminateOnMine !== 'boolean') return null;
    next.eliminateOnMine = patch.eliminateOnMine;
  }
  return next;
}

// ── redaction ───────────────────────────────────────────────────────────────

function layoutCellView(c: MfCellLayout, revealed: boolean): MinefieldCellView {
  if (!revealed) return { revealed: false };
  return c.mine ? { revealed: true, mine: true } : { revealed: true, mine: false, adjacent: c.adjacent };
}

function view(s: MinefieldState, viewerSeat: number, seats: SeatMeta[], paused: boolean): MinefieldView {
  const players = s.boards.map((b: MfPlayerBoard) => {
    const meta = seats[b.seat]!;
    return {
      seat: b.seat,
      nickname: meta.nickname,
      connected: meta.connected,
      isHost: meta.isHost,
      isBot: meta.isBot,
      wins: meta.wins,
      revealedCount: b.revealedCount,
      minesHit: b.minesHit,
      eliminated: b.eliminated,
    };
  });
  const you = s.boards[viewerSeat];
  const totalSafeCells = s.layout.filter((c) => !c.mine).length;
  return {
    g: 'minefield',
    yourSeat: viewerSeat,
    players,
    rows: s.rows,
    cols: s.cols,
    mineCount: s.mineCount,
    totalSafeCells,
    yourCells: you ? s.layout.map((c, i) => layoutCellView(c, you.revealed[i]!)) : null,
    finalLayout: s.over ? s.layout.map((c) => layoutCellView(c, true)) : null,
    paused,
    settings: { ...s.settings },
    round: s.round,
    result: s.over && s.winnerSeats ? { winnerSeats: s.winnerSeats } : null,
  };
}

/** Minesweeper (internal id "minefield"): a real-time party race — every
 *  player gets their own identically-laid-out board (same seed, fair
 *  speedrun). By default hitting a mine eliminates you from the round
 *  (settings.eliminateOnMine can turn that off, letting mines cost you the
 *  reveal without knocking you out). */
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
  settleDisconnected: () => [], // a vanished player just stops clicking their own board

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
