import { useEffect, useRef, useState } from 'react';
import type { GameId } from '@shared/games';
import { createParty, joinParty } from '../socket';
import { loadNickname } from '../session';
import { play } from '../audio';
import { useStore } from '../store';
import { CATEGORY_LABELS, CATEGORY_ORDER, GAMES, dailyGames, type GameEntry } from '../games/catalog';
import { useDailyProgress } from '../arcade/useDailyProgress';
import { IconCatOnController, IconClose, IconPlay } from '../components/icons';
import WingNav from '../components/WingNav';
import { isDesktop } from '../device';
import Profile from './Profile';

export default function Home() {
  const [nickname, setNickname] = useState(loadNickname());
  const [code, setCode] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ g: GameEntry; daily: boolean } | null>(null);
  const wing = useStore((s) => s.wing);
  const setWing = useStore((s) => s.setWing);
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
    setInfo(null);
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
      play('start');
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

  /** Uniform carousel card: rounded app-icon tile + title, with a round play
   *  button on the right that launches straight in. Tapping the card itself
   *  opens the summary popup. */
  function gameCard(g: GameEntry, daily = false) {
    const done = daily && dailyDone.has(g.id);
    return (
      <div
        key={g.id}
        className={`game-card${g.available ? '' : ' soon'}${done ? ' daily-card-done' : ''}`}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setInfo({ g, daily })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setInfo({ g, daily });
          }
        }}
      >
        <div className="game-card-head">
          <div className="game-card-icon">
            <g.Icon />
          </div>
          <div className="game-card-title">
            <span className="game-card-name">{daily ? g.dailyLabel ?? g.name : g.name}</span>
            {!g.available && <span className="soon-badge">Soon</span>}
            {done && <span className="daily-done-badge">✓ Done</span>}
          </div>
          <button
            className="game-card-play"
            aria-label={`Play ${g.name}`}
            disabled={busy || !g.available || (g.desktopOnly && !desktop)}
            onClick={(e) => {
              e.stopPropagation();
              create(g);
            }}
          >
            <IconPlay />
          </button>
        </div>
      </div>
    );
  }

  /** Summary popup for a tapped card: X to close, Play front and center. */
  function infoOverlay({ g, daily }: { g: GameEntry; daily: boolean }) {
    const done = daily && dailyDone.has(g.id);
    return (
      <div className="overlay" onClick={() => setInfo(null)}>
        <div
          className="overlay-card game-info-card"
          role="dialog"
          aria-label={g.name}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="btn game-info-close" aria-label="Close" onClick={() => setInfo(null)}>
            <IconClose />
          </button>
          <div className="game-card-icon game-info-icon">
            <g.Icon />
          </div>
          <h2 className="game-info-title">
            {daily ? g.dailyLabel ?? g.name : g.name}
            {!g.available && <span className="soon-badge">Soon</span>}
            {done && <span className="daily-done-badge">✓ Done</span>}
          </h2>
          <p className="game-info-tagline">{g.tagline}</p>
          {!daily && <p className="game-card-players">{g.players}</p>}
          {g.desktopOnly && !desktop && (
            <p className="game-card-players">Needs a keyboard — play from a desktop.</p>
          )}
          <button
            className="btn btn-primary game-info-play"
            disabled={busy || !g.available || (g.desktopOnly && !desktop)}
            onClick={() => {
              setInfo(null);
              create(g);
            }}
          >
            Play
          </button>
        </div>
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
            <span className="home-logo">
              <IconCatOnController />
            </span>
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

        {info && infoOverlay(info)}

        <WingNav />

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
            <div className="game-grid">{dailies.map((g) => gameCard(g, true))}</div>
          </section>
        ) : sections.length === 0 ? (
          <p className="home-empty hint">New games are on their way — check back soon!</p>
        ) : (
          sections.map(({ cat, games }) => (
            <section key={cat} className="category-section">
              <h2 className="category-heading">{CATEGORY_LABELS[cat]}</h2>
              <div className="game-grid">{games.map((g) => gameCard(g))}</div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
