import { dailyRng } from '../../arcade/dailySeed';
import { getSupabase } from '../../arcade/supabase';
import { pickAnswer } from './words';

let cache: { dateKey: string; answer: string } | null = null;

/**
 * Today's secret answer, via the server-gated get_daily_word() RPC (see the
 * SQL bundle — it always returns the DB server's own current_date word,
 * never accepts a client-supplied date, so there's no spoofed-date way to
 * see a future day's answer). Falls back to a local deterministic pick if
 * Brain Arcade isn't configured or the RPC/row is missing — a documented
 * degraded mode (not the same word for everyone during an outage), not a
 * silent failure.
 */
export async function fetchDailyAnswer(dateKey: string): Promise<string> {
  if (cache && cache.dateKey === dateKey) return cache.answer;
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase.rpc('get_daily_word');
    if (!error && typeof data === 'string' && data.length === 5) {
      cache = { dateKey, answer: data.toLowerCase() };
      return cache.answer;
    }
    if (error) console.error('[wordguess] failed to fetch daily word, using local fallback', error);
  }
  const answer = pickAnswer(dailyRng('wordguess', dateKey, 'fallback'));
  cache = { dateKey, answer };
  return answer;
}

export function resetDailyAnswerCacheForTests(): void {
  cache = null;
}
