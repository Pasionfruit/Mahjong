import { BOMBER_H, BOMBER_W, type BomberDir } from '@shared/bomberman';
import { BRICK } from './maps';
import {
  DIRS,
  FUSE_TICKS,
  blastCells,
  bombAt,
  centerCell,
  dropBomb,
  speedOf,
  walkable,
  type BomberPlayer,
  type BombermanState,
} from './engine';

/**
 * Bomberman bot brains as a per-tick state machine:
 *
 *   roam ── drops a validated bomb ──▶ flee ── reached safety ──▶ wait ──▶ roam
 *     ▲                                 ▲
 *     └──── any danger appears ─────────┘
 *
 *  - roam  follow a full path to a target (powerup / brick / enemy by difficulty)
 *  - flee  follow a full escape path out of every blast footprint
 *  - wait  stand still until the nearby danger has burned off
 *
 * The bot stores the *entire* path and advances it every tick, so escapes with
 * turns work; the old first-step-only planner kept walking a stale direction
 * between thinks and marched bots into their own blasts. A bomb is only ever
 * dropped when a full escape path exists AND is walkable within the fuse time.
 */

const W = BOMBER_W;
const H = BOMBER_H;
const idx = (x: number, y: number) => y * W + x;
/** The grid cell under a (possibly mid-glide) player's center. */
const cellOf = (p: BomberPlayer) => {
  const { cx, cy } = centerCell(p);
  return idx(cx, cy);
};
/** Waypoint counts as reached when the center is this close to it. */
const ARRIVE = 0.12;

/** How often each difficulty re-plans targets (ticks). Fleeing ignores this. */
const THINK_EVERY = { easy: 14, medium: 9, hard: 6 } as const;
/** Safety margin: escape must finish this many ticks before the fuse ends. */
const ESCAPE_MARGIN_TICKS = 6;
/** Roam target sampling for easy bots. */
const WANDER_RADIUS = 8;
/** Sudden death: treat this many upcoming spiral cells as already lethal. */
const SHRINK_LOOKAHEAD_CELLS = 26;
/** Start avoiding doomed ground this many ticks before the walls move. */
const SHRINK_WARNING_TICKS = 40;

export function botTick(state: BombermanState, p: BomberPlayer): void {
  const diff = p.botDifficulty ?? 'easy';
  const danger = dangerCells(state);
  const me = cellOf(p);
  const inDanger = danger.has(me) || state.explosions.has(me);

  // ── transitions ───────────────────────────────────────────────────────────
  if (p.botMode === 'flee') {
    if (!inDanger) {
      // Made it out — hold position until things calm down.
      p.botMode = 'wait';
      p.botPath = [];
      p.inputDir = null;
      p.nextBotThink = state.tick + THINK_EVERY[diff];
    } else if (p.botPath.length === 0 || danger.has(p.botPath[p.botPath.length - 1]!)) {
      planFlee(state, p, danger); // no path, or its destination got compromised
    }
  } else if (inDanger) {
    p.botMode = 'flee';
    planFlee(state, p, danger);
  } else if (p.botMode === 'wait') {
    p.inputDir = null;
    if (state.tick >= p.nextBotThink && surroundingsCalm(state, p, danger)) {
      p.botMode = 'roam';
      p.botPath = [];
    }
  }

  // ── roam: bomb opportunities and target seeking, on the think cadence ────
  if (p.botMode === 'roam' && state.tick >= p.nextBotThink) {
    p.nextBotThink = state.tick + THINK_EVERY[diff];

    const { cx, cy } = centerCell(p);
    if (p.bombsOut < p.maxBombs && !bombAt(state, cx, cy) && wantsBomb(state, p, diff)) {
      // Validate the whole escape before committing: pretend the bomb exists.
      const footprint = blastCells(state, { x: cx, y: cy, fire: p.fire, pierce: p.pierce });
      const simDanger = new Set(danger);
      for (const c of footprint) simDanger.add(c);
      const escape = findPath(
        state,
        p,
        (cell) => !simDanger.has(cell) && !state.explosions.has(cell),
        /* throughDanger */ true,
      );
      const ticksPerCell = 1 / speedOf(state, p);
      const ticksNeeded = escape
        ? Math.ceil(escape.length * ticksPerCell) + ESCAPE_MARGIN_TICKS
        : Infinity;
      if (escape && ticksNeeded <= FUSE_TICKS) {
        dropBomb(state, p.seat);
        p.botMode = 'flee';
        p.botPath = escape;
      }
    }

    if (p.botMode === 'roam' && p.botPath.length === 0) planRoam(state, p, diff, danger);
  }

  followPath(state, p);
}

// ── movement: steer toward waypoint centers, every tick ─────────────────────

function followPath(state: BombermanState, p: BomberPlayer): void {
  if (p.botPath.length === 0) {
    if (p.botMode !== 'roam') p.inputDir = null;
    return;
  }
  // Pop waypoints whose center we've reached (continuous positions).
  while (p.botPath.length > 0) {
    const w = p.botPath[0]!;
    if (Math.abs(w % W - p.x) <= ARRIVE && Math.abs(Math.floor(w / W) - p.y) <= ARRIVE) {
      p.botPath.shift();
    } else break;
  }
  const next = p.botPath[0];
  if (next === undefined) {
    p.inputDir = null;
    return;
  }
  const nx = next % W;
  const ny = Math.floor(next / W);
  if (Math.abs(nx - p.x) + Math.abs(ny - p.y) > 1.6) {
    p.botPath = []; // desynced (knocked around, replanned mid-glide) — replan later
    p.inputDir = null;
    return;
  }
  if (state.explosions.has(next)) {
    p.inputDir = null; // never glide into live flames; they decay in a few ticks
    return;
  }
  if (!walkable(state, nx, ny)) {
    p.botPath = []; // a bomb or wall appeared on the path — replan later
    p.inputDir = null;
    return;
  }
  // Steer along whichever axis is further from the waypoint (paths are
  // 4-adjacent, so this settles onto the lane then advances along it).
  const ddx = nx - p.x;
  const ddy = ny - p.y;
  if (Math.abs(ddx) > Math.abs(ddy)) {
    p.inputDir = ddx > 0 ? 'right' : 'left';
  } else {
    p.inputDir = ddy > 0 ? 'down' : 'up';
  }
}

// ── planners ─────────────────────────────────────────────────────────────────

function planFlee(state: BombermanState, p: BomberPlayer, danger: Set<number>): void {
  // Escapes may cross future blast cells (often the only way out) but never
  // live flames; the destination must be fully safe.
  p.botPath =
    findPath(state, p, (cell) => !danger.has(cell) && !state.explosions.has(cell), true) ?? [];
  if (p.botPath.length === 0) p.inputDir = null; // cornered — hold and hope
}

function planRoam(
  state: BombermanState,
  p: BomberPlayer,
  diff: 'easy' | 'medium' | 'hard',
  danger: Set<number>,
): void {
  // Roaming never enters danger at all.
  const safe = (cell: number) => !danger.has(cell) && !state.explosions.has(cell);
  const path =
    diff === 'easy'
      ? wanderPath(state, p, safe)
      : (findPath(state, p, (cell) => safe(cell) && state.floorPU[cell] !== null, false) ??
        findPath(state, p, (cell) => safe(cell) && nextToBrick(state, cell), false) ??
        (diff === 'hard'
          ? findPath(state, p, (cell) => safe(cell) && nextToEnemy(state, p, cell), false)
          : null) ??
        wanderPath(state, p, safe));
  p.botPath = path ?? [];
}

/** A short random stroll to a reachable safe cell — keeps easy bots ambling. */
function wanderPath(
  state: BombermanState,
  p: BomberPlayer,
  safe: (cell: number) => boolean,
): number[] | null {
  const options: number[][] = [];
  bfs(state, p, false, (cell, path) => {
    if (path.length > 0 && path.length <= WANDER_RADIUS && safe(cell)) options.push(path);
    return false; // keep exploring
  });
  if (options.length === 0) return null;
  return options[Math.floor(Math.random() * options.length)]!;
}

// ── shared helpers ───────────────────────────────────────────────────────────

/**
 * Cells that are, or are about to be, lethal: live flames, every bomb's full
 * blast footprint, and — once sudden death is (nearly) underway — the next
 * stretch of spiral cells the walls will close over, so bots retreat toward
 * the center ahead of the wave instead of being crushed at the edge.
 */
function dangerCells(state: BombermanState): Set<number> {
  const out = new Set<number>(state.explosions.keys());
  for (const b of state.bombs) {
    for (const cell of blastCells(state, b)) out.add(cell);
  }
  if (
    state.suddenDeathAtTick !== null &&
    state.tick >= state.suddenDeathAtTick - SHRINK_WARNING_TICKS
  ) {
    const end = Math.min(state.shrinkIdx + SHRINK_LOOKAHEAD_CELLS, state.spiral.length);
    for (let i = state.shrinkIdx; i < end; i++) out.add(state.spiral[i]!);
  }
  return out;
}

/**
 * Nothing burning or about to burn on or next to the bot. Deliberately ignores
 * the shrink wave: near the closing edge a bot should resume roaming (its
 * roam planner already avoids doomed cells) rather than wait forever.
 */
function surroundingsCalm(state: BombermanState, p: BomberPlayer, _danger: Set<number>): boolean {
  const hot = new Set<number>(state.explosions.keys());
  for (const b of state.bombs) for (const cell of blastCells(state, b)) hot.add(cell);
  if (hot.has(cellOf(p))) return false;
  return Object.values(DIRS).every(({ dx, dy }) => {
    const nx = p.x + dx;
    const ny = p.y + dy;
    return nx < 0 || ny < 0 || nx >= W || ny >= H || !hot.has(idx(nx, ny));
  });
}

/**
 * BFS over walkable cells (optionally crossing future-danger cells, never live
 * flames). Returns the full path to the first cell matching `goal`, or null.
 */
function findPath(
  state: BombermanState,
  p: BomberPlayer,
  goal: (cell: number) => boolean,
  throughDanger: boolean,
): number[] | null {
  let found: number[] | null = null;
  bfs(state, p, throughDanger, (cell, path) => {
    if (goal(cell)) {
      found = path;
      return true;
    }
    return false;
  });
  return found;
}

/** Breadth-first walk from the bot; visit() gets (cell, pathFromStart). */
function bfs(
  state: BombermanState,
  p: BomberPlayer,
  throughDanger: boolean,
  visit: (cell: number, path: number[]) => boolean,
): void {
  const start = cellOf(p);
  const parent = new Map<number, number>([[start, -1]]);
  const queue = [start];
  if (visit(start, [])) return;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const { dx, dy } of Object.values(DIRS)) {
      const nx = cx + dx;
      const ny = cy + dy;
      const next = idx(nx, ny);
      if (parent.has(next) || !walkable(state, nx, ny)) continue;
      if (state.explosions.has(next)) continue; // flames are lethal right now
      if (!throughDanger && dangerCellsHas(state, next)) continue;
      parent.set(next, cur);
      const path: number[] = [];
      for (let c = next; c !== start; c = parent.get(c)!) path.unshift(c);
      if (visit(next, path)) return;
      queue.push(next);
    }
  }
}

// Per-state, per-tick danger cache so bfs doesn't rebuild the set per cell.
// WeakMap-keyed: concurrent rooms at the same tick never share entries.
const dangerCache = new WeakMap<BombermanState, { tick: number; set: Set<number> }>();
function dangerCellsHas(state: BombermanState, cell: number): boolean {
  let entry = dangerCache.get(state);
  if (!entry || entry.tick !== state.tick) {
    entry = { tick: state.tick, set: dangerCells(state) };
    dangerCache.set(state, entry);
  }
  return entry.set.has(cell);
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
  const byBrick = nextToBrick(state, cellOf(p));
  if (diff === 'easy') return byBrick && Math.random() < 0.25;
  if (byBrick) return true;
  if (diff !== 'hard') return false;
  // Hard: bomb when an enemy stands inside our blast footprint.
  const footprint = new Set(blastCells(state, { x: p.x, y: p.y, fire: p.fire, pierce: p.pierce }));
  return state.players.some(
    (q) => q.seat !== p.seat && q.alive && footprint.has(cellOf(q)),
  );
}
