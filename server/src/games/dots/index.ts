import {
  DEFAULT_DOTS_SETTINGS,
  DOTS_MAX_PLAYERS,
  DOTS_MIN_PLAYERS,
  DOTS_SIZE_CHOICES,
  type DotsAction,
  type DotsSettings,
  type DotsSize,
  type DotsView,
} from '@shared/dots';
import { PLAYER_COLORS } from '@shared/bomberman';
import { DISCONNECT_TURN_GRACE_MS, THEMES, TURN_TIMER_CHOICES } from '@shared/settings';
import type { ClientGameView } from '@shared/view';
import type { GameModule, SeatMeta } from '../GameModule';
import {
  applyDotsEdge,
  newDotsGame,
  validateDotsAction,
  type DotsState,
} from './engine';
import { chooseDotsMove, dotsBotDelayMs } from './bot';

function sanitizeSettings(current: DotsSettings, patch: Partial<DotsSettings>): DotsSettings | null {
  const next = { ...current };
  if (patch.size !== undefined) {
    if (!(DOTS_SIZE_CHOICES as readonly number[]).includes(patch.size)) return null;
    next.size = patch.size as DotsSize;
  }
  if (patch.turnTimerSeconds !== undefined) {
    if (!(TURN_TIMER_CHOICES as readonly number[]).includes(patch.turnTimerSeconds)) return null;
    next.turnTimerSeconds = patch.turnTimerSeconds;
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}

function view(
  state: DotsState,
  viewerSeat: number,
  seats: SeatMeta[],
  deadline: number | null,
  paused: boolean,
): DotsView {
  return {
    g: 'dots',
    yourSeat: viewerSeat,
    turnSeat: state.turnSeat,
    size: state.size as DotsSize,
    hEdges: [...state.hEdges],
    vEdges: [...state.vEdges],
    boxes: [...state.boxes],
    lastEdge: state.lastEdge && { ...state.lastEdge },
    extraTurn: state.extraTurn,
    players: seats.map((meta, seat) => ({
      seat,
      nickname: meta.nickname,
      connected: meta.connected,
      isHost: meta.isHost,
      isBot: meta.isBot,
      color: meta.color ?? PLAYER_COLORS[seat % PLAYER_COLORS.length]!,
      score: state.scores[seat] ?? 0,
      wins: meta.wins,
    })),
    deadline,
    paused,
    settings: { ...state.settings },
    round: state.round,
    result: state.over ? { winnerSeats: [...state.winnerSeats] } : null,
  };
}

/** Dots and Boxes as a game-agnostic {@link GameModule} (bots supported). */
export const dotsModule: GameModule = {
  id: 'dots',
  minPlayers: DOTS_MIN_PLAYERS,
  maxPlayers: DOTS_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: true,

  defaultSettings: () => ({ ...DEFAULT_DOTS_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as DotsSettings, (patch ?? {}) as Partial<DotsSettings>),

  startRound: (settings, playerCount, dealerSeat, round) => ({
    state: newDotsGame(settings as DotsSettings, playerCount, dealerSeat, round),
    events: [{ t: 'roundStart', round, dealerSeat }],
  }),

  applyAction: (state, seat, action) => {
    const a = action as DotsAction;
    return applyDotsEdge(state as DotsState, seat, { o: a.o, r: a.r, c: a.c });
  },
  applyTimeout: (state) => {
    const s = state as DotsState;
    if (s.over) return [];
    const events = [{ t: 'timeout' as const, seat: s.turnSeat }];
    const move = chooseDotsMove(s, 'medium');
    const res = applyDotsEdge(s, s.turnSeat, move);
    return res.ok ? [...events, ...res.events] : events;
  },
  isRoundOver: (state) => (state as DotsState).over,

  deadlineHintMs: (state) => {
    const s = (state as DotsState).settings.turnTimerSeconds;
    return s > 0 ? s * 1000 : null;
  },
  awaitingSeat: (state) => {
    const s = state as DotsState;
    return s.over ? null : s.turnSeat;
  },
  pendingSeats: (state) => {
    const s = state as DotsState;
    return s.over ? [] : [{ seat: s.turnSeat, kind: 'turn', fast: false }];
  },
  settleDisconnected: () => [], // the turn timer / grace unsticks the game

  botDelayMs: (difficulty) => dotsBotDelayMs(difficulty),
  chooseAction: (state, _seat, difficulty): DotsAction => {
    const move = chooseDotsMove(state as DotsState, difficulty);
    return { t: 'edge', ...move };
  },
  fallbackAction: (state): DotsAction => {
    const move = chooseDotsMove(state as DotsState, 'easy');
    return { t: 'edge', ...move };
  },

  validateAction: validateDotsAction,
  redactFor: (state, viewerSeat, seats, deadline, paused): ClientGameView =>
    view(state as DotsState, viewerSeat, seats, deadline, paused),
};
