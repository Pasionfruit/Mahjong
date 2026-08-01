import {
  BANANAGRAMS_MAX_PLAYERS,
  BANANAGRAMS_MIN_PLAYERS,
  BG_DUMP_DRAW,
  BG_SIZE,
  BG_START_TILE_CHOICES,
  DEFAULT_BANANAGRAMS_SETTINGS,
  type BananagramsAction,
  type BananagramsPlayerView,
  type BananagramsSettings,
  type BananagramsView,
  type BgPlacedTile,
  type BgSelfView,
} from '@shared/bananagrams';
import { DISCONNECT_TURN_GRACE_MS, THEMES } from '@shared/settings';
import type { ClientGameView } from '@shared/view';
import type { GameModule, SeatMeta } from '../GameModule';
import {
  applyBananagramsAction,
  newBananagramsGame,
  type BananagramsState,
  type BgSeat,
} from './engine';

const OPS = new Set(['place', 'recall', 'dump']);

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  if (x.t !== 'bg' || typeof x.op !== 'string' || !OPS.has(x.op)) return false;
  if (typeof x.tileId !== 'number' || !Number.isFinite(x.tileId)) return false;
  if (x.op === 'place') {
    return (
      typeof x.x === 'number' &&
      Number.isInteger(x.x) &&
      typeof x.y === 'number' &&
      Number.isInteger(x.y)
    );
  }
  return true;
}

function sanitizeSettings(
  current: BananagramsSettings,
  patch: Partial<BananagramsSettings>,
): BananagramsSettings | null {
  const next = { ...current };
  if (patch.startTiles !== undefined) {
    if (!(BG_START_TILE_CHOICES as readonly number[]).includes(patch.startTiles)) return null;
    next.startTiles = patch.startTiles;
  }
  if (patch.minWordLen !== undefined) {
    if (patch.minWordLen !== 2 && patch.minWordLen !== 3) return null;
    next.minWordLen = patch.minWordLen;
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}

// ── redaction ───────────────────────────────────────────────────────────────

function placedTiles(p: BgSeat): BgPlacedTile[] {
  return [...p.board.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([key, tile]) => ({
      id: tile.id,
      letter: tile.letter,
      x: key % BG_SIZE,
      y: Math.floor(key / BG_SIZE),
    }));
}

function selfView(p: BgSeat): BgSelfView {
  return {
    tray: p.tray.map((t) => ({ ...t })),
    board: placedTiles(p),
    invalidCells: [...p.invalidCells],
    connected: p.connected,
    ready: p.ready,
  };
}

function view(
  s: BananagramsState,
  viewerSeat: number,
  seats: SeatMeta[],
  paused: boolean,
): BananagramsView {
  const players = s.players.map((p) => {
    const meta = seats[p.seat]!;
    const pv: BananagramsPlayerView = {
      seat: p.seat,
      nickname: meta.nickname,
      connected: meta.connected,
      isHost: meta.isHost,
      isBot: meta.isBot,
      wins: meta.wins,
      trayCount: p.tray.length,
      boardCount: p.board.size,
      peels: p.peels,
    };
    // Opponents see the crossword's shape, never its letters.
    if (p.seat !== viewerSeat) pv.silhouette = [...p.board.keys()].sort((a, b) => a - b);
    return pv;
  });
  const self = s.players[viewerSeat];
  return {
    g: 'bananagrams',
    yourSeat: viewerSeat,
    players,
    you: self ? selfView(self) : null,
    bunchCount: s.bunch.length,
    canDump: s.bunch.length >= BG_DUMP_DRAW && !s.over,
    paused,
    settings: { ...s.settings },
    round: s.round,
    result:
      s.over && s.winnerSeat !== null
        ? {
            winnerSeat: s.winnerSeat,
            boards: s.players.map((p) => ({ seat: p.seat, tiles: placedTiles(p) })),
          }
        : null,
  };
}

/** Bananagrams: a real-time word race (2–8 players), first finished grid wins. */
export const bananagramsModule: GameModule = {
  id: 'bananagrams',
  minPlayers: BANANAGRAMS_MIN_PLAYERS,
  maxPlayers: BANANAGRAMS_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: false,

  defaultSettings: () => ({ ...DEFAULT_BANANAGRAMS_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as BananagramsSettings, (patch ?? {}) as Partial<BananagramsSettings>),

  startRound: (settings, playerCount, _dealerSeat, round, seed) => ({
    state: newBananagramsGame(settings as BananagramsSettings, playerCount, round, seed),
    events: [{ t: 'roundStart', round, dealerSeat: 0 }],
  }),

  applyAction: (state, seat, action) =>
    applyBananagramsAction(state as BananagramsState, seat, action as BananagramsAction),
  applyTimeout: () => [], // no deadlines: the race is its own clock
  isRoundOver: (state) => (state as BananagramsState).over,

  deadlineHintMs: () => null,
  awaitingSeat: () => null,
  pendingSeats: () => [],
  settleDisconnected: () => [], // a vanished player's grid simply stalls

  botDelayMs: () => 0,
  // No bots and no deadlines — these are never used; keep them well-formed.
  chooseAction: (): BananagramsAction => ({ t: 'bg', op: 'recall', tileId: -1 }),
  fallbackAction: (): BananagramsAction => ({ t: 'bg', op: 'recall', tileId: -1 }),

  validateAction,
  redactFor: (state, viewerSeat, seats, _deadline, paused): ClientGameView =>
    view(state as BananagramsState, viewerSeat, seats, paused),
};
