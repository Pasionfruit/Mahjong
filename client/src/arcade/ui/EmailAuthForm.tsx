import { useEffect, useState } from 'react';
import {
  consumeOAuthError,
  linkGoogle,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
} from '../auth';

type Tab = 'signup' | 'login';

/**
 * Shared by AuthWidget, Profile and the leaderboard prompt — the whole
 * account surface, Google and email, in one place.
 *
 * The two tabs are genuinely different operations, not styling:
 *  • Create Account upgrades THIS session in place (same auth.uid(), your
 *    existing progress carries over) — linkIdentity / updateUser.
 *  • Log In signs into a *different*, already-existing account, so it
 *    reloads on success: every screen's cached auth state needs a clean
 *    slate and there's no app-wide reactive auth store to push through.
 *
 * Google needs both for the same reason email does: once a Google account
 * is linked to one profile, linking it again from a second device fails,
 * so a returning player has to sign in rather than link.
 */
export default function EmailAuthForm() {
  const [tab, setTab] = useState<Tab>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // A failed Google round trip returns here with the reason in the URL.
  // Surface it on mount and flip to Log In when that's the way forward.
  useEffect(() => {
    const err = consumeOAuthError();
    if (!err) return;
    setStatus(err);
    if (/log in/i.test(err)) setTab('login');
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    setStatus(null);
  }

  async function google() {
    setBusy(true);
    setStatus(null);
    const r = tab === 'signup' ? await linkGoogle() : await signInWithGoogle();
    setBusy(false);
    if (!r.ok) setStatus(r.error);
    // On success the browser is already navigating to Google.
  }

  async function submit() {
    if (!email.trim()) return setStatus('Enter an email address.');
    if (!password) return setStatus('Enter a password.');
    setBusy(true);
    setStatus(null);
    const result =
      tab === 'signup' ? await signUpWithPassword(email.trim(), password) : await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (!result.ok) return setStatus(result.error);
    if (tab === 'signup') {
      setStatus('Check your email to confirm — then this email and password sign you in anywhere.');
    } else {
      window.location.reload();
    }
  }

  return (
    <div className="email-auth">
      <div className="email-auth-tabs">
        <button
          className={`email-auth-tab${tab === 'signup' ? ' active' : ''}`}
          onClick={() => switchTab('signup')}
        >
          Create Account
        </button>
        <button className={`email-auth-tab${tab === 'login' ? ' active' : ''}`} onClick={() => switchTab('login')}>
          Log In
        </button>
      </div>

      <button className="btn btn-primary auth-panel-google" disabled={busy} onClick={() => void google()}>
        {tab === 'signup' ? 'Continue with Google' : 'Sign in with Google'}
      </button>
      <div className="auth-panel-divider">or</div>

      <label className="field">
        <span>Email</span>
        <input type="email" value={email} placeholder="you@example.com" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          value={password}
          placeholder={tab === 'signup' ? 'At least 6 characters' : 'Your password'}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
        />
      </label>
      <button className="btn btn-primary email-auth-submit" disabled={busy} onClick={() => void submit()}>
        {tab === 'signup' ? 'Create Account' : 'Log In'}
      </button>
      {status && <p className="hint email-auth-status">{status}</p>}
    </div>
  );
}
