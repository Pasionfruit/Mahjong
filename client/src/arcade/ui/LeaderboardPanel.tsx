import { useEffect, useState } from 'react';
import { currentUserId, fetchAlltimeLeaderboard, fetchDailyLeaderboard, type LeaderboardRow } from '../leaderboard';

interface LeaderboardPanelProps {
  gameId: string;
  mode: 'daily' | 'endless';
  dateKey: string;
  ascending: boolean;
  formatScore?: (score: number) => string;
  /** Bump to force a refetch after a new result syncs. */
  refreshKey?: number;
}

/** Shared top-10 leaderboard, reused by every Brain Arcade game's result
 *  screen — daily (today only) or all-time-best-per-player (endless). */
export default function LeaderboardPanel({
  gameId,
  mode,
  dateKey,
  ascending,
  formatScore = String,
  refreshKey,
}: LeaderboardPanelProps) {
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void currentUserId().then((id) => !cancelled && setMyId(id));
    const load = mode === 'daily' ? fetchDailyLeaderboard(gameId, dateKey, ascending) : fetchAlltimeLeaderboard(gameId, ascending);
    void load.then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [gameId, mode, dateKey, ascending, refreshKey]);

  if (rows === null) return <p className="hint leaderboard-loading">Loading leaderboard…</p>;
  if (rows.length === 0) return <p className="hint leaderboard-empty">No scores yet — be the first!</p>;

  return (
    <ol className="leaderboard">
      {rows.map((r) => (
        <li key={r.userId} className={`leaderboard-row${r.userId === myId ? ' leaderboard-row-me' : ''}`}>
          <span className="leaderboard-rank">#{r.rank}</span>
          <span className="leaderboard-name">{r.displayName}</span>
          <span className="leaderboard-score">{formatScore(r.score)}</span>
        </li>
      ))}
    </ol>
  );
}
