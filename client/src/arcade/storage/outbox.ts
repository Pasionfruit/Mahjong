import type { StoredResult } from '../types';
import { currentUser, getDisplayName } from '../auth';
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
