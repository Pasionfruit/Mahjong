import {
  PARTY_BLUE_COINS,
  PARTY_CHEST_REWARDS,
  PARTY_DIE_MAX,
  PARTY_RED_COINS,
  PARTY_SPACES,
  PARTY_STAR_COST,
  PARTY_START_COINS,
  partySpaceType,
  type PartyFeedItem,
  type PartyPhase,
  type PartySettings,
} from '@shared/party';
import type { GameEvent } from '@shared/view';
import type { ApplyResult } from '../GameModule';
import { mulberry32 } from '../../engine/rng';

const FEED_LIMIT = 10;

export interface PartyPlayer {
  seat: number;
  pos: number;
  coins: number;
  stars: number;
  /** Chest phase pick, -1 = undecided. */
  chestPick: number;
}

export interface PartyState {
  settings: PartySettings;
  playerCount: number;
  round: number;
  rng: () => number;
  phase: PartyPhase;
  turnSeat: number;
  /** 1-based board round; every player rolls once per round. */
  turnRound: number;
  die: number | null;
  starIndex: number;
  players: PartyPlayer[];
  feed: PartyFeedItem[];
  /** Chest rewards for the current bonus round, index-aligned to chests. */
  chestRewards: number[];
  /** Set once every pick is in, so clients can reveal before the next round. */
  chestReveal: { rewards: number[]; picks: number[] } | null;
  over: boolean;
  winnerSeats: number[];
}

function feed(s: PartyState, item: PartyFeedItem): void {
  s.feed.push(item);
  if (s.feed.length > FEED_LIMIT) s.feed.splice(0, s.feed.length - FEED_LIMIT);
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** A random blue space to host the star, away from its previous spot. */
function relocateStar(s: PartyState): void {
  const blues: number[] = [];
  for (let i = 0; i < PARTY_SPACES; i++) {
    if (partySpaceType(i) === 'blue' && i !== s.starIndex) blues.push(i);
  }
  s.starIndex = blues[(s.rng() * blues.length) | 0]!;
}

export function newPartyGame(
  settings: PartySettings,
  playerCount: number,
  round: number,
  seed: number,
): PartyState {
  const s: PartyState = {
    settings: { ...settings },
    playerCount,
    round,
    rng: mulberry32(seed),
    phase: 'roll',
    turnSeat: 0,
    turnRound: 1,
    die: null,
    starIndex: 0,
    players: Array.from({ length: playerCount }, (_, seat) => ({
      seat,
      pos: 0,
      coins: PARTY_START_COINS,
      stars: 0,
      chestPick: -1,
    })),
    feed: [],
    chestRewards: [],
    chestReveal: null,
    over: false,
    winnerSeats: [],
  };
  relocateStar(s);
  return s;
}

function addCoins(s: PartyState, seat: number, delta: number, events: GameEvent[]): void {
  const p = s.players[seat]!;
  p.coins = Math.max(0, p.coins + delta);
  events.push({ t: 'coins', seat, delta });
}

/** Random event spaces: a little chaos, never game-breaking. */
function runEvent(s: PartyState, seat: number, events: GameEvent[]): void {
  const roll = s.rng();
  const p = s.players[seat]!;
  if (roll < 0.3) {
    addCoins(s, seat, 5, events);
    feed(s, { kind: 'coins', seat, value: 5 });
  } else if (roll < 0.55) {
    addCoins(s, seat, -5, events);
    feed(s, { kind: 'coins', seat, value: -5 });
  } else if (roll < 0.8 && s.playerCount > 1) {
    // Warp: swap places with a random other player.
    let other = seat;
    while (other === seat) other = (s.rng() * s.playerCount) | 0;
    const o = s.players[other]!;
    const tmp = p.pos;
    p.pos = o.pos;
    o.pos = tmp;
    feed(s, { kind: 'swap', seat, other });
  } else {
    // Steal 5 coins from the richest other player (if they have any).
    let richest = -1;
    for (const o of s.players) {
      if (o.seat !== seat && (richest === -1 || o.coins > s.players[richest]!.coins)) {
        richest = o.seat;
      }
    }
    if (richest >= 0 && s.players[richest]!.coins > 0) {
      const take = Math.min(5, s.players[richest]!.coins);
      addCoins(s, richest, -take, events);
      addCoins(s, seat, take, events);
      feed(s, { kind: 'steal', seat, other: richest, value: take });
    } else {
      addCoins(s, seat, 3, events);
      feed(s, { kind: 'coins', seat, value: 3 });
    }
  }
}

function beginChestRound(s: PartyState): void {
  s.phase = 'chest';
  s.chestRewards = shuffle([...PARTY_CHEST_REWARDS], s.rng);
  s.chestReveal = null;
  for (const p of s.players) p.chestPick = -1;
}

function settleWinners(s: PartyState, events: GameEvent[]): void {
  s.phase = 'final';
  s.over = true;
  const topStars = Math.max(...s.players.map((p) => p.stars));
  const contenders = s.players.filter((p) => p.stars === topStars);
  const topCoins = Math.max(...contenders.map((p) => p.coins));
  s.winnerSeats = contenders.filter((p) => p.coins === topCoins).map((p) => p.seat);
  for (const w of s.winnerSeats) events.push({ t: 'win', seat: w, by: 'lastStanding' });
}

function endTurn(s: PartyState, events: GameEvent[]): void {
  s.die = null;
  if (s.turnSeat + 1 < s.playerCount) {
    s.turnSeat += 1;
    s.phase = 'roll';
    return;
  }
  // Everyone has moved: bonus chests, then the next round (or the finale).
  beginChestRound(s);
  void events;
}

function resolveChests(s: PartyState, events: GameEvent[]): void {
  const picks = s.players.map((p) => p.chestPick);
  for (const p of s.players) {
    const reward = s.chestRewards[p.chestPick] ?? 0;
    addCoins(s, p.seat, reward, events);
    feed(s, { kind: 'chest', seat: p.seat, value: reward });
  }
  s.chestReveal = { rewards: [...s.chestRewards], picks };
  if (s.turnRound >= s.settings.rounds) {
    settleWinners(s, events);
    return;
  }
  s.turnRound += 1;
  s.turnSeat = 0;
  s.phase = 'roll';
}

// ── actions ─────────────────────────────────────────────────────────────────

export function applyRoll(s: PartyState, seat: number): ApplyResult {
  if (s.over || s.phase !== 'roll') return { ok: false, error: 'no roll due' };
  if (seat !== s.turnSeat) return { ok: false, error: 'not your turn' };
  const events: GameEvent[] = [];
  const value = 1 + ((s.rng() * PARTY_DIE_MAX) | 0);
  s.die = value;
  events.push({ t: 'die', seat, value });
  feed(s, { kind: 'roll', seat, value });

  const p = s.players[seat]!;
  let passedStar = false;
  for (let step = 1; step <= value; step++) {
    if ((p.pos + step) % PARTY_SPACES === s.starIndex) passedStar = true;
  }
  p.pos = (p.pos + value) % PARTY_SPACES;

  // Landing effect first, so event warps still see your true landing spot.
  const type = partySpaceType(p.pos);
  if (type === 'blue' || type === 'start') {
    addCoins(s, seat, PARTY_BLUE_COINS, events);
    feed(s, { kind: 'coins', seat, value: PARTY_BLUE_COINS });
  } else if (type === 'red') {
    addCoins(s, seat, PARTY_RED_COINS, events);
    feed(s, { kind: 'coins', seat, value: PARTY_RED_COINS });
  } else {
    feed(s, { kind: 'event', seat });
    runEvent(s, seat, events);
  }

  if (passedStar && p.coins >= PARTY_STAR_COST) {
    s.phase = 'buyStar';
    return { ok: true, events };
  }
  if (passedStar) feed(s, { kind: 'noStar', seat });
  endTurn(s, events);
  return { ok: true, events };
}

export function applyBuyStar(s: PartyState, seat: number, buy: boolean): ApplyResult {
  if (s.over || s.phase !== 'buyStar') return { ok: false, error: 'no star on offer' };
  if (seat !== s.turnSeat) return { ok: false, error: 'not your turn' };
  const events: GameEvent[] = [];
  const p = s.players[seat]!;
  if (buy && p.coins >= PARTY_STAR_COST) {
    p.coins -= PARTY_STAR_COST;
    p.stars += 1;
    events.push({ t: 'star', seat });
    feed(s, { kind: 'star', seat });
    relocateStar(s);
  } else {
    feed(s, { kind: 'noStar', seat });
  }
  endTurn(s, events);
  return { ok: true, events };
}

export function applyChest(s: PartyState, seat: number, index: number): ApplyResult {
  if (s.over || s.phase !== 'chest') return { ok: false, error: 'no chests open' };
  if (!Number.isInteger(index) || index < 0 || index > 2) return { ok: false, error: 'invalid chest' };
  const p = s.players[seat];
  if (!p) return { ok: false, error: 'not seated' };
  if (p.chestPick !== -1) return { ok: false, error: 'already picked' };
  p.chestPick = index;
  const events: GameEvent[] = [];
  if (s.players.every((q) => q.chestPick !== -1)) resolveChests(s, events);
  return { ok: true, events };
}

/** Deadline expiry: auto-roll, decline the star, or pick random chests. */
export function partyTimeout(s: PartyState): GameEvent[] {
  if (s.over) return [];
  if (s.phase === 'roll') {
    const r = applyRoll(s, s.turnSeat);
    return [{ t: 'timeout', seat: s.turnSeat }, ...(r.ok ? r.events : [])];
  }
  if (s.phase === 'buyStar') {
    const seat = s.turnSeat;
    const r = applyBuyStar(s, seat, false);
    return [{ t: 'timeout', seat }, ...(r.ok ? r.events : [])];
  }
  // chest: fill every missing pick at random
  const events: GameEvent[] = [];
  for (const p of s.players) {
    if (p.chestPick === -1) {
      const r = applyChest(s, p.seat, (s.rng() * 3) | 0);
      if (r.ok) events.push(...r.events);
    }
  }
  return events;
}
