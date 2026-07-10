import type { ClientGameView, GameEvent, UtttView } from '@shared/view';
import type { UtttAction } from '@shared/protocol';
import { DEFAULT_UTTT_SETTINGS, type UtttPlayer, type UtttSettings } from '@shared/uttt';
import { DISCONNECT_TURN_GRACE_MS } from '@shared/settings';
import type { GameModule, SeatMeta } from '../GameModule';
import { autoMove, legalMoves, markOf, newGame, place, type UtttState } from './engine';
import { chooseUtttMove, utttBotDelayMs } from './bot';
import { sanitizeSettings } from './settings';

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const action = a as Record<string, unknown>;
  return action.t === 'place' && typeof action.board === 'number' && typeof action.cell === 'number';
}

function view(
  state: UtttState,
  viewerSeat: number,
  seats: SeatMeta[],
  deadline: number | null,
  paused: boolean,
): UtttView {
  const players: UtttPlayer[] = seats.map((meta, seat) => ({
    seat,
    nickname: meta.nickname,
    connected: meta.connected,
    isHost: meta.isHost,
    isBot: meta.isBot,
    mark: markOf(state, seat),
    wins: meta.wins,
  }));
  return {
    g: 'uttt',
    yourSeat: viewerSeat,
    turnSeat: state.turnSeat,
    yourMark: viewerSeat < seats.length ? markOf(state, viewerSeat) : null,
    boards: state.boards.map((b) => [...b]),
    boardResults: [...state.boardResults],
    activeBoard: state.activeBoard,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    deadline,
    paused,
    players,
    settings: { ...state.settings },
    round: 0,
    result: state.result ? { ...state.result } : null,
  };
}

/** Ultimate Tic-Tac-Toe as a game-agnostic {@link GameModule}. */
export const utttModule: GameModule = {
  id: 'uttt',
  minPlayers: 2,
  maxPlayers: 2,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,

  defaultSettings: () => ({ ...DEFAULT_UTTT_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as UtttSettings, (patch ?? {}) as Partial<UtttSettings>),

  startRound: (settings, _playerCount, dealerSeat) => {
    const state = newGame(dealerSeat, settings as UtttSettings);
    const events: GameEvent[] = [{ t: 'roundStart', round: 1, dealerSeat }];
    return { state, events };
  },

  applyAction: (state, seat, action) => {
    const act = action as UtttAction;
    return place(state as UtttState, seat, act.board, act.cell);
  },
  applyTimeout: (state) => autoMove(state as UtttState),
  isRoundOver: (state) => (state as UtttState).over,

  deadlineHintMs: (state) => {
    const s = (state as UtttState).settings.turnTimerSeconds;
    return s > 0 ? s * 1000 : null;
  },
  awaitingSeat: (state) => {
    const s = state as UtttState;
    return s.over ? null : s.turnSeat;
  },
  pendingSeats: (state) => {
    const s = state as UtttState;
    return s.over ? [] : [{ seat: s.turnSeat, kind: 'turn', fast: false }];
  },
  settleDisconnected: () => [], // no simultaneous claims to auto-resolve

  botDelayMs: (difficulty) => utttBotDelayMs(difficulty),
  chooseAction: (state, seat, difficulty) => chooseUtttMove(state as UtttState, seat, difficulty),
  fallbackAction: (state): UtttAction => {
    const mv = legalMoves(state as UtttState)[0];
    return mv ? { t: 'place', board: mv.board, cell: mv.cell } : { t: 'place', board: 0, cell: 0 };
  },

  validateAction,
  redactFor: (state, viewerSeat, seats, deadline, paused): ClientGameView =>
    view(state as UtttState, viewerSeat, seats, deadline, paused),
};
