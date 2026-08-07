import { useEffect, useState } from 'react';
import { ensureSignedIn, getDisplayName, setDisplayName, signOut } from '../arcade/auth';
import { getUnsyncedResults } from '../arcade/storage/db';
import { flushOutbox } from '../arcade/storage/outbox';
import { isArcadeConfigured } from '../arcade/supabase';
import EmailAuthForm from '../arcade/ui/EmailAuthForm';
import VolumeControl from '../components/VolumeControl';
import { IconMoon, IconSun, IconUser } from '../components/icons';
import { setMode, useMode } from '../mode';

/**
 * The Settings wing: who you are and how the app behaves — display name and
 * account, sound, appearance, sync. Play history and leaderboards live on
 * the Stats wing (Profile.tsx) instead.
 */
export default function Settings() {
  const configured = isArcadeConfigured();
  const mode = useMode();
  const [name, setName] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [unsynced, setUnsynced] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getUnsyncedResults().then((r) => !cancelled && setUnsynced(r.length));
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
  }, [configured]);

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

  async function handleLogout() {
    setBusy(true);
    await signOut();
    setBusy(false);
    window.location.reload();
  }

  async function handleSync() {
    setSyncing(true);
    await flushOutbox();
    setUnsynced((await getUnsyncedResults()).length);
    setSyncing(false);
  }

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

      <section className="profile-card">
        <h3 className="profile-heading">Sound</h3>
        <VolumeControl />
        <p className="hint mode-hint">
          One volume for effects and the background music — mute silences both.
        </p>
      </section>

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
            {unsynced
              ? `${unsynced} result${unsynced === 1 ? '' : 's'} waiting to sync.`
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
          <EmailAuthForm />
        </section>
      )}

      {status && <p className="hint profile-status">{status}</p>}
    </div>
  );
}
