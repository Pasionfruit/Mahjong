import { useCallback, useEffect, useState } from 'react';
import { ensureSignedIn } from '../arcade/auth';
import { dateKeyUTC } from '../arcade/dailySeed';
import { fetchMyStreaks } from '../arcade/leaderboard';
import { EMPTY_STREAK, nextStreakState, xpForResult, xpProgress, type StreakState } from '../arcade/stats';
import { getUnsyncedResults } from '../arcade/storage/db';
import { getAllResults } from '../arcade/storage/outbox';
import { isArcadeConfigured } from '../arcade/supabase';
import { LEADERBOARDS } from '../arcade/leaderboardCatalog';
import LeaderboardPanel from '../arcade/ui/LeaderboardPanel';
import type { StoredResult } from '../arcade/types';
import { GAMES, dailyGames } from '../games/catalog';

interface GameLine {
  id: string;
  name: string;
  plays: number;
  streak: number;
}

interface ProfileData {
  xpTotal: number;
  totalPlays: number;
  dailiesToday: number;
  games: GameLine[];
  unsynced: number;
}

/** Fold the local results history into everything the profile shows. */
function summarize(results: StoredResult[], unsynced: number): ProfileData {
  const today = dateKeyUTC();
  let xpTotal = 0;
  const plays = new Map<string, number>();
  const dailyKeys = new Map<string, string[]>();
  const doneToday = new Set<string>();

  for (const r of results) {
    xpTotal += xpForResult(r.mode, r.score);
    plays.set(r.gameId, (plays.get(r.gameId) ?? 0) + 1);
    if (r.mode === 'daily' && r.dateKey) {
      if (!dailyKeys.has(r.gameId)) dailyKeys.set(r.gameId, []);
      dailyKeys.get(r.gameId)!.push(r.dateKey);
      if (r.dateKey === today) doneToday.add(r.gameId);
    }
  }

  const streakOf = (gameId: string): number => {
    const keys = (dailyKeys.get(gameId) ?? []).sort();
    let s: StreakState = EMPTY_STREAK;
    for (const k of keys) s = nextStreakState(s, k);
    // A streak is only alive if it reaches today or yesterday-ish; the fold
    // already resets on gaps, so just report it.
    return s.streak;
  };

  const games: GameLine[] = GAMES.filter((g) => !g.competitive && g.available)
    .map((g) => ({ id: g.id, name: g.name, plays: plays.get(g.id) ?? 0, streak: g.hasDaily ? streakOf(g.id) : 0 }))
    .filter((g) => g.plays > 0)
    .sort((a, b) => b.plays - a.plays);

  return {
    xpTotal,
    totalPlays: results.length,
    dailiesToday: dailyGames().filter((g) => doneToday.has(g.id)).length,
    games,
    unsynced,
  };
}

/** The Stats wing: XP, play history, streaks, and every game's
 *  leaderboards. Identity/appearance/sync moved to the Settings wing. */
export default function Profile() {
  const configured = isArcadeConfigured();
  const [data, setData] = useState<ProfileData | null>(null);
  /** gameId → current streak, from the server (my_streaks RPC). Empty when
   *  signed out/unconfigured, in which case the local fold is used. */
  const [serverStreaks, setServerStreaks] = useState<Map<string, number>>(new Map());
  /** Which game's leaderboards are open in the Leaderboards card. */
  const [boardGame, setBoardGame] = useState(LEADERBOARDS[0]!.gameId);

  const refresh = useCallback(async () => {
    const [results, unsynced] = await Promise.all([getAllResults(), getUnsyncedResults()]);
    setData(summarize(results, unsynced.length));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void refresh();
    if (configured) {
      void ensureSignedIn().then(async (u) => {
        if (cancelled || !u) return;
        // Server-derived streaks follow the account across devices; the
        // local fold below is only a fallback for offline/unconfigured.
        const mine = await fetchMyStreaks();
        if (!cancelled) setServerStreaks(new Map(mine.map((s) => [s.gameId, s.streak])));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [configured, refresh]);

  // xpForLevel(1) is 100, so a brand-new profile sits "below" level 1's
  // floor — clamp the display so 0 XP reads as an empty level-1 bar.
  const xpRaw = data ? xpProgress(data.xpTotal) : null;
  const xp = xpRaw ? { ...xpRaw, into: Math.max(0, Math.min(xpRaw.span, xpRaw.into)) } : null;
  const dailies = dailyGames().length;

  return (
    <div className="profile">
      {xp && data && (
        <section className="profile-card">
          <div className="profile-level-row">
            <span className="profile-level">Level {xp.level}</span>
            <span className="hint">
              {xp.into} / {xp.span} XP
            </span>
          </div>
          <div className="daily-progress">
            <div className="daily-progress-fill" style={{ width: `${(xp.into / xp.span) * 100}%` }} />
          </div>
          <div className="profile-stats-row">
            <div className="profile-stat">
              <span className="profile-stat-num">{data.totalPlays}</span>
              <span className="hint">games finished</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-num">{data.xpTotal}</span>
              <span className="hint">total XP</span>
            </div>
            <div className="profile-stat">
              <span className="profile-stat-num">
                {data.dailiesToday}/{dailies}
              </span>
              <span className="hint">dailies today</span>
            </div>
          </div>
        </section>
      )}

      {data && data.games.length > 0 && (
        <section className="profile-card">
          <h3 className="profile-heading">Your games</h3>
          <ul className="profile-games">
            {data.games.map((g) => {
              // Server value wins when we have one — it's the cross-device
              // truth; the local fold only sees this device's history.
              const streak = serverStreaks.get(g.id) ?? g.streak;
              return (
                <li key={g.id} className="profile-game-row">
                  <span className="profile-game-name">{g.name}</span>
                  <span className="hint">
                    {g.plays} {g.plays === 1 ? 'play' : 'plays'}
                    {streak > 0 && (
                      <span className="profile-streak" title="Current daily streak">
                        {' '}
                        · 🔥 {streak}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data && data.totalPlays === 0 && (
        <section className="profile-card">
          <p className="hint">No finished games yet — the Zen and Daily tabs are waiting.</p>
        </section>
      )}

      {configured && (
        <section className="profile-card">
          <h3 className="profile-heading">Leaderboards</h3>
          <select
            className="profile-board-select"
            value={boardGame}
            onChange={(e) => setBoardGame(e.target.value)}
          >
            {LEADERBOARDS.map((g) => (
              <option key={g.gameId} value={g.gameId}>
                {g.name}
              </option>
            ))}
          </select>
          {LEADERBOARDS.find((g) => g.gameId === boardGame)?.boards.map((b) => (
            <div key={b.mode} className="profile-board">
              <h4 className="profile-board-title">{b.label}</h4>
              <LeaderboardPanel
                gameId={boardGame}
                mode={b.mode}
                dateKey={dateKeyUTC()}
                ascending={b.ascending}
                formatScore={b.formatScore}
              />
            </div>
          ))}
        </section>
      )}

    </div>
  );
}
