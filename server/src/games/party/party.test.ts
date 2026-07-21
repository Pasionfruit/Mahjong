import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARTY_SETTINGS,
  PARTY_SPACES,
  PARTY_STAR_COST,
  PARTY_START_COINS,
  partyBoardPath,
  partySpaceType,
  type PartySettings,
} from '@shared/party';
import {
  applyBuyStar,
  applyChest,
  applyRoll,
  newPartyGame,
  partyTimeout,
  type PartyState,
} from './engine';
import { partyModule as m } from './index';

function settings(patch: Partial<PartySettings> = {}): PartySettings {
  return { ...DEFAULT_PARTY_SETTINGS, ...patch };
}

function game(players = 3, rounds = 2, seed = 7): PartyState {
  return newPartyGame(settings({ rounds }), players, 1, seed);
}

/** Every seat rolls (declining any star) until the chest phase opens. */
function playRound(s: PartyState): void {
  let guard = 32;
  while (s.phase !== 'chest' && !s.over && guard-- > 0) {
    if (s.phase === 'roll') expect(applyRoll(s, s.turnSeat).ok).toBe(true);
    else if (s.phase === 'buyStar') expect(applyBuyStar(s, s.turnSeat, false).ok).toBe(true);
  }
  expect(s.phase === 'chest' || s.over).toBe(true);
}

describe('board geometry', () => {
  it('the path has one coordinate per space, inside the world', () => {
    const path = partyBoardPath();
    expect(path).toHaveLength(PARTY_SPACES);
    for (const p of path) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1000);
    }
    // distinct spots
    expect(new Set(path.map((p) => `${p.x},${p.y}`)).size).toBe(PARTY_SPACES);
  });

  it('the star always sits on a blue space', () => {
    for (let seed = 1; seed < 12; seed++) {
      const s = newPartyGame(settings(), 4, 1, seed);
      expect(partySpaceType(s.starIndex)).toBe('blue');
    }
  });
});

describe('turn flow', () => {
  it('rolls move the pawn by the die and rotate the turn', () => {
    const s = game(3);
    const before = s.players[0]!.pos;
    const res = applyRoll(s, 0);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const die = res.events.find((e) => e.t === 'die');
      expect(die?.t === 'die' && die.value >= 1 && die.value <= 6).toBe(true);
      if (die?.t === 'die') {
        expect(s.players[0]!.pos).toBe((before + die.value) % PARTY_SPACES);
      }
    }
    expect(s.phase === 'roll' || s.phase === 'buyStar').toBe(true);
    if (s.phase === 'roll') expect(s.turnSeat).toBe(1);
  });

  it('rejects out-of-turn and out-of-phase actions', () => {
    const s = game(3);
    expect(applyRoll(s, 1).ok).toBe(false);
    expect(applyBuyStar(s, 0, true).ok).toBe(false);
    expect(applyChest(s, 0, 1).ok).toBe(false);
  });

  it('landing effects pay and charge coins', () => {
    // Sweep seeds until both a +3 and a -3 landing have been observed. The
    // events are the source of truth (a warp event can move the pawn after
    // its landing effect resolved).
    let sawGain = false;
    let sawLoss = false;
    for (let seed = 1; seed < 60 && !(sawGain && sawLoss); seed++) {
      const s = newPartyGame(settings(), 2, 1, seed);
      const before = s.players[0]!.coins;
      const res = applyRoll(s, 0);
      expect(res.ok).toBe(true);
      if (!res.ok) continue;
      const deltas = res.events.flatMap((e) => (e.t === 'coins' && e.seat === 0 ? [e.delta] : []));
      const total = deltas.reduce((a, b) => a + b, 0);
      expect(s.players[0]!.coins).toBe(Math.max(0, before + total));
      if (deltas.includes(3)) sawGain = true;
      if (deltas.includes(-3)) sawLoss = true;
    }
    expect(sawGain && sawLoss).toBe(true);
  });

  it('after every seat has rolled, the chest round opens', () => {
    const s = game(3);
    playRound(s);
    expect(s.phase).toBe('chest');
    expect(s.players.every((p) => p.chestPick === -1)).toBe(true);
  });
});

describe('the star', () => {
  it('passing the star with enough coins offers a purchase', () => {
    const s = game(2);
    const p = s.players[0]!;
    p.coins = 50;
    p.pos = (s.starIndex - 1 + PARTY_SPACES) % PARTY_SPACES; // one step short
    applyRoll(s, 0); // any die value passes or lands the star
    expect(s.phase).toBe('buyStar');
    const stars = p.stars;
    const star = s.starIndex;
    const coinsBeforeBuy = p.coins; // post-landing-effect balance
    expect(applyBuyStar(s, 0, true).ok).toBe(true);
    expect(p.stars).toBe(stars + 1);
    expect(p.coins).toBe(coinsBeforeBuy - PARTY_STAR_COST);
    expect(s.starIndex).not.toBe(star); // the star moved on
  });

  it('declining keeps coins and the star in place', () => {
    const s = game(2);
    const p = s.players[0]!;
    p.coins = 30;
    p.pos = (s.starIndex - 1 + PARTY_SPACES) % PARTY_SPACES;
    applyRoll(s, 0);
    expect(s.phase).toBe('buyStar');
    const star = s.starIndex;
    const coins = p.coins;
    applyBuyStar(s, 0, false);
    expect(p.stars).toBe(0);
    expect(p.coins).toBe(coins);
    expect(s.starIndex).toBe(star);
  });

  it('a broke player is never offered the star', () => {
    const s = game(2);
    const p = s.players[0]!;
    p.coins = 0;
    p.pos = (s.starIndex - 1 + PARTY_SPACES) % PARTY_SPACES;
    applyRoll(s, 0);
    expect(s.phase).not.toBe('buyStar');
  });
});

describe('chests & endings', () => {
  it('resolves once everyone picks; rewards match the shuffled chests', () => {
    const s = game(3);
    playRound(s);
    const before = s.players.map((p) => p.coins);
    applyChest(s, 0, 0);
    applyChest(s, 1, 1);
    expect(s.chestReveal).toBeNull(); // still waiting on seat 2
    applyChest(s, 2, 0); // sharing a chest is allowed
    expect(s.chestReveal).not.toBeNull();
    const { rewards, picks } = s.chestReveal!;
    expect([...rewards].sort((a, b) => a - b)).toEqual([-5, 5, 10]);
    s.players.forEach((p, i) => {
      expect(p.coins).toBe(Math.max(0, before[i]! + rewards[picks[i]!]!));
    });
    expect(s.turnRound).toBe(2);
    expect(s.phase).toBe('roll');
    expect(s.turnSeat).toBe(0);
  });

  it('double-picking is rejected', () => {
    const s = game(2);
    playRound(s);
    expect(applyChest(s, 0, 1).ok).toBe(true);
    expect(applyChest(s, 0, 2).ok).toBe(false);
  });

  it('the game ends after the configured rounds — stars, then coins decide', () => {
    const s = game(3, 1); // single round
    s.players[1]!.stars = 2;
    s.players[2]!.stars = 2;
    s.players[1]!.coins = 40;
    s.players[2]!.coins = 15;
    playRound(s);
    for (const p of s.players) if (p.chestPick === -1) applyChest(s, p.seat, 0);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([1]); // tied on stars, richer wins
    expect(m.isRoundOver(s)).toBe(true);
  });

  it('a full stars-and-coins tie crowns everyone tied', () => {
    const s = game(2, 1, 11);
    playRound(s);
    // Force symmetry before resolution.
    for (const p of s.players) {
      p.stars = 1;
      p.coins = 20;
      p.chestPick = -1;
    }
    applyChest(s, 0, 0);
    applyChest(s, 1, 0); // same chest → same reward → still tied
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([0, 1]);
  });
});

describe('timeouts & module wiring', () => {
  it('timeouts auto-roll, decline stars, and fill chest picks', () => {
    const s = game(2);
    partyTimeout(s); // auto-roll seat 0
    expect(s.players[0]!.pos).not.toBe(0);
    if (s.phase === 'buyStar') {
      partyTimeout(s);
      expect(s.phase).toBe('roll');
    }
    // Fast-forward to chests, then let the timeout pick for everyone.
    while (s.phase !== 'chest' && !s.over) partyTimeout(s);
    if (!s.over) {
      partyTimeout(s);
      expect(s.phase === 'roll' || s.over).toBe(true);
    }
  });

  it('pending seats follow the phase (single mover vs all unpicked)', () => {
    const s = game(3);
    expect(m.pendingSeats(s)).toEqual([{ seat: 0, kind: 'roll', fast: false }]);
    playRound(s);
    expect(m.pendingSeats(s)).toHaveLength(3);
    applyChest(s, 1, 0);
    expect(m.pendingSeats(s).map((p) => p.seat)).toEqual([0, 2]);
  });

  it('bot hooks always produce a legal action', () => {
    const s = game(3);
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const a = m.chooseAction(s, s.turnSeat, d);
      expect(m.validateAction(a)).toBe(true);
    }
    playRound(s);
    const pick = m.chooseAction(s, 1, 'hard');
    expect(m.validateAction(pick)).toBe(true);
    expect((pick as { t: string }).t).toBe('chest');
  });

  it('validates and sanitizes', () => {
    expect(m.validateAction({ t: 'roll' })).toBe(true);
    expect(m.validateAction({ t: 'buyStar', buy: true })).toBe(true);
    expect(m.validateAction({ t: 'chest', index: 2 })).toBe(true);
    expect(m.validateAction({ t: 'chest', index: 'a' })).toBe(false);
    expect(m.sanitizeSettings(settings(), { rounds: 7 })).toBeNull();
    expect(m.sanitizeSettings(settings(), { rounds: 15 })).not.toBeNull();
  });

  it('redacts a public view with colors, feed, and progress', () => {
    const { state } = m.startRound(settings(), 4, 0, 1, 5);
    const seats = Array.from({ length: 4 }, (_, i) => ({
      nickname: `P${i}`,
      connected: true,
      isHost: i === 0,
      wins: 0,
    }));
    const v = m.redactFor(state, 2, seats, null, false);
    expect(v.g).toBe('party');
    if (v.g === 'party') {
      expect(v.players).toHaveLength(4);
      expect(v.spaces).toHaveLength(PARTY_SPACES);
      expect(v.players.every((p) => p.coins === PARTY_START_COINS)).toBe(true);
      expect(v.progress).toEqual({ current: 1, total: 10 });
      expect(v.starCost).toBe(PARTY_STAR_COST);
    }
  });
});
