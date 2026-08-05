import { useEffect, useState } from 'react';
import { ensureSignedIn, linkGoogle } from '../auth';
import {
  currentUserId,
  fetchAlltimeLeaderboard,
  fetchDailyLeaderboard,
  fetchStreakLeaderboard,
  type LeaderboardRow,
} from '../leaderboard';
import { isArcadeConfigured } from '../supabase';
import EmailAuthForm from './EmailAuthForm';

interface LeaderboardPanelProps {
  gameId: string;
  /** 'streak' ranks longest current daily streaks instead of scores; it
   *  ignores `dateKey`/`ascending`/`formatScore` (always longest-first,
   *  rendered as "N days"). */
  mode: 'daily' | 'endless' | 'streak';
  dateKey: string;
  ascending: boolean;
  formatScore?: (score: number) => string;
  /** Bump to force a refetch after a new result syncs. */
  refreshKey?: number;
}

/** An anonymous session's scores already sync under a random "Puzzler#"
 *  name — this is the contextual nudge (design doc B7: never a gate) to
 *  turn that into a name and account that stick around for good. Shown
 *  inline wherever a leaderboard is, since that's the moment "why should I
 *  sign in" has an obvious answer. */
function SignInToRank() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    const r = await linkGoogle();
    setBusy(false);
    if (!r.ok) setError(r.error);
    // On success the browser is already navigating to Google.
  }

  return (
    <div className="leaderboard-auth">
      {!open ? (
        <button className="btn btn-primary leaderboard-auth-btn" onClick={() => setOpen(true)}>
          🔒 Sign in to get on the leaderboard
        </button>
      ) : (
        <div className="leaderboard-auth-panel">
          <p className="hint">Sign in with Google or create a profile so your name and scores stick around.</p>
          <button className="btn btn-primary auth-panel-google" disabled={busy} onClick={() => void handleGoogle()}>
            Continue with Google
          </button>
          <div className="auth-panel-divider">or</div>
          <EmailAuthForm />
          {error && <p className="hint auth-panel-status">{error}</p>}
        </div>
      )}
    </div>
  );
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
  const [anonymous, setAnonymous] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    void currentUserId().then((id) => !cancelled && setMyId(id));
    const load =
      mode === 'streak'
        ? fetchStreakLeaderboard(gameId)
        : mode === 'daily'
          ? fetchDailyLeaderboard(gameId, dateKey, ascending)
          : fetchAlltimeLeaderboard(gameId, ascending);
    void load.then((r) => !cancelled && setRows(r));
    return () => {
      cancelled = true;
    };
  }, [gameId, mode, dateKey, ascending, refreshKey]);

  useEffect(() => {
    if (!isArcadeConfigured()) return;
    let cancelled = false;
    void ensureSignedIn().then((u) => !cancelled && setAnonymous(u?.is_anonymous ?? true));
    return () => {
      cancelled = true;
    };
  }, []);

  const cta = anonymous ? <SignInToRank /> : null;

  if (rows === null) {
    return (
      <>
        {cta}
        <p className="hint leaderboard-loading">Loading leaderboard…</p>
      </>
    );
  }
  if (rows.length === 0) {
    return (
      <>
        {cta}
        <p className="hint leaderboard-empty">
          {mode === 'streak' ? 'No streaks going yet — start one today!' : 'No scores yet — be the first!'}
        </p>
      </>
    );
  }

  const show = mode === 'streak' ? (n: number) => `🔥 ${n} day${n === 1 ? '' : 's'}` : formatScore;

  return (
    <>
      {cta}
      <ol className="leaderboard">
        {rows.map((r) => (
          <li key={r.userId} className={`leaderboard-row${r.userId === myId ? ' leaderboard-row-me' : ''}`}>
            <span className="leaderboard-rank">#{r.rank}</span>
            <span className="leaderboard-name">{r.displayName}</span>
            <span className="leaderboard-score">{show(r.score)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
