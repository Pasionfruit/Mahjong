import type { GameEvent } from '@shared/view';
import type { BotDifficulty } from '@shared/settings';
import {
  BOMBER_H,
  BOMBER_W,
  type BomberDir,
  type BombermanSettings,
  type PowerupKind,
} from '@shared/bomberman';
import { BRICK, FLOOR, WALL, buildMap, shrinkSpiral } from './maps';

// All times are in ticks; the room drives one tick every TICK_MS.
// Positions are continuous, in cell units with INTEGER CELL CENTERS: cell i
// spans [i-0.5, i+0.5). Players glide freely and may rest between cells.
export const TICK_MS = 50;
export const SPEED_BASE = 0.24; // cells per tick (~4.8 cells/s)
export const SPEED_PER_BOOT = 0.05; // each pair of boots adds this
export const SLOW_FACTOR = 0.5; // hexed players move at half speed
export const PLAYER_HALF = 0.39; // collision half-size (box < 1 cell → can slip corners)
const CENTER_SNAP = 0.09; // gently settle onto the lane center when this close
const EPS = 1e-4;
export const SLOW_DURATION = 100; // 5s
export const FUSE_TICKS = 50; // 2.5s
export const EXPLOSION_TICKS = 9;
export const BASE_BOMBS = 1; // one bomb out at a time until you find more
export const BOMB_CAP = 5;
export const MAX_FIRE = 8;
export const BASE_FIRE = 1; // starting blast: one cell in each direction
export const MAX_SPEED = 2; // boots collected cap
export const THROW_DISTANCE = 3;
export const SHRINK_EVERY_TICKS = 3;
export const INVULN_TICKS = 60; // 3s of blinking protection after losing a life

const W = BOMBER_W;
const H = BOMBER_H;
const idx = (x: number, y: number) => y * W + x;

export const DIRS: Record<BomberDir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export interface Bomb {
  id: number;
  x: number;
  y: number;
  ownerSeat: number;
  ticksLeft: number;
  fire: number;
  pierce: boolean;
  /** Seat holding this bomb (glove), or null while it sits on the floor. */
  carriedBySeat: number | null;
}

export interface BomberPlayer {
  seat: number;
  x: number;
  y: number;
  spawnX: number;
  spawnY: number;
  alive: boolean;
  facing: BomberDir;
  inputDir: BomberDir | null;
  fire: number;
  pierce: boolean;
  glove: boolean;
  speed: number;
  slowedUntil: number;
  bombsOut: number;
  /** How many bombs may be out at once (grows with the extra-bomb powerup). */
  maxBombs: number;
  lives: number;
  /** Tick of the last completed step (drives the walk animation). */
  lastStepTick: number;
  invulnUntil: number;
  isBot: boolean;
  botDifficulty: BotDifficulty | null;
  nextBotThink: number;
  /** Bot state machine: roaming for targets, fleeing danger, or waiting it out. */
  botMode: 'roam' | 'flee' | 'wait';
  /** Cells (y*W+x) still to visit, in order — followed every tick. */
  botPath: number[];
}

export interface BombermanState {
  settings: BombermanSettings;
  grid: number[];
  hidden: (PowerupKind | null)[];
  floorPU: (PowerupKind | null)[];
  bombs: Bomb[];
  /** cell -> remaining flame ticks */
  explosions: Map<number, number>;
  players: BomberPlayer[];
  tick: number;
  nextBombId: number;
  over: boolean;
  result: { winnerSeat: number | null } | null;
  suddenDeathAtTick: number | null;
  spiral: number[];
  shrinkIdx: number;
  nextShrinkTick: number;
  round: number;
}

export type ApplyResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export interface SeatInit {
  isBot: boolean;
  botDifficulty?: BotDifficulty;
}

export function newGame(
  settings: BombermanSettings,
  playerCount: number,
  round: number,
  seed: number,
  seats: SeatInit[] = [],
): BombermanState {
  const { grid, hidden, spawns } = buildMap(settings.map, playerCount, seed, settings.itemFrequency);
  return {
    settings,
    grid,
    hidden,
    floorPU: new Array(grid.length).fill(null),
    bombs: [],
    explosions: new Map(),
    // Every stat resets here — powerups never carry over between games.
    players: spawns.map((s, seat) => ({
      seat,
      x: s.x,
      y: s.y,
      spawnX: s.x,
      spawnY: s.y,
      alive: true,
      facing: 'down',
      inputDir: null,
      fire: BASE_FIRE,
      pierce: false,
      glove: false,
      speed: 0,
      slowedUntil: 0,
      bombsOut: 0,
      maxBombs: BASE_BOMBS,
      lives: settings.lives,
      lastStepTick: -1000,
      invulnUntil: 0,
      isBot: seats[seat]?.isBot ?? false,
      botDifficulty: seats[seat]?.botDifficulty ?? null,
      nextBotThink: 0,
      botMode: 'roam',
      botPath: [],
    })),
    tick: 0,
    nextBombId: 1,
    over: false,
    result: null,
    suddenDeathAtTick:
      settings.suddenDeathSeconds > 0 ? (settings.suddenDeathSeconds * 1000) / TICK_MS : null,
    spiral: shrinkSpiral(),
    shrinkIdx: 0,
    nextShrinkTick: 0,
    round,
  };
}

export function bombAt(state: BombermanState, x: number, y: number): Bomb | undefined {
  return state.bombs.find((b) => b.carriedBySeat === null && b.x === x && b.y === y);
}

/** Cell-level passability (bots' BFS, throw landings). */
export function walkable(state: BombermanState, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  if (state.grid[idx(x, y)] !== FLOOR) return false;
  return !bombAt(state, x, y);
}

/** The cell this player's center is in. */
export function centerCell(p: BomberPlayer): { cx: number; cy: number } {
  return { cx: Math.round(p.x), cy: Math.round(p.y) };
}

/** Current speed in cells per tick (boots speed up, the hex halves it). */
export function speedOf(state: BombermanState, p: BomberPlayer): number {
  const base = SPEED_BASE + p.speed * SPEED_PER_BOOT;
  return state.tick < p.slowedUntil ? base * SLOW_FACTOR : base;
}

/** Milliseconds to cross one cell at current speed (walk-cycle pacing). */
export function msPerCell(state: BombermanState, p: BomberPlayer): number {
  return Math.round(TICK_MS / speedOf(state, p));
}

/** Is this player on the board and able to act? */
function active(p: BomberPlayer): boolean {
  return p.alive;
}

/** Gliding right now? (drives the walk animation) */
export function isMoving(state: BombermanState, p: BomberPlayer): boolean {
  return p.alive && state.tick - p.lastStepTick <= 2;
}

// ── continuous movement ──────────────────────────────────────────────────────

/**
 * Is the cell solid for this player right now? Bombs block — except the cell
 * the player's box still overlaps, so you can walk OFF a bomb you just laid
 * but never back onto it.
 */
function solidFor(state: BombermanState, p: BomberPlayer, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= W || cy >= H) return true;
  if (state.grid[idx(cx, cy)] !== FLOOR) return true;
  const bomb = bombAt(state, cx, cy);
  if (!bomb) return false;
  const overlaps =
    Math.abs(p.x - cx) < 0.5 + PLAYER_HALF - EPS && Math.abs(p.y - cy) < 0.5 + PLAYER_HALF - EPS;
  return !overlaps;
}

/**
 * Glide `dist` cells in `dir` with box collision. On a blocked edge, if the
 * player is mostly in the open lane, slide sideways toward that lane's center
 * (the classic corner assist). Returns true if the position changed.
 */
export function slideMove(
  state: BombermanState,
  p: BomberPlayer,
  dir: BomberDir,
  dist: number,
): boolean {
  const { dx, dy } = DIRS[dir];
  const horiz = dx !== 0;
  const sign = horiz ? dx : dy;
  const main = horiz ? p.x : p.y; // coordinate along the movement axis
  const cross = horiz ? p.y : p.x; // the perpendicular coordinate
  const setPos = (m: number, c: number) => {
    if (horiz) {
      p.x = m;
      p.y = c;
    } else {
      p.y = m;
      p.x = c;
    }
  };
  const solid = (m: number, c: number) => (horiz ? solidFor(state, p, m, c) : solidFor(state, p, c, m));

  const target = main + sign * dist;
  const edgeCell = Math.round(target + sign * PLAYER_HALF); // cell the leading edge pokes into
  // Lanes (perpendicular cells) the box currently overlaps: one or two.
  const laneA = Math.round(cross - PLAYER_HALF + EPS);
  const laneB = Math.round(cross + PLAYER_HALF - EPS);

  const blockedA = solid(edgeCell, laneA);
  const blockedB = solid(edgeCell, laneB);

  if (!blockedA && !blockedB) {
    // Clear road: advance, and settle gently onto the lane center.
    let c = cross;
    const center = Math.round(cross);
    if (Math.abs(cross - center) <= CENTER_SNAP) c = center;
    setPos(target, c);
    return true;
  }

  let moved = false;
  // Advance up to the blocking cell's face.
  const face = edgeCell - sign * (0.5 + PLAYER_HALF + EPS);
  if (sign > 0 ? face > main + EPS : face < main - EPS) {
    setPos(sign > 0 ? Math.min(target, face) : Math.max(target, face), cross);
    moved = true;
  }
  // Corner assist: exactly one lane open → slide toward its center.
  if (laneA !== laneB && blockedA !== blockedB) {
    const openLane = blockedA ? laneB : laneA;
    const slideSign = Math.sign(openLane - cross);
    // The slide is a real move: it must not push the box into anything.
    const slideEdge = Math.round(cross + slideSign * (dist + PLAYER_HALF));
    const mainA = Math.round((horiz ? p.x : p.y) - PLAYER_HALF + EPS);
    const mainB = Math.round((horiz ? p.x : p.y) + PLAYER_HALF - EPS);
    const slideBlocked = horiz
      ? solidFor(state, p, mainA, slideEdge) || solidFor(state, p, mainB, slideEdge)
      : solidFor(state, p, slideEdge, mainA) || solidFor(state, p, slideEdge, mainB);
    if (!slideBlocked) {
      const step = Math.min(dist, Math.abs(openLane - cross));
      if (step > EPS) {
        setPos(horiz ? p.x : p.y, cross + slideSign * step);
        moved = true;
      }
    }
  }
  return moved;
}

// ── player actions (applied immediately; movement itself happens on ticks) ──

export function setInput(state: BombermanState, seat: number, dir: BomberDir | null): ApplyResult {
  const p = state.players[seat];
  if (!p) return { ok: false, error: 'not seated' };
  p.inputDir = dir;
  if (dir && active(p)) p.facing = dir;
  return { ok: true, events: [] };
}

export function dropBomb(state: BombermanState, seat: number): ApplyResult {
  const p = state.players[seat];
  if (!p) return { ok: false, error: 'not seated' };
  if (state.over || !active(p)) return { ok: true, events: [] };
  const { cx, cy } = centerCell(p);
  if (p.bombsOut >= p.maxBombs || bombAt(state, cx, cy)) return { ok: true, events: [] };
  state.bombs.push({
    id: state.nextBombId++,
    x: cx,
    y: cy,
    ownerSeat: seat,
    ticksLeft: FUSE_TICKS,
    fire: p.fire,
    pierce: p.pierce,
    carriedBySeat: null,
  });
  p.bombsOut++;
  return { ok: true, events: [{ t: 'bomb', seat }] };
}

/** Glove: pick up the bomb under you, or throw the one you're holding. */
export function grabOrThrow(state: BombermanState, seat: number): ApplyResult {
  const p = state.players[seat];
  if (!p) return { ok: false, error: 'not seated' };
  if (state.over || !active(p) || !p.glove) return { ok: true, events: [] };

  const { cx, cy } = centerCell(p);
  const held = state.bombs.find((b) => b.carriedBySeat === seat);
  if (held) {
    // Throw: land on the first free cell at least THROW_DISTANCE ahead,
    // scanning further along the same line; if nothing is free, drop in place.
    const { dx, dy } = DIRS[p.facing];
    let landed = false;
    for (let d = THROW_DISTANCE; ; d++) {
      const tx = cx + dx * d;
      const ty = cy + dy * d;
      if (tx <= 0 || ty <= 0 || tx >= W - 1 || ty >= H - 1) break;
      if (walkable(state, tx, ty)) {
        held.x = tx;
        held.y = ty;
        held.carriedBySeat = null;
        landed = true;
        break;
      }
    }
    if (!landed && !bombAt(state, cx, cy)) {
      held.x = cx;
      held.y = cy;
      held.carriedBySeat = null;
      landed = true;
    }
    return { ok: true, events: landed ? [{ t: 'bomb', seat }] : [] };
  }

  const under = bombAt(state, cx, cy);
  if (under) under.carriedBySeat = seat;
  return { ok: true, events: [] };
}

// ── the tick ─────────────────────────────────────────────────────────────────

/** Injected by the module so the engine stays import-cycle-free. */
export type BotThink = (state: BombermanState, p: BomberPlayer) => void;

export function tick(state: BombermanState, botThink?: BotThink): { events: GameEvent[]; changed: boolean } {
  const events: GameEvent[] = [];
  let changed = false;
  if (state.over) return { events, changed };
  state.tick++;

  // Bot brains run every tick: path-following is cheap; the expensive
  // re-planning is cadence-gated inside the bot itself.
  if (botThink) {
    for (const p of state.players) {
      if (p.isBot && active(p)) botThink(state, p);
    }
  }

  // Movement: glide continuously while a direction is held.
  for (const p of state.players) {
    if (!active(p) || !p.inputDir) continue;
    p.facing = p.inputDir;
    if (slideMove(state, p, p.inputDir, speedOf(state, p))) {
      p.lastStepTick = state.tick;
      changed = true;
    }
    // Pick up whatever the center of the body is standing on.
    const { cx, cy } = centerCell(p);
    const pu = state.floorPU[idx(cx, cy)];
    if (pu) {
      state.floorPU[idx(cx, cy)] = null;
      applyPowerup(state, p, pu);
      events.push({ t: 'powerup', seat: p.seat });
    }
  }

  // Carried bombs ride along with their carrier.
  for (const b of state.bombs) {
    if (b.carriedBySeat !== null) {
      const carrier = state.players[b.carriedBySeat]!;
      b.x = carrier.x;
      b.y = carrier.y;
    }
  }

  // Fuses (carried bombs keep burning — throw them in time!).
  const exploding: Bomb[] = [];
  for (const b of state.bombs) {
    b.ticksLeft--;
    if (b.ticksLeft <= 0) exploding.push(b);
  }
  if (exploding.length > 0) {
    explodeChain(state, exploding);
    events.push({ t: 'boom' });
    changed = true;
  }

  // Flames decay.
  for (const [cell, left] of state.explosions) {
    if (left <= 1) {
      state.explosions.delete(cell);
      changed = true;
    } else {
      state.explosions.set(cell, left - 1);
    }
  }

  // Sudden death: close the spiral one cell at a time.
  if (state.suddenDeathAtTick !== null && state.tick >= state.suddenDeathAtTick) {
    if (state.tick >= state.nextShrinkTick) {
      // Skip cells that are already solid so the wave keeps visible pace.
      while (state.shrinkIdx < state.spiral.length) {
        const cell = state.spiral[state.shrinkIdx]!;
        state.shrinkIdx++;
        if (state.grid[cell] === WALL) continue;
        state.grid[cell] = WALL;
        state.hidden[cell] = null;
        state.floorPU[cell] = null;
        state.bombs = state.bombs.filter((b) => {
          if (b.carriedBySeat === null && idx(b.x, b.y) === cell) {
            state.players[b.ownerSeat]!.bombsOut--;
            return false;
          }
          return true;
        });
        changed = true;
        break;
      }
      state.nextShrinkTick = state.tick + SHRINK_EVERY_TICKS;
    }
    // The closing walls are always lethal — spare lives don't help when
    // there's no floor left to stand on.
    for (const p of state.players) {
      const { cx, cy } = centerCell(p);
      if (active(p) && state.grid[idx(cx, cy)] === WALL) {
        p.lives = 0;
        kill(state, p, events);
        changed = true;
      }
    }
  } else if (state.suddenDeathAtTick !== null && state.tick % 20 === 0) {
    changed = true; // keep the countdown display fresh once a second
  }

  // Flames kill anyone whose body-center stands in them — unless protected.
  for (const p of state.players) {
    const { cx, cy } = centerCell(p);
    if (active(p) && state.tick >= p.invulnUntil && state.explosions.has(idx(cx, cy))) {
      kill(state, p, events);
      changed = true;
    }
    // Status timers lapse silently — broadcast the tick they flip so idle
    // clients stop rendering the blink / slow tint.
    if (p.invulnUntil === state.tick || p.slowedUntil === state.tick) changed = true;
  }

  // Last one standing wins; a mutual kill is a draw.
  const alive = state.players.filter((p) => p.alive);
  if (alive.length <= 1) {
    state.over = true;
    state.result = { winnerSeat: alive[0]?.seat ?? null };
    if (alive[0]) events.push({ t: 'win', seat: alive[0].seat, by: 'lastStanding' });
    else events.push({ t: 'gameOver' });
    changed = true;
  }

  return { events, changed };
}

/**
 * Lose a life. With a spare, the player stays exactly where they are and
 * blinks through a short protection window; the last life is final.
 */
function kill(state: BombermanState, p: BomberPlayer, events: GameEvent[]): void {
  // A carried bomb drops where they fell.
  const held = state.bombs.find((b) => b.carriedBySeat === p.seat);
  if (held) held.carriedBySeat = null;
  p.lives = Math.max(0, p.lives - 1);
  events.push({ t: 'death', seat: p.seat, fatal: p.lives === 0 });
  if (p.lives > 0) {
    p.invulnUntil = state.tick + INVULN_TICKS;
  } else {
    p.alive = false;
  }
}

function applyPowerup(state: BombermanState, p: BomberPlayer, pu: PowerupKind): void {
  switch (pu) {
    case 'fire':
      p.fire = Math.min(p.fire + 1, MAX_FIRE);
      break;
    case 'pierce':
      p.pierce = true;
      break;
    case 'glove':
      p.glove = true;
      break;
    case 'boots':
      p.speed = Math.min(p.speed + 1, MAX_SPEED);
      break;
    case 'bombs':
      p.maxBombs = Math.min(p.maxBombs + 1, BOMB_CAP);
      break;
    case 'slow':
      for (const other of state.players) {
        if (other.seat !== p.seat && other.alive) {
          other.slowedUntil = state.tick + SLOW_DURATION;
        }
      }
      break;
  }
}

/** Detonate a set of bombs, chaining into any bomb the flames reach. */
function explodeChain(state: BombermanState, initial: Bomb[]): void {
  const queue = [...initial];
  const done = new Set<number>();
  while (queue.length > 0) {
    const bomb = queue.shift()!;
    if (done.has(bomb.id)) continue;
    done.add(bomb.id);
    state.bombs = state.bombs.filter((b) => b !== bomb);
    state.players[bomb.ownerSeat]!.bombsOut--;
    // A bomb exploding in a carrier's hands sits at their float position.
    const bx = Math.round(bomb.x);
    const by = Math.round(bomb.y);

    const flame = (x: number, y: number): void => {
      const cell = idx(x, y);
      state.explosions.set(cell, EXPLOSION_TICKS);
      state.floorPU[cell] = null;
      const other = state.bombs.find((b) => b.carriedBySeat === null && b.x === x && b.y === y);
      if (other && !done.has(other.id)) queue.push(other);
    };

    flame(bx, by);
    for (const { dx, dy } of Object.values(DIRS)) {
      for (let d = 1; d <= bomb.fire; d++) {
        const x = bx + dx * d;
        const y = by + dy * d;
        if (x < 0 || y < 0 || x >= W || y >= H) break;
        const cell = idx(x, y);
        if (state.grid[cell] === WALL) break;
        if (state.grid[cell] === BRICK) {
          state.grid[cell] = FLOOR;
          const pu = state.hidden[cell];
          state.hidden[cell] = null;
          flame(x, y);
          if (pu) state.floorPU[cell] = pu; // reveal after flaming so it survives
          if (!bomb.pierce) break; // pierce keeps chewing through bricks
          continue;
        }
        flame(x, y);
      }
    }
  }
}

/** Every cell a bomb's blast will cover when it goes off (for the bots). */
export function blastCells(state: BombermanState, bomb: Pick<Bomb, 'x' | 'y' | 'fire' | 'pierce'>): number[] {
  const bx = Math.round(bomb.x);
  const by = Math.round(bomb.y);
  const cells = [idx(bx, by)];
  for (const { dx, dy } of Object.values(DIRS)) {
    for (let d = 1; d <= bomb.fire; d++) {
      const x = bx + dx * d;
      const y = by + dy * d;
      if (x < 0 || y < 0 || x >= W || y >= H) break;
      const cell = idx(x, y);
      if (state.grid[cell] === WALL) break;
      cells.push(cell);
      if (state.grid[cell] === BRICK && !bomb.pierce) break;
    }
  }
  return cells;
}
