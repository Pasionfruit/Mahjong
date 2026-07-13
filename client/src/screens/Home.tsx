import { useEffect, useRef, useState } from 'react';
import type { GameId } from '@shared/games';
import { createParty, joinParty } from '../socket';
import { loadNickname } from '../session';
import { useStore } from '../store';
import { GAMES, type GameEntry } from '../games/catalog';
import { IconController } from '../components/icons';
import { isDesktop } from '../device';

export default function Home() {
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const notice = useStore((s) => s.notice);
  const nickRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const name = nickname.trim();
  const desktop = isDesktop();

  /** Pop an error toast; nickname problems also focus the field. */
  function complain(msg: string, focusNick = false) {
    setToast(msg);
    if (focusNick) {
      nickRef.current?.focus();
      nickRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3000);
  }

  async function create(game: GameEntry) {
    if (!game.available) return;
    if (game.desktopOnly && !desktop) {
      return complain(`${game.name} needs a keyboard — play from a desktop.`);
    }
    if (!name) return complain('Pick a nickname before you play!', true);
    setBusy(true);
    const r = await createParty(name, game.id as GameId);
    setBusy(false);
    if (!r.ok) complain(r.error);
  }

  async function join() {
    if (!name) return complain('Pick a nickname before you join!', true);
    if (!code.trim()) return complain('Enter your friend’s table code.');
    setBusy(true);
    const r = await joinParty(code, name);
    setBusy(false);
    if (!r.ok) complain(r.error);
  }

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <h1 className="home-title">
            <span className="landing-glyph">
              <IconController />
            </span>{' '}
            GameNight
          </h1>
          <p className="home-sub">Pick a game, start a table, and share the code with friends.</p>
        </header>

        {notice && <div className="notice">{notice}</div>}

        {toast && (
          <div className="toast" role="alert">
            ⚠️ {toast}
          </div>
        )}

        <label className="field home-nick">
          <span>Nickname</span>
          <input
            ref={nickRef}
            value={nickname}
            maxLength={16}
            placeholder="Your name at the table"
            onChange={(e) => setNickname(e.target.value)}
          />
        </label>

        <div className="join-panel">
          <span className="join-label">Joining a friend? Enter their table code.</span>
          <div className="join-row">
            <input
              className="code-input"
              value={code}
              maxLength={4}
              placeholder="CODE"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && join()}
            />
            <button className="btn" disabled={busy} onClick={join}>
              Join
            </button>
          </div>
        </div>

        <div className="home-divider">or start a new table</div>

        <div className="game-grid">
          {GAMES.map((g) => (
            <div key={g.id} className={`game-card${g.available ? '' : ' soon'}`}>
              <div className="game-card-icon">
                <g.Icon />
              </div>
              <div className="game-card-title">
                {g.name}
                {!g.available && <span className="soon-badge">Soon</span>}
              </div>
              <div className="game-card-tagline">{g.tagline}</div>
              <div className="game-card-players">{g.players}</div>
              <button
                className="btn btn-primary game-card-btn"
                disabled={busy || !g.available || (g.desktopOnly && !desktop)}
                onClick={() => create(g)}
              >
                {!g.available ? 'Coming soon' : g.desktopOnly && !desktop ? 'Desktop only' : 'Play'}
              </button>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
