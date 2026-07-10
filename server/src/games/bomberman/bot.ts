import { BOMBER_H, BOMBER_W } from '@shared/bomberman';
import { BRICK } from './maps';
import {
  DIRS,
  MAX_BOMBS,
  blastCells,
  bombAt,
  dropBomb,
  walkable,
  type BomberPlayer,
  type BombermanState,
} from './engine';

/**
 * Bomberman bot brains, run inside the engine tick on each bot's cadence:
 *  - easy   wanders, flees only imminent blasts, bombs rarely
 *  - medium hunts powerups and bricks, respects all bomb footprints
 *  - hard   thinks faster, also stalks enemies and traps them
 * A bot never places a bomb it cannot escape from.
 */

const W = BOMBER_W;
const H = BOMBER_H;
const idx = (x: number, y: number) => y * W + x;

const THINK_EVERY = { easy: 14, medium: 9, hard: 6 } as const;
/** How close a fuse must be before an easy bot notices the bomb at all. */
const EASY_FUSE_HORIZON = 18;

export function botThink(state: BombermanState, p: BomberPlayer): void {
  const diff = p.botDifficulty ?? 'easy';
  p.nextBotThink = state.tick + THINK_EVERY[diff];

  const danger = dangerCells(state, diff);
  const from = idx(p.x, p.y);

  // 1. In danger → run for the nearest safe cell, nothing else matters.
  if (danger.has(from) || state.explosions.has(from)) {
    const step = firstStepToward(state, p, (cell) => !danger.has(cell) && !state.explosions.has(cell));
    p.inputDir = step ?? randomDir(state, p, danger);
    return;
  }

  // 2. Maybe bomb: bricks next to us, or (hard) an enemy in the blast line.
  if (p.bombsOut < MAX_BOMBS && !bombAt(state, p.x, p.y) && wantsBomb(state, p, diff)) {
    const footprint = new Set(blastCells(state, { x: p.x, y: p.y, fire: p.fire, pierce: p.pierce }));
    const escape = firstStepToward(
      state,
      p,
      (cell) => !danger.has(cell) && !footprint.has(cell) && !state.explosions.has(cell),
    );
    if (escape) {
      dropBomb(state, p.seat);
      p.inputDir = escape;
      return;
    }
  }

  // 3. Head somewhere useful.
  if (diff === 'easy') {
    // Drift: keep direction while it's safe, otherwise pick a fresh one.
    if (p.inputDir) {
      const { dx, dy } = DIRS[p.inputDir];
      const next = idx(p.x + dx, p.y + dy);
      if (walkable(state, p.x + dx, p.y + dy) && !danger.has(next)) return;
    }
    p.inputDir = randomDir(state, p, danger);
    return;
  }

  const step =
    firstStepToward(state, p, (cell) => state.floorPU[cell] !== null && !danger.has(cell)) ??
    firstStepToward(state, p, (cell) => nextToBrick(state, cell) && !danger.has(cell)) ??
    (diff === 'hard'
      ? firstStepToward(state, p, (cell) => nextToEnemy(state, p, cell) && !danger.has(cell))
      : null);
  p.inputDir = step ?? randomDir(state, p, danger);
}

/** Cells that are, or are about to be, on fire. */
function dangerCells(state: BombermanState, diff: 'easy' | 'medium' | 'hard'): Set<number> {
  const out = new Set<number>(state.explosions.keys());
  for (const b of state.bombs) {
    if (diff === 'easy' && b.ticksLeft > EASY_FUSE_HORIZON) continue;
    for (const cell of blastCells(state, b)) out.add(cell);
  }
  return out;
}

/**
 * BFS from the bot over walkable cells; returns the first step (direction) of
 * the shortest path to any cell satisfying `goal`, or null when unreachable.
 */
function firstStepToward(
  state: BombermanState,
  p: BomberPlayer,
  goal: (cell: number) => boolean,
): ('up' | 'down' | 'left' | 'right') | null {
  const start = idx(p.x, p.y);
  if (goal(start)) return null; // already there — stop moving
  const parent = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let found = -1;
  while (queue.length > 0 && found === -1) {
    const cur = queue.shift()!;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const { dx, dy } of Object.values(DIRS)) {
      const nx = cx + dx;
      const ny = cy + dy;
      const next = idx(nx, ny);
      if (parent.has(next) || !walkable(state, nx, ny)) continue;
      parent.set(next, cur);
      if (goal(next)) {
        found = next;
        break;
      }
      queue.push(next);
    }
  }
  if (found === -1) return null;
  let cell = found;
  while (parent.get(cell) !== start) cell = parent.get(cell)!;
  const dx = (cell % W) - p.x;
  const dy = Math.floor(cell / W) - p.y;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  return 'up';
}

function randomDir(
  state: BombermanState,
  p: BomberPlayer,
  danger: Set<number>,
): ('up' | 'down' | 'left' | 'right') | null {
  const options = (Object.keys(DIRS) as (keyof typeof DIRS)[]).filter((d) => {
    const { dx, dy } = DIRS[d];
    return walkable(state, p.x + dx, p.y + dy) && !danger.has(idx(p.x + dx, p.y + dy));
  });
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)]!;
}

function nextToBrick(state: BombermanState, cell: number): boolean {
  const x = cell % W;
  const y = Math.floor(cell / W);
  return Object.values(DIRS).some(({ dx, dy }) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx >= 0 && ny >= 0 && nx < W && ny < H && state.grid[idx(nx, ny)] === BRICK;
  });
}

function nextToEnemy(state: BombermanState, me: BomberPlayer, cell: number): boolean {
  const x = cell % W;
  const y = Math.floor(cell / W);
  return state.players.some(
    (q) => q.seat !== me.seat && q.alive && Math.abs(q.x - x) + Math.abs(q.y - y) <= 1,
  );
}

function wantsBomb(state: BombermanState, p: BomberPlayer, diff: 'easy' | 'medium' | 'hard'): boolean {
  if (diff === 'easy') return Math.random() < 0.08 && nextToBrick(state, idx(p.x, p.y));
  if (nextToBrick(state, idx(p.x, p.y))) return true;
  if (diff !== 'hard') return false;
  // Hard: bomb when an enemy stands inside our blast footprint.
  const footprint = new Set(blastCells(state, { x: p.x, y: p.y, fire: p.fire, pierce: p.pierce }));
  return state.players.some(
    (q) => q.seat !== p.seat && q.alive && footprint.has(idx(q.x, q.y)),
  );
}
