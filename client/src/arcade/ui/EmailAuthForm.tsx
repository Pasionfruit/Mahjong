import { useState } from 'react';
import { signInWithPassword, signUpWithPassword } from '../auth';

type Tab = 'signup' | 'login';

/**
 * Shared by AuthWidget (popover) and Profile (full section) — the
 * non-Google account path. "Create Account" upgrades the current session
 * in place (same auth.uid(), existing progress carries over — same
 * principle as linkGoogle). "Log In" signs into a *different*, already-
 * existing account, so it reloads the page on success: every open
 * screen's cached signed-in/display-name state needs a clean slate, and
 * there's no app-wide reactive auth store to push the change through
 * otherwise.
 */
export default function EmailAuthForm() {
  const [tab, setTab] = useState<Tab>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function switchTab(next: Tab) {
    setTab(next);
    setStatus(null);
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
