import {
  GARBAGE_SENT,
  LINE_SCORES,
  PIECE_CELLS,
  PIECE_KINDS,
  TETRIS_H,
  TETRIS_W,
  gravityTicks,
  levelForLines,
  type PieceKind,
  type TetrisOp,
  type TetrisSettings,
} from '@shared/tetris';
import type { GameEvent } from '@shared/view';
import { mulberry32 } from '../../engine/rng';

/** Ticks a grounded piece may rest (or wiggle) before it locks: 500ms. */
const LOCK_TICKS = 10;
/** Grounded-timer resets allowed per piece (anti-infinite-spin). */
const MAX_LOCK_RESETS = 12;
const SPAWN_X = 3;
const SPAWN_Y = 0;
/** Grid cell values: 0 empty, 1..7 = piece kind index + 1, 8 = garbage. */
const GARBAGE_CELL = 8;

export interface ActivePiece {
  kind: number; // index into PIECE_KINDS
  rot: number;
  x: number;
  y: number;
}

export interface TetrisPlayer {
  seat: number;
  grid: Uint8Array;
  active: ActivePiece | null;
  /** Stored piece kind index, or -1 when the slot is empty. */
  hold: number;
  /** The store/trade slot is single-use until the current piece locks. */
  holdUsed: boolean;
  /** This player's cursor into the shared piece sequence. */
  bagIndex: number;
  gravityCounter: number;
  groundedTicks: number;
  lockResets: number;
  level: number;
  lines: number;
  score: number;
  pendingGarbage: number;
  alive: boolean;
}

export interface TetrisState {
  settings: TetrisSettings;
  playerCount: number;
  round: number;
  rng: () => number;
  /** Shared 7-bag piece sequence — every player sees the same order. */
  sequence: number[];
  players: TetrisPlayer[];
  tick: number;
  over: boolean;
  winnerSeat: number | null;
  /** Anything visible changed since the last broadcastable beat. */
  dirty: boolean;
}

// ── piece geometry ──────────────────────────────────────────────────────────

const CELLS = PIECE_KINDS.map((k) => PIECE_CELLS[k]);

function collides(grid: Uint8Array, kind: number, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of CELLS[kind]![rot & 3]!) {
    const ax = x + cx;
    const ay = y + cy;
    if (ax < 0 || ax >= TETRIS_W || ay < 0 || ay >= TETRIS_H) return true;
    if (grid[ay * TETRIS_W + ax] !== 0) return true;
  }
  return false;
}

function grounded(p: TetrisPlayer): boolean {
  const a = p.active!;
  return collides(p.grid, a.kind, a.rot, a.x, a.y + 1);
}

// ── sequence / spawning ─────────────────────────────────────────────────────

function ensureSequence(s: TetrisState, upTo: number): void {
  while (s.sequence.length < upTo) {
    const bag = [0, 1, 2, 3, 4, 5, 6];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = (s.rng() * (i + 1)) | 0;
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    s.sequence.push(...bag);
  }
}

export function nextKinds(s: TetrisState, p: TetrisPlayer, count: number): number[] {
  ensureSequence(s, p.bagIndex + count);
  return s.sequence.slice(p.bagIndex, p.bagIndex + count);
}

/** Place a fresh piece of `kind` (or the next from the bag); false = top out. */
function spawnPiece(s: TetrisState, p: TetrisPlayer, kind?: number): boolean {
  let k = kind;
  if (k === undefined) {
    ensureSequence(s, p.bagIndex + 1);
    k = s.sequence[p.bagIndex]!;
    p.bagIndex += 1;
  }
  p.gravityCounter = 0;
  p.groundedTicks = 0;
  p.lockResets = 0;
  if (collides(p.grid, k, 0, SPAWN_X, SPAWN_Y)) {
    p.active = null;
    p.alive = false;
    return false;
  }
  p.active = { kind: k, rot: 0, x: SPAWN_X, y: SPAWN_Y };
  return true;
}

// ── game setup ──────────────────────────────────────────────────────────────

export function newTetrisGame(
  settings: TetrisSettings,
  playerCount: number,
  round: number,
  seed: number,
): TetrisState {
  const s: TetrisState = {
    settings: { ...settings },
    playerCount,
    round,
    rng: mulberry32(seed),
    sequence: [],
    players: [],
    tick: 0,
    over: false,
    winnerSeat: null,
    dirty: true,
  };
  for (let seat = 0; seat < playerCount; seat++) {
    const p: TetrisPlayer = {
      seat,
      grid: new Uint8Array(TETRIS_W * TETRIS_H),
      active: null,
      hold: -1,
      holdUsed: false,
      bagIndex: 0,
      gravityCounter: 0,
      groundedTicks: 0,
      lockResets: 0,
      level: settings.startLevel,
      lines: 0,
      score: 0,
      pendingGarbage: 0,
      alive: true,
    };
    s.players.push(p);
    spawnPiece(s, p);
  }
  return s;
}

// ── locking, clearing, garbage ──────────────────────────────────────────────

function clearFullRows(p: TetrisPlayer): number {
  let cleared = 0;
  for (let row = TETRIS_H - 1; row >= 0; row--) {
    let full = true;
    for (let col = 0; col < TETRIS_W; col++) {
      if (p.grid[row * TETRIS_W + col] === 0) {
        full = false;
        break;
      }
    }
    if (!full) continue;
    cleared++;
    p.grid.copyWithin(TETRIS_W, 0, row * TETRIS_W);
    p.grid.fill(0, 0, TETRIS_W);
    row++; // the shifted-down row needs rechecking
  }
  return cleared;
}

/** Push queued garbage rows in from the bottom, one shared hole per batch. */
function applyGarbage(s: TetrisState, p: TetrisPlayer, events: GameEvent[]): void {
  const rows = Math.min(p.pendingGarbage, TETRIS_H - 1);
  if (rows <= 0) return;
  p.pendingGarbage = 0;
  const hole = (s.rng() * TETRIS_W) | 0;
  p.grid.copyWithin(0, rows * TETRIS_W);
  for (let row = TETRIS_H - rows; row < TETRIS_H; row++) {
    for (let col = 0; col < TETRIS_W; col++) {
      p.grid[row * TETRIS_W + col] = col === hole ? 0 : GARBAGE_CELL;
    }
  }
  events.push({ t: 'garbage', seat: p.seat, rows });
}

function settleGameOver(s: TetrisState, events: GameEvent[]): void {
  if (s.over) return;
  const alive = s.players.filter((p) => p.alive);
  if (s.playerCount > 1 && alive.length <= 1) {
    s.over = true;
    s.winnerSeat = alive[0]?.seat ?? null;
    if (s.winnerSeat !== null) events.push({ t: 'win', seat: s.winnerSeat, by: 'lastStanding' });
    else events.push({ t: 'gameOver' });
  } else if (s.playerCount === 1 && alive.length === 0) {
    s.over = true;
    s.winnerSeat = null;
    events.push({ t: 'gameOver' });
  }
}

function lockPiece(s: TetrisState, p: TetrisPlayer, events: GameEvent[]): void {
  const a = p.active!;
  for (const [cx, cy] of CELLS[a.kind]![a.rot & 3]!) {
    p.grid[(a.y + cy) * TETRIS_W + (a.x + cx)] = a.kind + 1;
  }
  p.active = null;

  const cleared = clearFullRows(p);
  if (cleared > 0) {
    p.lines += cleared;
    p.score += LINE_SCORES[cleared]! * p.level;
    p.level = levelForLines(p.lines, s.settings.startLevel);
    events.push({ t: 'lines', seat: p.seat, count: cleared });
    if (s.settings.garbage) {
      const rows = GARBAGE_SENT[cleared]!;
      if (rows > 0) {
        for (const other of s.players) {
          if (other.seat !== p.seat && other.alive) other.pendingGarbage += rows;
        }
      }
    }
  }

  applyGarbage(s, p, events);
  p.holdUsed = false;
  if (!spawnPiece(s, p)) {
    events.push({ t: 'death', seat: p.seat, fatal: true });
    settleGameOver(s, events);
  }
}

// ── inputs ──────────────────────────────────────────────────────────────────

const ROTATION_KICKS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [-2, 0],
  [2, 0],
  [0, -1],
];

/** A successful shift/rotate while grounded restarts the lock timer (capped). */
function noteMovement(p: TetrisPlayer): void {
  if (p.groundedTicks > 0 && p.lockResets < MAX_LOCK_RESETS) {
    p.groundedTicks = 0;
    p.lockResets++;
  }
}

/**
 * One player input. Returns the events it produced (line clears, deaths…);
 * pure movement returns none and is picked up by the next tick broadcast.
 */
export function applyTetrisInput(s: TetrisState, seat: number, op: TetrisOp): GameEvent[] {
  const events: GameEvent[] = [];
  const p = s.players[seat];
  if (!p || s.over || !p.alive || !p.active) return events;
  const a = p.active;

  switch (op) {
    case 'left':
    case 'right': {
      const dx = op === 'left' ? -1 : 1;
      if (!collides(p.grid, a.kind, a.rot, a.x + dx, a.y)) {
        a.x += dx;
        noteMovement(p);
        s.dirty = true;
      }
      break;
    }
    case 'cw': {
      const rot = (a.rot + 1) & 3;
      for (const [kx, ky] of ROTATION_KICKS) {
        if (!collides(p.grid, a.kind, rot, a.x + kx, a.y + ky)) {
          a.rot = rot;
          a.x += kx;
          a.y += ky;
          noteMovement(p);
          s.dirty = true;
          break;
        }
      }
      break;
    }
    case 'soft': {
      if (!collides(p.grid, a.kind, a.rot, a.x, a.y + 1)) {
        a.y += 1;
        p.score += 1;
        p.gravityCounter = 0;
        s.dirty = true;
      }
      break;
    }
    case 'hard': {
      while (!collides(p.grid, a.kind, a.rot, a.x, a.y + 1)) {
        a.y += 1;
        p.score += 2;
      }
      lockPiece(s, p, events);
      s.dirty = true;
      break;
    }
    case 'hold': {
      // Store when the slot is empty; trade (swap) when it holds a piece.
      if (p.holdUsed) break;
      const current = a.kind;
      const stored = p.hold;
      p.hold = current;
      p.holdUsed = true;
      s.dirty = true;
      const ok = stored === -1 ? spawnPiece(s, p) : spawnPiece(s, p, stored);
      if (!ok) {
        events.push({ t: 'death', seat: p.seat, fatal: true });
        settleGameOver(s, events);
      }
      break;
    }
  }
  return events;
}

// ── the clock ───────────────────────────────────────────────────────────────

export function tetrisTick(s: TetrisState): { events: GameEvent[]; changed: boolean } {
  const events: GameEvent[] = [];
  if (s.over) return { events, changed: false };
  s.tick++;

  for (const p of s.players) {
    if (!p.alive || !p.active) continue;
    if (grounded(p)) {
      p.groundedTicks++;
      p.gravityCounter = 0;
      if (p.groundedTicks >= LOCK_TICKS) {
        lockPiece(s, p, events);
        s.dirty = true;
      }
      continue;
    }
    p.groundedTicks = 0;
    p.gravityCounter++;
    if (p.gravityCounter >= gravityTicks(p.level)) {
      p.gravityCounter = 0;
      p.active.y += 1;
      s.dirty = true;
    }
  }

  const changed = s.dirty || events.length > 0;
  s.dirty = false;
  return { events, changed };
}
