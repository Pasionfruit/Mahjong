import {
  DEFAULT_PARTY_SETTINGS,
  PARTY_BUY_SECONDS,
  PARTY_CHEST_SECONDS,
  PARTY_MAX_PLAYERS,
  PARTY_MIN_PLAYERS,
  PARTY_ROLL_SECONDS,
  PARTY_ROUNDS_CHOICES,
  PARTY_SPACES,
  PARTY_STAR_COST,
  partySpaceType,
  type PartyAction,
  type PartySettings,
  type PartyView,
} from '@shared/party';
import { PLAYER_COLORS } from '@shared/bomberman';
import { DISCONNECT_TURN_GRACE_MS, THEMES, type BotDifficulty } from '@shared/settings';
import type { ClientGameView } from '@shared/view';
import type { GameModule, PendingMove, SeatMeta } from '../GameModule';
import {
  applyBuyStar,
  applyChest,
  applyRoll,
  newPartyGame,
  partyTimeout,
  type PartyState,
} from './engine';

function validateAction(a: unknown): boolean {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  if (x.t === 'roll') return true;
  if (x.t === 'buyStar') return typeof x.buy === 'boolean';
  if (x.t === 'chest') return typeof x.index === 'number' && Number.isInteger(x.index);
  return false;
}

function sanitizeSettings(
  current: PartySettings,
  patch: Partial<PartySettings>,
): PartySettings | null {
  const next = { ...current };
  if (patch.rounds !== undefined) {
    if (!(PARTY_ROUNDS_CHOICES as readonly number[]).includes(patch.rounds)) return null;
    next.rounds = patch.rounds;
  }
  if (patch.theme !== undefined) {
    if (!(THEMES as readonly string[]).includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}

function view(
  s: PartyState,
  viewerSeat: number,
  seats: SeatMeta[],
  deadline: number | null,
  paused: boolean,
): PartyView {
  return {
    g: 'party',
    yourSeat: viewerSeat,
    phase: s.phase,
    turnSeat: s.turnSeat,
    progress: { current: Math.min(s.turnRound, s.settings.rounds), total: s.settings.rounds },
    die: s.die,
    starIndex: s.starIndex,
    starCost: PARTY_STAR_COST,
    spaces: Array.from({ length: PARTY_SPACES }, (_, i) => partySpaceType(i)),
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
        pos: p.pos,
        coins: p.coins,
        stars: p.stars,
        picked: p.chestPick !== -1,
      };
    }),
    feed: s.feed.map((f) => ({ ...f })),
    chestReveal: s.chestReveal ? { rewards: [...s.chestReveal.rewards], picks: [...s.chestReveal.picks] } : null,
    deadline,
    paused,
    settings: { ...s.settings },
    round: s.round,
    result: s.over ? { winnerSeats: [...s.winnerSeats] } : null,
  };
}

/** Party Board: a board-game night in one module (2–8 players, bots welcome). */
export const partyModule: GameModule = {
  id: 'party',
  minPlayers: PARTY_MIN_PLAYERS,
  maxPlayers: PARTY_MAX_PLAYERS,
  turnGraceMs: DISCONNECT_TURN_GRACE_MS,
  supportsBots: true,

  defaultSettings: () => ({ ...DEFAULT_PARTY_SETTINGS }),
  sanitizeSettings: (current, patch) =>
    sanitizeSettings(current as PartySettings, (patch ?? {}) as Partial<PartySettings>),

  startRound: (settings, playerCount, _dealerSeat, round, seed) => ({
    state: newPartyGame(settings as PartySettings, playerCount, round, seed),
    events: [{ t: 'roundStart', round, dealerSeat: 0 }],
  }),

  applyAction: (state, seat, action) => {
    const s = state as PartyState;
    const a = action as PartyAction;
    if (a.t === 'roll') return applyRoll(s, seat);
    if (a.t === 'buyStar') return applyBuyStar(s, seat, a.buy);
    return applyChest(s, seat, a.index);
  },
  applyTimeout: (state) => partyTimeout(state as PartyState),
  isRoundOver: (state) => (state as PartyState).over,

  deadlineHintMs: (state) => {
    const s = state as PartyState;
    if (s.over) return null;
    if (s.phase === 'roll') return PARTY_ROLL_SECONDS * 1000;
    if (s.phase === 'buyStar') return PARTY_BUY_SECONDS * 1000;
    return PARTY_CHEST_SECONDS * 1000;
  },
  awaitingSeat: (state) => {
    const s = state as PartyState;
    if (s.over || s.phase === 'chest') return null;
    return s.turnSeat;
  },
  pendingSeats: (state): PendingMove[] => {
    const s = state as PartyState;
    if (s.over) return [];
    if (s.phase === 'chest') {
      return s.players
        .filter((p) => p.chestPick === -1)
        .map((p) => ({ seat: p.seat, kind: 'chest', fast: false }));
    }
    return [{ seat: s.turnSeat, kind: s.phase, fast: false }];
  },
  settleDisconnected: () => [], // deadlines keep the party moving

  botDelayMs: (difficulty: BotDifficulty, kind) =>
    kind === 'chest' ? 900 + Math.random() * 900 : difficulty === 'easy' ? 1400 : 1000,
  chooseAction: (state, _seat, difficulty): PartyAction => {
    const s = state as PartyState;
    if (s.phase === 'roll') return { t: 'roll' };
    if (s.phase === 'buyStar') {
      // Stars win games: everyone buys, the careless bot only usually.
      return { t: 'buyStar', buy: difficulty === 'easy' ? Math.random() < 0.7 : true };
    }
    return { t: 'chest', index: (Math.random() * 3) | 0 };
  },
  fallbackAction: (state): PartyAction => {
    const s = state as PartyState;
    if (s.phase === 'roll') return { t: 'roll' };
    if (s.phase === 'buyStar') return { t: 'buyStar', buy: false };
    return { t: 'chest', index: 0 };
  },

  validateAction,
  redactFor: (state, viewerSeat, seats, deadline, paused): ClientGameView =>
    view(state as PartyState, viewerSeat, seats, deadline, paused),
};
