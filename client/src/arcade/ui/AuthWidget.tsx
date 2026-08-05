import { useEffect, useRef, useState } from 'react';
import { ensureSignedIn, getDisplayName, linkGoogle, signOut } from '../auth';
import { isArcadeConfigured } from '../supabase';
import EmailAuthForm from './EmailAuthForm';

/**
 * Top-right "lock in your progress" widget, dropped into every Brain
 * Arcade game screen. Anonymous sessions already work fully (see
 * ensureSignedIn) — this is purely the upgrade path (design doc B7:
 * contextual, never a gate), so it renders nothing until Brain Arcade is
 * configured and a session exists.
 */
export default function AuthWidget() {
  const [open, setOpen] = useState(false);
  const [anonymous, setAnonymous] = useState<boolean | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isArcadeConfigured()) return;
    let cancelled = false;
    // ensureSignedIn (not the lighter currentUser) guarantees a resolved
    // session — a game screen mounting fresh may not have finished its own
    // anonymous sign-in yet, and currentUser() would resolve to null in
    // that window, which is indistinguishable from "still loading" if we
    // used it here too.
    void ensureSignedIn().then((u) => {
      if (cancelled) return;
      setAnonymous(u?.is_anonymous ?? true);
      if (u && !u.is_anonymous) void getDisplayName().then((n) => !cancelled && setName(n));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (!isArcadeConfigured() || anonymous === null) return null;

  async function handleGoogle() {
    setBusy(true);
    setStatus(null);
    const r = await linkGoogle();
    setBusy(false);
    if (!r.ok) setStatus(r.error);
    // On success the browser is already navigating to Google — nothing else to do.
  }

  async function handleLogout() {
    setBusy(true);
    await signOut();
    setBusy(false);
    window.location.reload();
  }

  return (
    <div className="auth-widget" ref={panelRef}>
      {anonymous ? (
        <button className="btn auth-widget-btn" onClick={() => setOpen((o) => !o)}>
          Log In
        </button>
      ) : (
        <button className="btn auth-widget-btn auth-widget-linked" onClick={() => setOpen((o) => !o)}>
          👤 {name ?? 'Puzzler'}
        </button>
      )}
      {open && (
        <div className="auth-panel">
          <p className="hint">
            {anonymous
              ? "Lock in your progress so it's never lost — sign into an account."
              : 'Link another way to sign in on a new device, or log out.'}
          </p>
          <button className="btn btn-primary auth-panel-google" disabled={busy} onClick={() => void handleGoogle()}>
            Continue with Google
          </button>
          <div className="auth-panel-divider">or</div>
          <EmailAuthForm />
          {status && <p className="hint auth-panel-status">{status}</p>}
          {!anonymous && (
            <button className="btn auth-panel-logout" disabled={busy} onClick={() => void handleLogout()}>
              Log Out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
