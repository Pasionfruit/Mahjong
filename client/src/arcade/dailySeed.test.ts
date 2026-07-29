import { describe, expect, it } from 'vitest';
import { dailyRng, dailySeed, dateKeyUTC } from './dailySeed';

describe('dateKeyUTC', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dateKeyUTC(new Date('2026-07-29T14:32:00Z'))).toBe('2026-07-29');
  });

  it('uses the UTC day, not the local day, regardless of the wall-clock time', () => {
    expect(dateKeyUTC(new Date('2026-07-29T00:00:00.000Z'))).toBe('2026-07-29');
    expect(dateKeyUTC(new Date('2026-07-29T23:59:59.999Z'))).toBe('2026-07-29');
  });

  it('defaults to the current moment when called with no argument', () => {
    const key = dateKeyUTC();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('dailySeed / dailyRng re-exports', () => {
  it('re-exports the exact shared implementation (identity, not a reimplementation)', () => {
    expect(dailySeed('wordle', '2026-07-29')).toBe(dailySeed('wordle', '2026-07-29'));
    expect(dailyRng('wordle', '2026-07-29')()).toBe(dailyRng('wordle', '2026-07-29')());
  });
});
