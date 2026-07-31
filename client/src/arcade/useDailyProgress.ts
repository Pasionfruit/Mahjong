import { useEffect, useState } from 'react';
import { dateKeyUTC } from './dailySeed';
import { getAllResults } from './storage/db';

/**
 * Which games this profile has finished a daily for today — read from the
 * local results store (the same per-profile history that computes streaks).
 * Refreshes on mount, so returning from a game shows the fresh check.
 */
export function useDailyProgress(): Set<string> {
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    const today = dateKeyUTC();
    void getAllResults().then((rows) => {
      if (cancelled) return;
      setDone(new Set(rows.filter((r) => r.mode === 'daily' && r.dateKey === today).map((r) => r.gameId)));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return done;
}
