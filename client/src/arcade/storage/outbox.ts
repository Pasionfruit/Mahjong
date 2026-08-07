import type { StoredResult } from '../types';
import { currentUser, getDisplayName } from '../auth';
import { LEADERBOARDS } from '../leaderboardCatalog';
import { getSupabase } from '../supabase';
import { xpForResult } from '../stats';
import { getAllResults, getUnsyncedResults, putResult } from './db';

/**
 * Save a completed run locally — instant, no network wait, streak/XP UI can
 * update immediately — then try to sync it. Local-first by design: playing
 * offline is a first-class case, not a fallback.
 */
export async function recordResult(r: Omit<StoredResult, 'id' | 'syncedAt'>): Promise<StoredResult> {
  const row: StoredResult = { ...r, id: crypto.randomUUID(), syncedAt: null };
  await putResult(row);
  void flushOutbox();
  return row;
}

function toRow(r: StoredResult, userId: string, displayName: string) {
  return {
    id: r.id,
    user_id: userId,
    display_name: displayName,
    game_id: r.gameId,
    mode: r.mode,
    date_key: r.dateKey,
    score: r.score,
    stats: r.stats,
    move_log: r.moveLog,
    completed_at: r.completedAt,
  };
}

/** Postgres unique_violation — see the daily-uniqueness constraint on game_results. */
const UNIQUE_VIOLATION = '23505';

/** Whether a lower score wins for this game (times / fewest moves), read
 *  from the same board catalog the Stats page renders from. */
function lowerIsBetter(gameId: string): boolean {
  const g = LEADERBOARDS.find((x) => x.gameId === gameId);
  const board = g?.boards.find((b) => b.mode === 'daily') ?? g?.boards.find((b) => b.mode === 'endless');
  return board?.ascending ?? false;
}

/**
 * Daily retry support: the daily slot is unique per player per day, so a
 * second run of the same daily 23505s. Instead of dropping it, keep the
 * PLAYER'S BEST — overwrite the existing row when the retry scored better.
 * No XP is awarded on the update path (retries can't farm XP).
 */
async function improveDailyRow(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  row: StoredResult,
): Promise<void> {
  // Best-effort only — any failure here still leaves the result marked
  // synced (the official first run already exists server-side).
  try {
    const { data, error } = await supabase
      .from('game_results')
      .select('id, score')
      .eq('user_id', userId)
      .eq('game_id', row.gameId)
      .eq('mode', 'daily')
      .eq('date_key', row.dateKey)
      .maybeSingle();
    if (error || !data) return;
    const better = lowerIsBetter(row.gameId) ? row.score < data.score : row.score > data.score;
    if (!better) return;
    const { error: upErr } = await supabase
      .from('game_results')
      .update({ score: row.score, stats: row.stats, move_log: row.moveLog, completed_at: row.completedAt })
      .eq('id', data.id);
    if (upErr) console.error('[arcade] failed to improve daily result', row.id, upErr);
  } catch (e) {
    console.error('[arcade] daily improve attempt failed', row.id, e);
  }
}

/**
 * Award XP for a freshly-synced result — best-effort, never blocks marking
 * the result synced. Only called on a genuine first insert, never on a
 * 23505 (another device already claimed this daily slot first, so that
 * device's own sync already awarded the XP for it).
 */
async function awardXp(userId: string, row: StoredResult): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from('xp_ledger').insert({
    user_id: userId,
    delta: xpForResult(row.mode, row.score),
    reason: `${row.gameId}:${row.mode}`,
    game_id: row.gameId,
  });
  if (error) console.error('[arcade] failed to award xp', row.id, error);
}

/**
 * Push every unsynced local result to Supabase. The client-generated UUID
 * primary key makes this idempotent — a retried upsert after a flaky
 * connection is a no-op, never a duplicate row. A daily-uniqueness conflict
 * (this user already has an official result for that day, from another
 * device) counts as synced too: first write wins, nothing left to retry,
 * and the player still sees their own local completion.
 */
export async function flushOutbox(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const supabase = getSupabase();
  if (!supabase) return; // not configured yet — results stay queued locally

  const unsynced = await getUnsyncedResults();
  if (unsynced.length === 0) return;

  // Every row needs the signed-in user's id (RLS requires auth.uid() =
  // user_id) and a display name (denormalized per-row, see the schema
  // design). Resolved once per flush, not per row.
  const user = await currentUser();
  if (!user) return; // not signed in yet — nothing to attribute rows to
  const displayName = (await getDisplayName()) ?? 'Puzzler';

  for (const row of unsynced) {
    const { error } = await supabase
      .from('game_results')
      .upsert(toRow(row, user.id, displayName), { onConflict: 'id' });
    if (!error || error.code === UNIQUE_VIOLATION) {
      // A daily conflict may be a RETRY of today's puzzle — keep the best.
      if (error && row.mode === 'daily' && row.dateKey) {
        await improveDailyRow(supabase, user.id, row);
      }
      await putResult({ ...row, syncedAt: new Date().toISOString() });
      if (!error) void awardXp(user.id, row);
    } else {
      console.error('[arcade] failed to sync result', row.id, error);
    }
  }
}

/** Wire the standard connectivity/visibility sync triggers. Call once, e.g.
 *  from the Brain Arcade tab's mount effect. Returns a cleanup function. */
export function startAutoSync(): () => void {
  const onOnline = () => void flushOutbox();
  const onVisible = () => {
    if (document.visibilityState === 'visible') void flushOutbox();
  };
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

export { getAllResults };
