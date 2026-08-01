import {
  BG_DUMP_DRAW,
  BG_LETTER_COUNTS,
  BG_SIZE,
  bgCellKey,
  startTilesFor,
  type BananagramsAction,
  type BananagramsSettings,
  type BgTile,
} from '@shared/bananagrams';
import type { GameEvent } from '@shared/view';
import { mulberry32 } from '../../engine/rng';
import dictionary from './dictionary.json';

/** The ENABLE word list (lowercase), loaded once at module load. */
export const WORDS: Set<string> = new Set<string>(dictionary);

/** One seat's private table: their tray, their 23×23 board, and cached verdicts. */
export interface BgSeat {
  seat: number;
  tray: BgTile[];
  /** cellKey (y*BG_SIZE+x) → the tile sitting there. */
  board: Map<number, BgTile>;
  /** Peels this seat has triggered this round. */
  peels: number;
  /** Cached: cell keys of every maximal run that isn't a valid word. */
  invalidCells: number[];
  /** Cached: all placed tiles form one orthogonally connected group. */
  connected: boolean;
  /** Cached: tray empty + ≥2 placed + connected + no invalid runs. */
  ready: boolean;
}

export interface BananagramsState {
  settings: BananagramsSettings;
  playerCount: number;
  round: number;
  rng: () => number;
  /** The face-down pool; draws pop from the end. */
  bunch: BgTile[];
  players: BgSeat[];
  over: boolean;
  winnerSeat: number | null;
}

export type BgApplyResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

// ── game setup ──────────────────────────────────────────────────────────────

/** The full 144-tile set, ids 0..143, shuffled with the seeded rng. */
function buildBunch(rng: () => number): BgTile[] {
  const tiles: BgTile[] = [];
  let id = 0;
  for (const [letter, count] of Object.entries(BG_LETTER_COUNTS)) {
    for (let i = 0; i < count; i++) tiles.push({ id: id++, letter });
  }
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  return tiles;
}

export function newBananagramsGame(
  settings: BananagramsSettings,
  playerCount: number,
  round: number,
  seed: number,
): BananagramsState {
  const rng = mulberry32(seed);
  const bunch = buildBunch(rng);
  const desired = settings.startTiles === 0 ? startTilesFor(playerCount) : settings.startTiles;
  // Clamp so the bunch always holds at least one full peel (8×21 would bust 144).
  const startCount = Math.min(desired, Math.floor((bunch.length - playerCount) / playerCount));
  const s: BananagramsState = {
    settings: { ...settings },
    playerCount,
    round,
    rng,
    bunch,
    players: [],
    over: false,
    winnerSeat: null,
  };
  for (let seat = 0; seat < playerCount; seat++) {
    const tray: BgTile[] = [];
    for (let i = 0; i < startCount; i++) tray.push(bunch.pop()!);
    s.players.push({
      seat,
      tray,
      board: new Map(),
      peels: 0,
      invalidCells: [],
      connected: true,
      ready: false,
    });
  }
  return s;
}

// ── derived validity ────────────────────────────────────────────────────────

const NEIGHBOR_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** Maximal runs (≥2 tiles) must be dictionary words of at least minWordLen. */
function analyzeBoard(
  board: Map<number, BgTile>,
  minWordLen: number,
): { invalidCells: number[]; connected: boolean } {
  const invalid = new Set<number>();
  for (let y = 0; y < BG_SIZE; y++) {
    for (let x = 0; x < BG_SIZE; x++) {
      // Horizontal runs starting here.
      if (board.has(bgCellKey(x, y)) && !(x > 0 && board.has(bgCellKey(x - 1, y)))) {
        let len = 0;
        let word = '';
        while (x + len < BG_SIZE && board.has(bgCellKey(x + len, y))) {
          word += board.get(bgCellKey(x + len, y))!.letter;
          len++;
        }
        if (len >= 2 && (len < minWordLen || !WORDS.has(word.toLowerCase()))) {
          for (let i = 0; i < len; i++) invalid.add(bgCellKey(x + i, y));
        }
      }
      // Vertical runs starting here.
      if (board.has(bgCellKey(x, y)) && !(y > 0 && board.has(bgCellKey(x, y - 1)))) {
        let len = 0;
        let word = '';
        while (y + len < BG_SIZE && board.has(bgCellKey(x, y + len))) {
          word += board.get(bgCellKey(x, y + len))!.letter;
          len++;
        }
        if (len >= 2 && (len < minWordLen || !WORDS.has(word.toLowerCase()))) {
          for (let i = 0; i < len; i++) invalid.add(bgCellKey(x, y + i));
        }
      }
    }
  }

  // One orthogonally connected component (vacuously true for 0 or 1 tiles).
  let connected = true;
  const keys = [...board.keys()];
  if (keys.length > 1) {
    const seen = new Set<number>([keys[0]!]);
    const stack = [keys[0]!];
    while (stack.length > 0) {
      const k = stack.pop()!;
      const x = k % BG_SIZE;
      const y = (k - x) / BG_SIZE;
      for (const [dx, dy] of NEIGHBOR_OFFSETS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= BG_SIZE || ny < 0 || ny >= BG_SIZE) continue;
        const nk = bgCellKey(nx, ny);
        if (board.has(nk) && !seen.has(nk)) {
          seen.add(nk);
          stack.push(nk);
        }
      }
    }
    connected = seen.size === keys.length;
  }

  return { invalidCells: [...invalid].sort((a, b) => a - b), connected };
}

/** Ready recomputed from the cached verdicts (cheap: no board scan). */
function refreshReady(p: BgSeat): void {
  p.ready = p.tray.length === 0 && p.board.size >= 2 && p.connected && p.invalidCells.length === 0;
}

/** Full recompute of a seat's cached validity after any board/tray mutation. */
export function refreshDerived(s: BananagramsState, p: BgSeat): void {
  const { invalidCells, connected } = analyzeBoard(p.board, s.settings.minWordLen);
  p.invalidCells = invalidCells;
  p.connected = connected;
  refreshReady(p);
}

// ── peel / bananas ──────────────────────────────────────────────────────────

/**
 * The moment a seat is ready: if the bunch covers everyone, peel (all draw 1);
 * otherwise the finished grid wins the round. The peel refills the acting
 * seat's tray, so ready falls false — no cascade.
 */
function checkPeel(s: BananagramsState, seat: number, events: GameEvent[]): void {
  const p = s.players[seat]!;
  if (!p.ready) return;
  if (s.bunch.length >= s.playerCount) {
    for (const q of s.players) {
      q.tray.push(s.bunch.pop()!);
      refreshReady(q);
    }
    p.peels += 1;
    events.push({ t: 'peel', seat, bunchLeft: s.bunch.length });
  } else {
    s.over = true;
    s.winnerSeat = seat;
    events.push({ t: 'win', seat, by: 'bananas' });
  }
}

// ── actions ─────────────────────────────────────────────────────────────────

function boardKeyOf(p: BgSeat, tileId: number): number | null {
  for (const [key, tile] of p.board) {
    if (tile.id === tileId) return key;
  }
  return null;
}

export function applyBananagramsAction(
  s: BananagramsState,
  seat: number,
  a: BananagramsAction,
): BgApplyResult {
  if (s.over) return { ok: false, error: 'The round is already over.' };
  const p = s.players[seat];
  if (!p) return { ok: false, error: 'You are not playing this round.' };
  const events: GameEvent[] = [];

  switch (a.op) {
    case 'place': {
      if (
        !Number.isInteger(a.x) ||
        !Number.isInteger(a.y) ||
        a.x < 0 ||
        a.x >= BG_SIZE ||
        a.y < 0 ||
        a.y >= BG_SIZE
      ) {
        return { ok: false, error: 'That cell is outside the board.' };
      }
      const target = bgCellKey(a.x, a.y);
      if (p.board.has(target)) return { ok: false, error: 'That cell is already occupied.' };
      const trayIdx = p.tray.findIndex((t) => t.id === a.tileId);
      if (trayIdx >= 0) {
        p.board.set(target, p.tray.splice(trayIdx, 1)[0]!);
      } else {
        const from = boardKeyOf(p, a.tileId);
        if (from === null) return { ok: false, error: 'That tile is not yours.' };
        const tile = p.board.get(from)!;
        p.board.delete(from);
        p.board.set(target, tile);
      }
      break;
    }
    case 'recall': {
      const from = boardKeyOf(p, a.tileId);
      if (from === null) return { ok: false, error: 'That tile is not on your board.' };
      p.tray.push(p.board.get(from)!);
      p.board.delete(from);
      break;
    }
    case 'dump': {
      const trayIdx = p.tray.findIndex((t) => t.id === a.tileId);
      if (trayIdx < 0) return { ok: false, error: 'You can only dump a tile from your tray.' };
      if (s.bunch.length < BG_DUMP_DRAW) {
        return { ok: false, error: 'The bunch is too small to dump into.' };
      }
      const tile = p.tray.splice(trayIdx, 1)[0]!;
      const at = (s.rng() * (s.bunch.length + 1)) | 0;
      s.bunch.splice(at, 0, tile);
      for (let i = 0; i < BG_DUMP_DRAW; i++) p.tray.push(s.bunch.pop()!);
      events.push({ t: 'dump', seat });
      break;
    }
  }

  refreshDerived(s, p);
  checkPeel(s, seat, events);
  return { ok: true, events };
}
