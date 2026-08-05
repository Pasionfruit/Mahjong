import { currentUser } from './auth';
import { getSupabase } from './supabase';

export interface LeaderboardRow {
  userId: string;
  displayName: string;
  score: number;
  rank: number;
}

type RpcRow = { user_id: string; display_name: string; score: number; rnk: number };

/** Today's (UTC) top scores for a daily-mode game, via the SECURITY DEFINER
 *  get_daily_leaderboard RPC — reads past RLS, returns only leaderboard-safe
 *  columns. Returns [] if not configured or on any error (leaderboards are
 *  a nice-to-have, never worth surfacing as a hard failure to the player). */
export async function fetchDailyLeaderboard(
  gameId: string,
  dateKey: string,
  ascending: boolean,
  limit = 10,
): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_daily_leaderboard', {
    p_game_id: gameId,
    p_date: dateKey,
    p_limit: limit,
    p_ascending: ascending,
  });
  if (error) {
    console.error('[arcade] failed to load daily leaderboard', error);
    return [];
  }
  return ((data as RpcRow[] | null) ?? []).map(toRow);
}

/** All-time best score per player for a game's endless mode, via the
 *  get_alltime_leaderboard RPC. Same failure semantics as above. */
export async function fetchAlltimeLeaderboard(
  gameId: string,
  ascending: boolean,
  limit = 10,
): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_alltime_leaderboard', {
    p_game_id: gameId,
    p_limit: limit,
    p_ascending: ascending,
  });
  if (error) {
    console.error('[arcade] failed to load all-time leaderboard', error);
    return [];
  }
  return ((data as RpcRow[] | null) ?? []).map(toRow);
}

/** Top current daily streaks for a game, via get_streak_leaderboard. Score
 *  here is the streak length (always descending — a longer streak always
 *  wins), so it shares LeaderboardRow rather than needing its own shape. */
export async function fetchStreakLeaderboard(gameId: string, limit = 10): Promise<LeaderboardRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_streak_leaderboard', {
    p_game_id: gameId,
    p_limit: limit,
  });
  if (error) {
    console.error('[arcade] failed to load streak leaderboard', error);
    return [];
  }
  return ((data as RpcRow[] | null) ?? []).map(toRow);
}

export interface MyStreak {
  gameId: string;
  streak: number;
  /** UTC date key of the most recent day in the run. */
  lastDay: string;
}

/**
 * The signed-in player's current streak in every game, server-derived from
 * game_results (so it follows the account across devices, unlike the local
 * IndexedDB tally). Returns [] when unconfigured, signed out, or on error —
 * callers fall back to the local count.
 */
export async function fetchMyStreaks(): Promise<MyStreak[]> {
  const supabase = getSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('my_streaks');
  if (error) {
    console.error('[arcade] failed to load my streaks', error);
    return [];
  }
  return ((data as { game_id: string; streak: number; last_day: string }[] | null) ?? []).map((r) => ({
    gameId: r.game_id,
    streak: Number(r.streak),
    lastDay: r.last_day,
  }));
}

function toRow(r: RpcRow): LeaderboardRow {
  return { userId: r.user_id, displayName: r.display_name, score: r.score, rank: Number(r.rnk) };
}

/** The signed-in user's own id, for highlighting their row in the panel. */
export async function currentUserId(): Promise<string | null> {
  const u = await currentUser();
  return u?.id ?? null;
}
