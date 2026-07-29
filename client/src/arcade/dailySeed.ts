export { dailyRng, dailySeed } from '@shared/rng';

/**
 * Today's UTC calendar day as "YYYY-MM-DD" — the shared "today" every
 * player's daily puzzle is generated against, regardless of local timezone.
 * Deliberately UTC, not local midnight: a global leaderboard needs one
 * unambiguous "today," not one that rolls over at a different moment for
 * every player. Accepts an override so it stays trivially testable.
 */
export function dateKeyUTC(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
