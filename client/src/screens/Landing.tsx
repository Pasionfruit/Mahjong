import { useState } from 'react';
import { createParty, joinParty } from '../socket';
import { loadNickname } from '../session';
import { IconTile } from '../components/icons';
import { useStore } from '../store';

export default function Landing() {
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useStore((s) => s.notice);

  const name = nickname.trim();

  async function handleCreate() {
    if (!name) return setError('Enter a nickname first');
    setBusy(true);
    const r = await createParty(name);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  async function handleJoin() {
    if (!name) return setError('Enter a nickname first');
    if (!code.trim()) return setError('Enter a room code');
    setBusy(true);
    const r = await joinParty(code, name);
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <h1 className="landing-title">
          <span className="landing-glyph">
            <IconTile />
          </span>{' '}
          Mahjong Party
        </h1>
        <p className="landing-sub">Create a private table and share the code with friends.</p>

        {notice && <div className="notice">{notice}</div>}

        <label className="field">
          <span>Nickname</span>
          <input
            value={nickname}
            maxLength={16}
            placeholder="Your name at the table"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        <button className="btn btn-primary" disabled={busy} onClick={handleCreate}>
          Create party
        </button>

        <div className="divider">or join one</div>

        <div className="join-row">
          <input
            className="code-input"
            value={code}
            maxLength={4}
            placeholder="CODE"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button className="btn" disabled={busy} onClick={handleJoin}>
            Join
          </button>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
