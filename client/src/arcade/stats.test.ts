import { describe, expect, it } from 'vitest';
import { EMPTY_STREAK, levelForXp, nextStreakState, xpForLevel, xpProgress } from './stats';

describe('xp curve', () => {
  it('level 1 requires the base amount', () => {
    expect(xpForLevel(1)).toBe(100);
  });

  it('is strictly increasing', () => {
    for (let l = 1; l < 30; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
  });

  it('levelForXp round-trips against the curve boundaries', () => {
    for (let l = 1; l <= 15; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1 || 1);
    }
  });

  it('never reports a level below 1, even for zero/negative xp', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-50)).toBe(1);
  });

  it('xpProgress reports consistent bounds', () => {
    const p = xpProgress(250);
    expect(p.level).toBe(levelForXp(250));
    expect(p.into).toBeGreaterThanOrEqual(0);
    expect(p.into).toBeLessThan(p.span);
  });
});

describe('daily streak state machine', () => {
  it('starts a fresh streak from empty', () => {
    const s = nextStreakState(EMPTY_STREAK, '2026-07-29');
    expect(s).toEqual({ streak: 1, graceUsed: false, lastPlayedDateKey: '2026-07-29' });
  });

  it('is a no-op if called again for the same day', () => {
    const s1 = nextStreakState(EMPTY_STREAK, '2026-07-29');
    const s2 = nextStreakState(s1, '2026-07-29');
    expect(s2).toEqual(s1);
  });

  it('increments on a consecutive day', () => {
    const s1 = nextStreakState(EMPTY_STREAK, '2026-07-29');
    const s2 = nextStreakState(s1, '2026-07-30');
    expect(s2).toEqual({ streak: 2, graceUsed: false, lastPlayedDateKey: '2026-07-30' });
  });

  it('forgives exactly one missed day via the grace mechanism', () => {
    const s1 = nextStreakState(EMPTY_STREAK, '2026-07-29'); // streak 1
    const s2 = nextStreakState(s1, '2026-07-31'); // missed the 30th
    expect(s2).toEqual({ streak: 2, graceUsed: true, lastPlayedDateKey: '2026-07-31' });
  });

  it('does not forgive a second gap once the grace day is spent', () => {
    const s1 = nextStreakState(EMPTY_STREAK, '2026-07-29');
    const s2 = nextStreakState(s1, '2026-07-31'); // grace used, streak 2
    const s3 = nextStreakState(s2, '2026-08-02'); // missed the 1st too
    expect(s3).toEqual({ streak: 1, graceUsed: false, lastPlayedDateKey: '2026-08-02' });
  });

  it('resets on a gap of more than one missed day', () => {
    const s1 = nextStreakState(EMPTY_STREAK, '2026-07-29');
    const s2 = nextStreakState(s1, '2026-08-05'); // missed a week
    expect(s2).toEqual({ streak: 1, graceUsed: false, lastPlayedDateKey: '2026-08-05' });
  });

  it('a fresh grace day becomes available again after a reset', () => {
    const s1 = nextStreakState(EMPTY_STREAK, '2026-07-29');
    const s2 = nextStreakState(s1, '2026-08-05'); // reset, streak 1
    const s3 = nextStreakState(s2, '2026-08-07'); // missed one day again
    expect(s3).toEqual({ streak: 2, graceUsed: true, lastPlayedDateKey: '2026-08-07' });
  });
});
