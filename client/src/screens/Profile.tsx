import { useCallback, useEffect, useState } from 'react';
import { ensureSignedIn, getDisplayName, linkGoogle, setDisplayName, signOut } from '../arcade/auth';
import { dateKeyUTC } from '../arcade/dailySeed';
import { EMPTY_STREAK, nextStreakState, xpForResult, xpProgress, type StreakState } from '../arcade/stats';
import { getUnsyncedResults } from '../arcade/storage/db';
import { flushOutbox, getAllResults } from '../arcade/storage/outbox';
import { isArcadeConfigured } from '../arcade/supabase';
import EmailAuthForm from '../arcade/ui/EmailAuthForm';
import type { StoredResult } from '../arcade/types';
import { GAMES, dailyGames } from '../games/catalog';
import { IconMoon, IconSun, IconUser } from '../components/icons';
import { setMode, useMode } from '../mode';

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

export default function Profile() {
  const configured = isArcadeConfigured();
  const mode = useMode();
  const [name, setName] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [data, setData] = useState<ProfileData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
        setSignedIn(true);
        setAnonymous(u.is_anonymous ?? true);
        const n = await getDisplayName();
        if (!cancelled) setName(n);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [configured, refresh]);

  async function saveName() {
    setBusy(true);
    setStatus(null);
    const r = await setDisplayName(draft);
    setBusy(false);
    if (r.ok) {
      setName(draft.trim().slice(0, 24));
      setEditing(false);
      setStatus('Name updated — new scores use it right away.');
    } else {
      setStatus(r.error);
    }
  }

  async function handleGoogle() {
    setBusy(true);
    setStatus(null);
    const r = await linkGoogle();
    setBusy(false);
    if (!r.ok) setStatus(r.error);
  }

  async function handleLogout() {
    setBusy(true);
    await signOut();
    setBusy(false);
    window.location.reload();
  }

  async function handleSync() {
    setSyncing(true);
    await flushOutbox();
    await refresh();
    setSyncing(false);
  }

  // xpForLevel(1) is 100, so a brand-new profile sits "below" level 1's
  // floor — clamp the display so 0 XP reads as an empty level-1 bar.
  const xpRaw = data ? xpProgress(data.xpTotal) : null;
  const xp = xpRaw ? { ...xpRaw, into: Math.max(0, Math.min(xpRaw.span, xpRaw.into)) } : null;
  const dailies = dailyGames().length;

  return (
    <div className="profile">
      <section className="profile-card profile-identity">
        <div className="profile-avatar">
          <IconUser />
        </div>
        <div className="profile-who">
          {editing ? (
            <div className="profile-edit-row">
              <input
                value={draft}
                maxLength={24}
                placeholder="Display name"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void saveName()}
              />
              <button className="btn btn-primary" disabled={busy} onClick={() => void saveName()}>
                Save
              </button>
              <button className="btn" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <h2 className="profile-name">
              {name ?? 'Puzzler'}
              {configured && signedIn && (
                <button
                  className="btn profile-rename"
                  onClick={() => {
                    setDraft(name ?? '');
                    setEditing(true);
                  }}
                >
                  Rename
                </button>
              )}
            </h2>
          )}
          <p className="hint profile-standing">
            {!configured
              ? 'Playing locally — scores stay on this device.'
              : !signedIn
                ? 'Signing in…'
                : anonymous
                  ? 'Guest profile on this device — link an account to keep it forever.'
                  : 'Account linked — your progress follows you to any device.'}
          </p>
          {configured && signedIn && !anonymous && (
            <button className="btn profile-logout" disabled={busy} onClick={() => void handleLogout()}>
              Log Out
            </button>
          )}
        </div>
      </section>

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
            {data.games.map((g) => (
              <li key={g.id} className="profile-game-row">
                <span className="profile-game-name">{g.name}</span>
                <span className="hint">
                  {g.plays} {g.plays === 1 ? 'play' : 'plays'}
                  {g.streak > 1 ? ` · ${g.streak}-day streak` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.totalPlays === 0 && (
        <section className="profile-card">
          <p className="hint">No finished games yet — the Zen and Daily tabs are waiting.</p>
        </section>
      )}

      <section className="profile-card">
        <h3 className="profile-heading">Appearance</h3>
        <div className="mode-toggle">
          <button
            className={`btn mode-choice${mode === 'light' ? ' active' : ''}`}
            onClick={() => setMode('light')}
          >
            <span className="mode-choice-icon">
              <IconSun />
            </span>
            Cozy Cabin
          </button>
          <button
            className={`btn mode-choice${mode === 'dark' ? ' active' : ''}`}
            onClick={() => setMode('dark')}
          >
            <span className="mode-choice-icon">
              <IconMoon />
            </span>
            Harbor Haze
          </button>
        </div>
        <p className="hint mode-hint">
          {mode === 'light' ? 'Warm woods and cream.' : 'Soft harbor fog for late nights.'}
        </p>
      </section>

      {configured && (
        <section className="profile-card">
          <h3 className="profile-heading">Sync</h3>
          <p className="hint">
            {data?.unsynced
              ? `${data.unsynced} result${data.unsynced === 1 ? '' : 's'} waiting to sync.`
              : 'Everything is synced to the cloud.'}
          </p>
          <button className="btn" disabled={syncing} onClick={() => void handleSync()}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </section>
      )}

      {configured && signedIn && anonymous && (
        <section className="profile-card">
          <h3 className="profile-heading">Keep this profile</h3>
          <p className="hint">Sign into an account so your scores, streaks, and XP are never lost.</p>
          <button className="btn btn-primary" disabled={busy} onClick={() => void handleGoogle()}>
            Continue with Google
          </button>
          <div className="profile-or">or</div>
          <EmailAuthForm />
        </section>
      )}

      {status && <p className="hint profile-status">{status}</p>}
    </div>
  );
}
