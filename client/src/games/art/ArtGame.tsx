import { useEffect, useRef, useState } from 'react';
import { ART_MODE_NAMES, type ArtChatMessage, type ArtView } from '@shared/art';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import TimerBar from '../../components/TimerBar';
import VolumeControl from '../../components/VolumeControl';
import { IconMenu, IconPause, IconTrophy } from '../../components/icons';
import ArtCanvas from './ArtCanvas';

function nickOf(game: ArtView, seat: number): string {
  return game.players.find((p) => p.seat === seat)?.nickname ?? `Player ${seat + 1}`;
}

/** "A → B → C" contributor trail for swap canvases. */
function trail(game: ArtView, seats: number[]): string {
  return seats.map((s) => nickOf(game, s)).join(' → ');
}

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(0)}s`;
}

// ── shared bits ─────────────────────────────────────────────────────────────

function PlayersStrip({ game }: { game: ArtView }) {
  const showScores = game.mode !== 'swap';
  return (
    <div className="art-players">
      {game.players.map((p) => {
        const flag =
          game.phase === 'draw' && game.mode !== 'guess'
            ? p.done
            : game.phase === 'vote'
              ? p.voted
              : game.mode === 'guess' && game.phase === 'draw'
                ? p.correct
                : false;
        const drawer = game.mode === 'guess' && game.guess?.drawerSeat === p.seat;
        return (
          <div key={p.seat} className={`art-chip${flag ? ' flagged' : ''}`}>
            <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
            <span className="art-chip-name">
              {drawer && <span className="art-chip-role">✏️</span>}
              {p.nickname}
              {p.seat === game.yourSeat && <span className="you-tag"> (you)</span>}
            </span>
            {showScores && <span className="art-chip-score">{p.score}</span>}
            {flag && <span className="art-chip-flag">✓</span>}
          </div>
        );
      })}
    </div>
  );
}

function HostActions({ isHost }: { isHost: boolean }) {
  if (!isHost) return <p className="hint">Waiting for the host to continue…</p>;
  return (
    <div className="overlay-actions">
      <button className="btn" onClick={() => void backToLobby()}>
        Back to lobby
      </button>
      <button className="btn btn-primary" onClick={() => void nextRound()}>
        Play again
      </button>
    </div>
  );
}

function Scoreboard({ game }: { game: ArtView }) {
  const ranked = [...game.players].sort((a, b) => b.score - a.score);
  const stats = game.guess?.stats ?? null;
  return (
    <table className="scoreboard art-scoreboard">
      <thead>
        <tr>
          <th>Player</th>
          <th>Points</th>
          {stats && <th>Guessed</th>}
          {stats && <th>Drawn</th>}
          {stats && <th>Avg guess</th>}
        </tr>
      </thead>
      <tbody>
        {ranked.map((p, i) => {
          const st = stats?.find((s) => s.seat === p.seat);
          return (
            <tr key={p.seat} className={game.result?.winnerSeats.includes(p.seat) ? 'winner' : ''}>
              <td>
                {i + 1}. {p.nickname}
                {p.seat === game.yourSeat ? ' (you)' : ''}
              </td>
              <td className="score-wins">{p.score}</td>
              {stats && <td>{st?.correctGuesses ?? 0}</td>}
              {stats && <td>{st?.drawingsCompleted ?? 0}</td>}
              {stats && <td>{st?.avgGuessMs != null ? fmtMs(st.avgGuessMs) : '—'}</td>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function WinnerBanner({ game }: { game: ArtView }) {
  const winners = game.result?.winnerSeats ?? [];
  if (winners.length === 0) return <h2>Game over!</h2>;
  return (
    <h2>
      <IconTrophy /> {winners.map((s) => nickOf(game, s)).join(' & ')} win
      {winners.length === 1 ? 's' : ''}!
    </h2>
  );
}

// ── draw phases (swap & imposter) ───────────────────────────────────────────

function DrawBoard({ game }: { game: ArtView }) {
  const me = game.players.find((p) => p.seat === game.yourSeat);
  const canvas = game.canvases[0];
  if (!canvas) return null;
  const done = me?.done ?? false;
  const isContinuation = game.mode === 'swap' && (game.subRound?.current ?? 1) > 1;
  return (
    <div className="art-board">
      <div className="art-banner">
        {game.mode === 'imposter' ? (
          <>
            <span className="art-banner-label">Your secret word</span>
            <span className="art-banner-word">{game.yourPrompt}</span>
            <span className="art-banner-note">One artist got a different word. Blend in!</span>
          </>
        ) : (
          <>
            <span className="art-banner-label">
              {isContinuation ? 'Continue this drawing' : 'Draw'}
            </span>
            <span className="art-banner-word">{game.yourPrompt}</span>
            {isContinuation && (
              <span className="art-banner-note">by {trail(game, canvas.contributors ?? [])}</span>
            )}
          </>
        )}
      </div>
      <ArtCanvas cvKey={canvas.key} canDraw={game.yourCanvasKey === canvas.key && !game.paused} />
      <div className="art-board-actions">
        <button
          className={`btn${done ? '' : ' btn-primary'}`}
          onClick={() => void sendAction({ t: 'done', done: !done })}
        >
          {done ? 'Keep drawing' : "I'm done"}
        </button>
        {done && <span className="hint">Waiting for the others…</span>}
      </div>
    </div>
  );
}

// ── swap reveal & gallery ───────────────────────────────────────────────────

function SwapReveal({ game }: { game: ArtView }) {
  const idx = game.swap?.revealIndex ?? 0;
  const entry = game.swap?.entries[idx];
  const canvas = game.canvases[0];
  if (!entry || !canvas) return null;
  return (
    <div className="art-board">
      <div className="art-banner">
        <span className="art-banner-label">
          Reveal {idx + 1} / {game.players.length}
        </span>
        <span className="art-banner-word">{entry.prompt}</span>
        <span className="art-banner-note">by {trail(game, entry.contributors)}</span>
      </div>
      <ArtCanvas cvKey={canvas.key} />
      <div className="art-board-actions">
        <button className="btn" onClick={() => void sendAction({ t: 'advance' })}>
          Next →
        </button>
      </div>
    </div>
  );
}

function SwapGallery({ game, isHost }: { game: ArtView; isHost: boolean }) {
  return (
    <div className="art-final">
      <h2>The gallery</h2>
      <div className="art-gallery">
        {(game.swap?.entries ?? []).map((e) => (
          <div key={e.key} className="art-gallery-card">
            <ArtCanvas cvKey={e.key} mini />
            <div className="art-gallery-prompt">{e.prompt}</div>
            <div className="art-gallery-trail">{trail(game, e.contributors)}</div>
          </div>
        ))}
      </div>
      <HostActions isHost={isHost} />
    </div>
  );
}

// ── imposter vote / result / final ──────────────────────────────────────────

function ImposterVote({ game }: { game: ArtView }) {
  const info = game.imposter;
  if (!info) return null;
  const myVote = info.yourVote;
  return (
    <div className="art-final">
      <h2>Who drew something different?</h2>
      <p className="hint">Everyone got “the same” word… except one artist. Vote them out.</p>
      <div className="art-gallery">
        {game.canvases.map((c) => {
          const seat = c.ownerSeat ?? -1;
          const mine = seat === game.yourSeat;
          return (
            <div key={c.key} className={`art-gallery-card${myVote === seat ? ' voted' : ''}`}>
              <ArtCanvas cvKey={c.key} mini />
              <div className="art-gallery-prompt">
                {nickOf(game, seat)}
                {mine ? ' (you)' : ''}
                {info.votedSeats.includes(seat) && <span className="art-chip-flag"> ✓</span>}
              </div>
              {!mine && (
                <button
                  className={`btn art-vote-btn${myVote === seat ? ' btn-primary' : ''}`}
                  onClick={() => void sendAction({ t: 'vote', seat })}
                >
                  {myVote === seat ? 'Your vote' : 'Vote'}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="hint">
        {myVote !== null
          ? 'Vote cast — you can change it until everyone has voted.'
          : 'Voting ends when the timer runs out.'}
      </p>
    </div>
  );
}

function ImposterResult({ game }: { game: ArtView }) {
  const result = game.imposter?.result;
  if (!result) return null;
  return (
    <div className="art-final">
      <h2>
        {result.caught
          ? `${nickOf(game, result.imposterSeat)} was the imposter — caught!`
          : `${nickOf(game, result.imposterSeat)} was the imposter… and got away!`}
      </h2>
      <p className="art-words-line">
        Everyone drew <strong>{result.commonWord}</strong> — the imposter drew{' '}
        <strong>{result.imposterWord}</strong>.
      </p>
      <div className="art-gallery">
        {game.canvases.map((c) => {
          const seat = c.ownerSeat ?? -1;
          const votes = result.votes.filter((v) => v.target === seat).length;
          return (
            <div
              key={c.key}
              className={`art-gallery-card${seat === result.imposterSeat ? ' imposter' : ''}`}
            >
              <ArtCanvas cvKey={c.key} mini />
              <div className="art-gallery-prompt">
                {nickOf(game, seat)}
                {seat === result.imposterSeat ? ' 🎭' : ''}
              </div>
              <div className="art-gallery-trail">
                {votes} vote{votes === 1 ? '' : 's'}
              </div>
            </div>
          );
        })}
      </div>
      {result.points.length > 0 && (
        <ul className="art-points">
          {result.points.map((p, i) => (
            <li key={i}>
              <strong>{nickOf(game, p.seat)}</strong> +{p.delta} — {p.reason}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Next round starting…</p>
    </div>
  );
}

// ── guess mode ──────────────────────────────────────────────────────────────

function WordBar({ game }: { game: ArtView }) {
  const g = game.guess;
  if (!g) return null;
  if (g.word) {
    const isDrawer = g.drawerSeat === game.yourSeat;
    return (
      <div className="art-wordbar">
        <span className="art-wordbar-label">{isDrawer ? 'Draw:' : 'The word:'}</span>
        <span className="art-wordbar-word">{g.word}</span>
      </div>
    );
  }
  if (g.wordPattern) {
    return (
      <div className="art-wordbar">
        <span className="art-wordbar-label">Guess:</span>
        <span className="art-pattern">
          {g.wordPattern.split('').map((ch, i) =>
            ch === ' ' ? (
              <span key={i} className="art-pattern-gap" />
            ) : (
              <span key={i} className={`art-pattern-slot${ch === '_' ? '' : ' shown'}`}>
                {ch === '_' ? '' : ch}
              </span>
            ),
          )}
        </span>
        <span className="art-wordbar-label">({g.wordPattern.replace(/ /g, '').length})</span>
      </div>
    );
  }
  return null;
}

function ChatMessage({ game, m }: { game: ArtView; m: ArtChatMessage }) {
  if (m.kind === 'correct') {
    return (
      <div className="art-msg correct">
        <strong>{nickOf(game, m.seat)}</strong> guessed the word!
      </div>
    );
  }
  if (m.kind === 'close') return <div className="art-msg close">{m.text}</div>;
  if (m.kind === 'system') {
    return (
      <div className="art-msg system">
        {m.seat >= 0 ? (
          <>
            <strong>{nickOf(game, m.seat)}</strong> {m.text}
          </>
        ) : (
          m.text
        )}
      </div>
    );
  }
  return (
    <div className="art-msg">
      <strong>{nickOf(game, m.seat)}:</strong> {m.text}
    </div>
  );
}

function GuessChat({ game }: { game: ArtView }) {
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const g = game.guess;
  const count = g?.messages.length ?? 0;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [count]);
  if (!g) return null;

  const isDrawer = g.drawerSeat === game.yourSeat;
  const guessedIt = g.correctSeats.includes(game.yourSeat);
  const placeholder =
    isDrawer || guessedIt ? 'Chat with the others who know…' : 'Type your guess…';

  function submit() {
    const t = text.trim();
    if (!t) return;
    setText('');
    void sendAction({ t: 'guess', text: t });
  }

  return (
    <div className="art-chat">
      <div className="art-chat-list" ref={listRef}>
        {g.messages.map((m) => (
          <ChatMessage key={m.id} game={game} m={m} />
        ))}
      </div>
      <div className="art-chat-input">
        <input
          value={text}
          maxLength={40}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="btn" onClick={submit}>
          Send
        </button>
      </div>
    </div>
  );
}

function GuessBoard({ game }: { game: ArtView }) {
  const g = game.guess!;
  const canvasKey = game.canvases[0]?.key ?? `t${g.turnIndex}`;
  const isDrawer = g.drawerSeat === game.yourSeat;

  return (
    <div className="art-guess-layout">
      <div className="art-guess-center">
        {game.phase === 'choose' ? (
          <div className="art-choose">
            {isDrawer && g.choices ? (
              <>
                <h2>Pick a word to draw</h2>
                <div className="art-choices">
                  {g.choices.map((w, i) => (
                    <button
                      key={i}
                      className="btn btn-primary art-choice"
                      onClick={() => void sendAction({ t: 'chooseWord', index: i })}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2>{nickOf(game, g.drawerSeat)} is picking a word…</h2>
                <p className="hint">Get ready to guess!</p>
              </>
            )}
          </div>
        ) : (
          <>
            <WordBar game={game} />
            <ArtCanvas
              cvKey={canvasKey}
              canDraw={game.yourCanvasKey === canvasKey && !game.paused}
            />
          </>
        )}
      </div>
      <GuessChat game={game} />
      {game.phase === 'turnResult' && g.turnResult && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>
              The word was <em>{g.turnResult.word}</em>
            </h2>
            {g.turnResult.everyoneGuessed && <p>Everyone guessed it!</p>}
            {g.turnResult.points.length > 0 ? (
              <ul className="art-points">
                {g.turnResult.points.map((p, i) => (
                  <li key={i}>
                    <strong>{nickOf(game, p.seat)}</strong> +{p.delta}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nobody got it this time.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GuessFinal({ game, isHost }: { game: ArtView; isHost: boolean }) {
  const [replay, setReplay] = useState<number | null>(null);
  const archive = game.guess?.archive ?? [];
  const entry = replay !== null ? archive[replay] : undefined;
  return (
    <div className="art-final">
      <WinnerBanner game={game} />
      <Scoreboard game={game} />
      {archive.length > 0 && (
        <div className="art-replay">
          <div className="art-replay-nav">
            <button
              className="btn"
              disabled={replay === 0}
              onClick={() => setReplay(replay === null ? archive.length - 1 : replay - 1)}
            >
              ← Prev
            </button>
            <span className="art-replay-title">
              {entry
                ? `Round ${entry.round} — ${nickOf(game, entry.drawerSeat)} drew “${entry.word}”`
                : `Review the ${archive.length} drawings`}
            </span>
            <button
              className="btn"
              disabled={replay !== null && replay >= archive.length - 1}
              onClick={() => setReplay(replay === null ? 0 : replay + 1)}
            >
              Next →
            </button>
          </div>
          {entry && (
            <div className="art-replay-body">
              <div className="art-replay-canvas">
                <ArtCanvas cvKey={entry.canvasKey} mini />
              </div>
              <div className="art-replay-details">
                <div>
                  <strong>{nickOf(game, entry.drawerSeat)}</strong> earned +{entry.drawerPoints} drawing{' '}
                  <em>{entry.word}</em>
                </div>
                {entry.correct.length === 0 && <div className="hint">Nobody guessed it.</div>}
                {entry.correct.map((c, i) => (
                  <div key={i}>
                    ✓ <strong>{nickOf(game, c.seat)}</strong> after {fmtMs(c.ms)} (+{c.points})
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <HostActions isHost={isHost} />
    </div>
  );
}

// ── screen ──────────────────────────────────────────────────────────────────

export default function ArtGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!game || game.g !== 'art' || !lobby) return null;

  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;

  let status = '';
  if (game.mode === 'swap') {
    status =
      game.phase === 'draw'
        ? `Drawing ${game.subRound?.current}/${game.subRound?.total}`
        : game.phase === 'reveal'
          ? 'The big reveal'
          : 'Gallery';
  } else if (game.mode === 'imposter') {
    status = `Round ${game.subRound?.current}/${game.subRound?.total} — ${
      game.phase === 'draw' ? 'draw your word' : game.phase === 'vote' ? 'vote!' : 'reveal'
    }`;
  } else if (game.guess) {
    status = `Round ${game.subRound?.current}/${game.subRound?.total} · drawing ${
      Math.min(game.guess.turnIndex + 1, game.guess.turnCount)
    }/${game.guess.turnCount}`;
  }

  let body;
  if (game.phase === 'draw' && game.mode !== 'guess') body = <DrawBoard game={game} />;
  else if (game.phase === 'reveal') body = <SwapReveal game={game} />;
  else if (game.phase === 'gallery') body = <SwapGallery game={game} isHost={isHost} />;
  else if (game.phase === 'vote') body = <ImposterVote game={game} />;
  else if (game.phase === 'result') body = <ImposterResult game={game} />;
  else if (game.mode === 'imposter' && game.phase === 'final') {
    body = (
      <div className="art-final">
        <WinnerBanner game={game} />
        <Scoreboard game={game} />
        <HostActions isHost={isHost} />
      </div>
    );
  } else if (game.mode === 'guess' && game.phase === 'final') {
    body = <GuessFinal game={game} isHost={isHost} />;
  } else if (game.mode === 'guess') {
    body = <GuessBoard game={game} />;
  }

  return (
    <div className="art">
      <div className="art-hud">
        <div className="art-hud-left">
          <span className="art-hud-title">{ART_MODE_NAMES[game.mode]}</span>
          <span className="art-hud-status">{status}</span>
        </div>
        <TimerBar
          deadline={game.paused || game.result ? null : game.deadline}
          tickAudible={
            game.mode === 'guess' &&
            game.phase === 'draw' &&
            game.guess?.drawerSeat !== game.yourSeat &&
            !game.guess?.correctSeats.includes(game.yourSeat)
          }
        />
        <div className="hud-menu">
          <button className="btn hud-btn" onClick={() => setMenuOpen((o) => !o)}>
            <IconMenu /> Menu
          </button>
          {menuOpen && (
            <div className="hud-dropdown">
              <div className="menu-section">
                <span className="menu-section-title">Sound</span>
                <VolumeControl />
              </div>
              {isHost &&
                !game.result &&
                (game.paused ? (
                  <button className="btn" onClick={() => void resumeGame().then(() => setMenuOpen(false))}>
                    Resume
                  </button>
                ) : (
                  <button className="btn" onClick={() => void pauseGame().then(() => setMenuOpen(false))}>
                    Pause
                  </button>
                ))}
              {isHost && (
                <button
                  className="btn"
                  onClick={() => {
                    if (confirm('End the game and return everyone to the lobby?')) void backToLobby();
                    setMenuOpen(false);
                  }}
                >
                  End game
                </button>
              )}
              <button className="btn" onClick={leaveParty}>
                Leave
              </button>
            </div>
          )}
        </div>
      </div>

      <PlayersStrip game={game} />

      {body}

      {game.paused && !game.result && (
        <div className="overlay">
          <div className="overlay-card pause-card">
            <h2>
              <IconPause /> Game paused
            </h2>
            {isHost ? (
              <button className="btn btn-primary" onClick={() => void resumeGame()}>
                Resume
              </button>
            ) : (
              <p className="hint">Waiting for the host to resume…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
