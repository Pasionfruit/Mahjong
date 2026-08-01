import { useEffect, useRef, useState, type ComponentType } from 'react';
import type { GameId } from '@shared/games';
import { createParty, joinParty } from '../socket';
import { loadNickname } from '../session';
import { useStore } from '../store';
import { CATEGORY_LABELS, CATEGORY_ORDER, GAMES, dailyGames, type GameEntry } from '../games/catalog';
import { useDailyProgress } from '../arcade/useDailyProgress';
import {
  IconCalendarCheck,
  IconController,
  IconLink,
  IconPartyPopper,
  IconUser,
  IconZenLotus,
} from '../components/icons';
import { isDesktop } from '../device';
import Profile from './Profile';

type Wing = 'connect' | 'party' | 'daily' | 'zen' | 'profile';

const WING_TABS: { wing: Wing; label: string; Icon: ComponentType }[] = [
  { wing: 'connect', label: 'Connect', Icon: IconLink },
  { wing: 'party', label: 'Party', Icon: IconPartyPopper },
  { wing: 'daily', label: 'Daily', Icon: IconCalendarCheck },
  { wing: 'zen', label: 'Zen', Icon: IconZenLotus },
  { wing: 'profile', label: 'Profile', Icon: IconUser },
];

export default function Home() {
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wing, setWing] = useState<Wing>('connect');
  const notice = useStore((s) => s.notice);
  const dailyDone = useDailyProgress();
  const nickRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number>(0);
  const wantNickFocus = useRef(false);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // A nickname complaint from another wing lands after Connect mounts.
  useEffect(() => {
    if (wing === 'connect' && wantNickFocus.current) {
      wantNickFocus.current = false;
      nickRef.current?.focus();
      nickRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [wing]);

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
    if (game.local) {
      // Device-local game: no nickname, no room — straight to the table.
      useStore.getState().setLocalGame(game.id);
      return;
    }
    if (!name) {
      // Nickname lives on the Connect page — send them there, field focused.
      wantNickFocus.current = true;
      setWing('connect');
      return complain('Pick a nickname before you play!', true);
    }
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

  function gameCard(g: GameEntry) {
    return (
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
    );
  }

  const wingGames = GAMES.filter((g) => (wing === 'party' ? g.competitive : !g.competitive));
  const sections = CATEGORY_ORDER.map((cat) => ({
    cat,
    games: wingGames.filter((g) => g.category === cat),
  })).filter((s) => s.games.length > 0);

  const dailies = dailyGames();
  const doneCount = dailies.filter((g) => dailyDone.has(g.id)).length;

  return (
    <div className="home">
      <div className="home-inner">
        <header className="home-head">
          <h1 className="home-title">
            <span className="landing-glyph">
              <IconController />
            </span>{' '}
            LocalRot
          </h1>
          <p className="home-sub">Party with friends, zen out solo, or clear today’s dailies.</p>
        </header>

        {notice && <div className="notice">{notice}</div>}

        {toast && (
          <div className="toast" role="alert">
            ⚠️ {toast}
          </div>
        )}

        <div className="home-tabs">
          {WING_TABS.map(({ wing: w, label, Icon }) => (
            <button
              key={w}
              className={`home-tab${wing === w ? ' active' : ''}`}
              onClick={() => setWing(w)}
            >
              <span className="home-tab-icon">
                <Icon />
              </span>
              <span className="home-tab-label">{label}</span>
              {w === 'daily' && (
                <span className={`daily-tab-count${doneCount === dailies.length ? ' complete' : ''}`}>
                  {doneCount}/{dailies.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {wing === 'connect' ? (
          <div className="connect-wing">
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

            <div className="home-divider">or</div>
            <p className="hint connect-hint">
              Hosting instead? Head to the Party tab, pick a game, and share the 4-letter code
              with your friends.
            </p>
            <div className="connect-host-row">
              <button className="btn btn-primary" onClick={() => setWing('party')}>
                Browse party games
              </button>
            </div>
          </div>
        ) : wing === 'profile' ? (
          <Profile />
        ) : wing === 'daily' ? (
          <section className="category-section">
            <div className="daily-summary">
              <h2 className="category-heading">Today’s Challenges</h2>
              <p className="hint daily-summary-hint">
                {doneCount === dailies.length
                  ? '🏆 All dailies done — see you tomorrow!'
                  : `${doneCount} of ${dailies.length} done today — same puzzle for everyone, once a day.`}
              </p>
              <div className="daily-progress">
                <div
                  className="daily-progress-fill"
                  style={{ width: `${dailies.length ? (doneCount / dailies.length) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="game-grid">
              {dailies.map((g) => (
                <div key={g.id} className={`game-card daily-card${dailyDone.has(g.id) ? ' daily-card-done' : ''}`}>
                  <div className="game-card-icon">
                    <g.Icon />
                  </div>
                  <div className="game-card-title">
                    {g.dailyLabel ?? g.name}
                    {dailyDone.has(g.id) && <span className="daily-done-badge">✓ Done</span>}
                  </div>
                  <div className="game-card-tagline">{g.tagline}</div>
                  <button
                    className={`btn game-card-btn${dailyDone.has(g.id) ? '' : ' btn-primary'}`}
                    disabled={busy}
                    onClick={() => create(g)}
                  >
                    {dailyDone.has(g.id) ? 'Play again' : 'Play today’s'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : sections.length === 0 ? (
          <p className="home-empty hint">New games are on their way — check back soon!</p>
        ) : (
          sections.map(({ cat, games }) => (
            <section key={cat} className="category-section">
              <h2 className="category-heading">{CATEGORY_LABELS[cat]}</h2>
              <div className="game-grid">{games.map(gameCard)}</div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
