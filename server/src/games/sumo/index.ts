import {
  DEFAULT_SUMO_SETTINGS,
  SUMO_ABS_MAX_PLAYERS,
  SUMO_LIVES_CHOICES,
  SUMO_MAPS,
  SUMO_MATCH_SECONDS_CHOICES,
  SUMO_MIN_PLAYERS,
  SUMO_PLAYER_CHOICES,
  SUMO_SHRINK_AFTER_CHOICES,
  SUMO_TICK_MS,
  type SumoAction,
  type SumoSettings,
  type SumoView,
} from '@shared/sumo';
import { PLAYER_COLORS } from '@shared/bomberman';
import { DISCONNECT_TURN_GRACE_MS, THEMES } from '@shared/settings';
import type { ClientGameView } from '@shared/view';
import type { GameModule, SeatMeta } from '../GameModule';
import { currentRadius, newSumoGame, setStick, sumoTick, type SumoState } from './engine';

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  return (
    x.t === 'stick' &&
    typeof x.x === 'number' &&
    typeof x.y === 'number' &&
    Number.isFinite(x.x) &&
    Number.isFinite(x.y) &&
    Math.abs(x.x) <= 1.01 &&
    Math.abs(x.y) <= 1.01
  );
}

function sanitizeSettings(current: SumoSettings, patch: Partial<SumoSettings>): SumoSettings | null {
  const next = { ...current };
  if (patch.map !== undefined) {
    if (!(SUMO_MAPS as readonly string[]).includes(patch.map)) return null;
    next.map = patch.map;
  }
  if (patch.mode !== undefined) {
    if (patch.mode !== 'lives' && patch.mode !== 'countdown') return null;
    next.mode = patch.mode;
  }
  if (patch.lives !== undefined) {
    if (!(SUMO_LIVES_CHOICES as readonly number[]).includes(patch.lives)) return null;
    next.lives = patch.lives;
  }
  if (patch.shrinkAfterSeconds !== undefined) {
    if (!(SUMO_SHRINK_AFTER_CHOICES as readonly number[]).includes(patch.shrinkAfterSeconds)) {
      return null;
    }
    next.shrinkAfterSeconds = patch.shrinkAfterSeconds;
  }
  if (patch.matchSeconds !== undefined) {
    if (!(SUMO_MATCH_SECONDS_CHOICES as readonly number[]).includes(patch.matchSeconds)) return null;
    next.matchSeconds = patch.matchSeconds;
  }
  if (patch.maxPlayers !== undefined) {
    if (!(SUMO_PLAYER_CHOICES as readonly number[]).includes(patch.maxPlayers)) return null;
    next.maxPlayers = Math.min(patch.maxPlayers, SUMO_ABS_MAX_PLAYERS);
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}

function view(s: SumoState, viewerSeat: number, seats: SeatMeta[], paused: boolean): SumoView {
  const radius = currentRadius(s);
  let secondsLeft: number | null = null;
  if (s.settings.mode === 'lives') {
    const startTick = s.settings.shrinkAfterSeconds * 20;
    secondsLeft = s.tick < startTick ? Math.ceil((startTick - s.tick) / 20) : null;
  } else {
    secondsLeft = Math.max(0, Math.ceil((s.settings.matchSeconds * 20 - s.tick) / 20));
  }
  return {
    g: 'sumo',
    yourSeat: viewerSeat,
    players: s.players.map((p) => {
      const meta = seats[p.seat]!;
      return {
        seat: p.seat,
        nickname: meta.nickname,
        connected: meta.connected,
        isHost: meta.isHost,
        isBot: meta.isBot,
        color: meta.color ?? PLAYER_COLORS[p.seat % PLAYER_COLORS.length]!,
        wins: meta.wins,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        speed: Math.round(Math.hypot(p.vx, p.vy) * 10) / 10,
        spin: Math.round(p.spin),
        alive: p.alive,
        lives: p.lives,
        kos: p.kos,
        ghost: p.ghostTicks > 0,
        eliminated: p.eliminated,
      };
    }),
    map: s.settings.map,
    mode: s.settings.mode,
    arenaRadius: Math.round(radius),
    holeRadius: s.holeRadius,
    shrinking: s.settings.mode === 'lives' && radius < s.baseRadius,
    secondsLeft,
    paused,
    settings: { ...s.settings },
    round: s.round,
    result: s.over ? { winnerSeats: [...s.winnerSeats] } : null,
  };
}

/** Spin Sumo: real-time top-shoving — the room drives the physics tick. */
export const sumoModule: GameModule = {
  id: 'sumo',
  minPlayers: SUMO_MIN_PLAYERS,
  maxPlayers: SUMO_ABS_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: true,
  tickMs: SUMO_TICK_MS,
  tick: (state) => sumoTick(state as SumoState),

  defaultSettings: () => ({ ...DEFAULT_SUMO_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as SumoSettings, (patch ?? {}) as Partial<SumoSettings>),
  playerBounds: (settings) => ({
    min: SUMO_MIN_PLAYERS,
    max: Math.min((settings as SumoSettings).maxPlayers, SUMO_ABS_MAX_PLAYERS),
  }),

  startRound: (settings, playerCount, _dealerSeat, round, seed, seats) => ({
    state: newSumoGame(settings as SumoSettings, playerCount, round, seed, seats ?? []),
    events: [{ t: 'roundStart', round, dealerSeat: 0 }],
  }),

  applyAction: (state, seat, action) => {
    const a = action as SumoAction;
    setStick(state as SumoState, seat, a.x, a.y);
    // Steering is silent — the 50ms physics tick broadcasts everything.
    return { ok: true, events: [], sync: 'none' };
  },
  applyTimeout: () => [], // the tick loop is the only clock
  isRoundOver: (state) => (state as SumoState).over,

  deadlineHintMs: () => null,
  awaitingSeat: () => null,
  pendingSeats: () => [], // bots steer inside tick(), not via turn scheduling
  settleDisconnected: (state, connected) => {
    // A vanished player's top stops steering and takes its chances.
    const s = state as SumoState;
    for (const p of s.players) {
      if (!connected(p.seat) && !p.isBot) {
        p.inX = 0;
        p.inY = 0;
      }
    }
    return [];
  },

  botDelayMs: () => 0,
  chooseAction: (): SumoAction => ({ t: 'stick', x: 0, y: 0 }),
  fallbackAction: (): SumoAction => ({ t: 'stick', x: 0, y: 0 }),

  validateAction,
  redactFor: (state, viewerSeat, seats, _deadline, paused): ClientGameView =>
    view(state as SumoState, viewerSeat, seats, paused),
};
