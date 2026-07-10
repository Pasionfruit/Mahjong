import type { BombermanView, ClientGameView, GameEvent } from '@shared/view';
import {
  BOMBER_MAPS,
  BOMBER_W,
  DEFAULT_BOMBERMAN_SETTINGS,
  ITEM_FREQUENCIES,
  LIVES_CHOICES,
  PLAYER_COLORS,
  SUDDEN_DEATH_CHOICES,
  type BombermanSettings,
} from '@shared/bomberman';
import { DISCONNECT_TURN_GRACE_MS } from '@shared/settings';
import type { GameModule, SeatMeta } from '../GameModule';
import { BRICK, WALL } from './maps';
import {
  TICK_MS,
  dropBomb,
  grabOrThrow,
  isMoving,
  newGame,
  setInput,
  stepTicks,
  tick,
  type BombermanState,
} from './engine';
import { botThink } from './bot';

const DIRS = new Set(['up', 'down', 'left', 'right']);

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const action = a as Record<string, unknown>;
  switch (action.t) {
    case 'input':
      return action.dir === null || DIRS.has(action.dir as string);
    case 'bomb':
    case 'grab':
      return true;
    default:
      return false;
  }
}

function sanitizeSettings(
  current: BombermanSettings,
  patch: Partial<BombermanSettings>,
): BombermanSettings | null {
  const next = { ...current };
  if (patch.map !== undefined) {
    if (!BOMBER_MAPS.includes(patch.map)) return null;
    next.map = patch.map;
  }
  if (patch.suddenDeathSeconds !== undefined) {
    if (!SUDDEN_DEATH_CHOICES.includes(patch.suddenDeathSeconds)) return null;
    next.suddenDeathSeconds = patch.suddenDeathSeconds;
  }
  if (patch.lives !== undefined) {
    if (!LIVES_CHOICES.includes(patch.lives)) return null;
    next.lives = patch.lives;
  }
  if (patch.itemFrequency !== undefined) {
    if (!ITEM_FREQUENCIES.includes(patch.itemFrequency)) return null;
    next.itemFrequency = patch.itemFrequency;
  }
  return next;
}

const PU_CHAR = { fire: 'f', pierce: 'p', slow: 's', glove: 'g', boots: 'b', bombs: 'x' } as const;

function view(
  state: BombermanState,
  viewerSeat: number,
  seats: SeatMeta[],
  paused: boolean,
): BombermanView {
  // Grid rows as chars; bricks stay opaque (their contents are secret).
  const rows: string[] = [];
  for (let y = 0; y * BOMBER_W < state.grid.length; y++) {
    let row = '';
    for (let x = 0; x < BOMBER_W; x++) {
      const cell = y * BOMBER_W + x;
      const g = state.grid[cell];
      if (g === WALL) row += '#';
      else if (g === BRICK) row += 'B';
      else row += state.floorPU[cell] ? PU_CHAR[state.floorPU[cell]!] : '.';
    }
    rows.push(row);
  }

  const secondsLeft =
    state.suddenDeathAtTick === null
      ? null
      : Math.max(0, Math.ceil(((state.suddenDeathAtTick - state.tick) * TICK_MS) / 1000));

  return {
    g: 'bomberman',
    yourSeat: viewerSeat,
    grid: rows,
    bombs: state.bombs.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      ticksLeft: b.ticksLeft,
      carriedBySeat: b.carriedBySeat,
    })),
    explosions: [...state.explosions.keys()],
    players: state.players.map((p) => {
      const meta = seats[p.seat]!;
      return {
        seat: p.seat,
        nickname: meta.nickname,
        connected: meta.connected,
        isHost: meta.isHost,
        isBot: meta.isBot,
        color: meta.color ?? PLAYER_COLORS[p.seat % PLAYER_COLORS.length]!,
        x: p.x,
        y: p.y,
        alive: p.alive,
        facing: p.facing,
        fire: p.fire,
        pierce: p.pierce,
        glove: p.glove,
        speed: p.speed,
        slowed: state.tick < p.slowedUntil,
        carrying: state.bombs.some((b) => b.carriedBySeat === p.seat),
        lives: p.lives,
        moving: isMoving(state, p),
        invulnerable: state.tick < p.invulnUntil,
        stepMs: stepTicks(state, p) * TICK_MS,
        wins: meta.wins,
      };
    }),
    suddenDeathSecondsLeft: secondsLeft,
    shrinking: state.suddenDeathAtTick !== null && state.tick >= state.suddenDeathAtTick,
    paused,
    settings: { ...state.settings },
    round: state.round,
    result: state.result ? { ...state.result } : null,
  };
}

/** Bomberman: the first real-time module — the room drives tick() at TICK_MS. */
export const bombermanModule: GameModule = {
  id: 'bomberman',
  minPlayers: 2,
  maxPlayers: 8,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: true,
  tickMs: TICK_MS,
  tick: (state) => tick(state as BombermanState, botThink),

  defaultSettings: () => ({ ...DEFAULT_BOMBERMAN_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as BombermanSettings, (patch ?? {}) as Partial<BombermanSettings>),

  startRound: (settings, playerCount, _dealerSeat, round, seed, seats) => {
    const state = newGame(settings as BombermanSettings, playerCount, round, seed, seats ?? []);
    const events: GameEvent[] = [{ t: 'roundStart', round, dealerSeat: 0 }];
    return { state, events };
  },

  applyAction: (state, seat, action) => {
    const s = state as BombermanState;
    const a = action as { t: 'input'; dir: never } | { t: 'bomb' } | { t: 'grab' };
    if (a.t === 'input') return setInput(s, seat, a.dir);
    if (a.t === 'bomb') return dropBomb(s, seat);
    return grabOrThrow(s, seat);
  },
  applyTimeout: () => [], // no turn deadlines — the tick loop is the clock
  isRoundOver: (state) => (state as BombermanState).over,

  deadlineHintMs: () => null,
  awaitingSeat: () => null,
  pendingSeats: () => [], // bots act inside tick(), not via turn scheduling
  settleDisconnected: () => [], // disconnected players simply stand still

  botDelayMs: () => 0,
  chooseAction: () => ({ t: 'input', dir: null }),
  fallbackAction: () => ({ t: 'input', dir: null }),

  validateAction,
  redactFor: (state, viewerSeat, seats, _deadline, paused): ClientGameView =>
    view(state as BombermanState, viewerSeat, seats, paused),
};
