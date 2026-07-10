import {
  DEFAULT_SETTINGS,
  DISCONNECT_TURN_GRACE_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameSettings,
} from '@shared/settings';
import type { GameEvent } from '@shared/view';
import type { PlayerAction } from '@shared/protocol';
import { applyPlayerAction, applyTimeout, startRound, type GameState } from '../../engine/game';
import { botDelayMs as mjBotDelay, chooseClaimAction, chooseTurnAction } from '../../engine/bot';
import { deadlineHintMs, redactFor } from '../../engine/redact';
import type { GameModule, PendingMove } from '../GameModule';
import { sanitizeSettings } from './settings';
import { validateAction } from './validate';

/** The existing Mahjong engine, adapted to the game-agnostic {@link GameModule}. */
export const mahjongModule: GameModule = {
  id: 'mahjong',
  minPlayers: MIN_PLAYERS,
  maxPlayers: MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,

  defaultSettings: () => ({ ...DEFAULT_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as GameSettings, (patch ?? {}) as Partial<GameSettings>),

  startRound: (settings, playerCount, dealerSeat, round, seed) =>
    startRound(settings as GameSettings, playerCount, dealerSeat, round, seed),

  applyAction: (state, seat, action) =>
    applyPlayerAction(state as GameState, seat, action as PlayerAction),
  applyTimeout: (state) => applyTimeout(state as GameState),
  isRoundOver: (state) => (state as GameState).phase.t === 'roundOver',

  deadlineHintMs: (state) => deadlineHintMs(state as GameState),
  awaitingSeat: (state) => {
    const s = state as GameState;
    return s.phase.t === 'awaitingDiscard' ? s.phase.seat : null;
  },
  pendingSeats: (state) => {
    const s = state as GameState;
    if (s.phase.t === 'awaitingDiscard') {
      return [{ seat: s.phase.seat, kind: 'turn', fast: false }];
    }
    if (s.phase.t === 'claimWindow') {
      const out: PendingMove[] = [];
      for (const [seat, opts] of s.phase.eligible) {
        if (s.phase.responses.has(seat)) continue;
        out.push({ seat, kind: 'claim', fast: opts.win });
      }
      return out;
    }
    return [];
  },
  settleDisconnected: (state, connected) => {
    const s = state as GameState;
    const events: GameEvent[] = [];
    while (s.phase.t === 'claimWindow') {
      const phase = s.phase;
      const pending = [...phase.eligible.keys()].find(
        (seat) => !phase.responses.has(seat) && !connected(seat),
      );
      if (pending === undefined) break;
      const res = applyPlayerAction(s, pending, { t: 'pass' });
      if (!res.ok) break;
      events.push(...res.events);
    }
    return events;
  },

  botDelayMs: (difficulty, kind, fast) =>
    mjBotDelay(difficulty, kind === 'claim' ? 'claim' : 'turn', fast),
  chooseAction: (state, seat, difficulty) => {
    const s = state as GameState;
    return s.phase.t === 'awaitingDiscard'
      ? chooseTurnAction(s, seat, difficulty)
      : chooseClaimAction(s, seat, difficulty);
  },
  fallbackAction: (state, seat): PlayerAction => {
    const s = state as GameState;
    if (s.phase.t === 'awaitingDiscard') {
      const hand = s.players[seat]!.hand;
      return { t: 'discard', tileId: hand[hand.length - 1]!.id };
    }
    return { t: 'pass' };
  },

  validateAction,
  redactFor: (state, viewerSeat, seats, deadline, paused) =>
    redactFor(state as GameState, viewerSeat, seats, deadline, paused),
};
