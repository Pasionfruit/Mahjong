import { useEffect, useRef, useState } from 'react';
import {
  PARTY_SPACES,
  partyBoardPath,
  type PartyFeedItem,
  type PartyView,
} from '@shared/party';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import TimerBar from '../../components/TimerBar';
import VolumeControl from '../../components/VolumeControl';
import { IconBot, IconMenu, IconPause, IconTrophy } from '../../components/icons';

const PATH = partyBoardPath();
/** Token nudges so up to 8 pawns share a space legibly. */
const TOKEN_OFFSETS = [
  [-9, -9],
  [9, -9],
  [-9, 9],
  [9, 9],
  [0, -13],
  [-13, 0],
  [13, 0],
  [0, 13],
] as const;

function feedText(view: PartyView, f: PartyFeedItem): string {
  const nick = (seat: number) => view.players.find((p) => p.seat === seat)?.nickname ?? '?';
  switch (f.kind) {
    case 'roll':
      return `${nick(f.seat)} rolled a ${f.value}`;
    case 'coins':
      return `${nick(f.seat)} ${f.value! > 0 ? `+${f.value}` : f.value} coins`;
    case 'star':
      return `⭐ ${nick(f.seat)} bought a star!`;
    case 'noStar':
      return `${nick(f.seat)} passed the star by`;
    case 'swap':
      return `${nick(f.seat)} swapped places with ${nick(f.other!)}`;
    case 'steal':
      return `${nick(f.seat)} stole ${f.value} coins from ${nick(f.other!)}`;
    case 'chest':
      return `${nick(f.seat)}'s chest: ${f.value! > 0 ? `+${f.value}` : f.value} coins`;
    case 'event':
      return `${nick(f.seat)} landed on an event space…`;
  }
}

export default function PartyGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  // Tokens hop one space at a time toward their server positions.
  const [shownPos, setShownPos] = useState<number[]>([]);
  const viewRef = useRef<PartyView | null>(null);

  const view = game && game.g === 'party' ? (game as PartyView) : null;
  viewRef.current = view;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const v = viewRef.current;
      if (!v) return;
      setShownPos((prev) => {
        let changed = false;
        const next = v.players.map((p, i) => {
          const cur = prev[i] ?? p.pos;
          if (cur === p.pos) return cur;
          changed = true;
          return (cur + 1) % PARTY_SPACES;
        });
        return changed || prev.length !== next.length ? next : prev;
      });
    }, 150);
    return () => window.clearInterval(timer);
  }, []);

  if (!view || !lobby) return null;

  const me = view.players.find((p) => p.seat === view.yourSeat) ?? null;
  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const myRoll = view.phase === 'roll' && view.turnSeat === view.yourSeat && !view.paused;
  const myBuy = view.phase === 'buyStar' && view.turnSeat === view.yourSeat && !view.paused;
  const myChest = view.phase === 'chest' && me !== null && !me.picked && !view.paused;
  const turnPlayer = view.players.find((p) => p.seat === view.turnSeat);

  const status = view.result
    ? ''
    : view.phase === 'chest'
      ? myChest
        ? 'Pick a chest!'
        : 'Waiting for chest picks…'
      : view.phase === 'buyStar'
        ? myBuy
          ? 'The star is yours for the taking…'
          : `${turnPlayer?.nickname} is eyeing the star…`
        : myRoll
          ? 'Your roll!'
          : `${turnPlayer?.nickname}'s roll`;

  const winners = view.result?.winnerSeats ?? [];
  const winnerNames = winners
    .map((w) => view.players.find((p) => p.seat === w)?.nickname)
    .filter(Boolean)
    .join(' & ');

  return (
    <div className="party">
      <div className="party-hud">
        <div className="party-players">
          {view.players.map((p) => (
            <div
              key={p.seat}
              className={`party-chip${view.turnSeat === p.seat && view.phase !== 'chest' && !view.result ? ' turn' : ''}`}
            >
              <span className="party-chip-color" style={{ background: p.color }} />
              <span className="party-chip-name">
                {p.isBot && (
                  <span className="bot-glyph">
                    <IconBot />
                  </span>
                )}
                {p.nickname}
                {p.seat === view.yourSeat && <span className="you-tag"> (you)</span>}
              </span>
              <span className="party-chip-stat">⛁{p.coins}</span>
              <span className="party-chip-stat star">★{p.stars}</span>
              {view.phase === 'chest' && p.picked && <span className="party-chip-pick">✓</span>}
            </div>
          ))}
        </div>
        <div className="party-hud-right">
          <span className="party-round">
            Round {view.progress.current}/{view.progress.total}
          </span>
          <TimerBar deadline={view.paused || view.result ? null : view.deadline} tickAudible={myRoll || myBuy || myChest} />
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
                  !view.result &&
                  (view.paused ? (
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
      </div>

      <div className="party-status">{status}</div>

      <div className="party-arena">
        <div className="party-board">
          {PATH.map((pt, i) => (
            <div
              key={i}
              className={`party-space ${view.spaces[i]}${i === view.starIndex ? ' hasstar' : ''}`}
              style={{ left: `${pt.x / 10}%`, top: `${pt.y / 10}%` }}
            >
              {i === view.starIndex && <span className="party-star">★</span>}
              {view.spaces[i] === 'event' && <span className="party-space-glyph">?</span>}
              {view.spaces[i] === 'start' && <span className="party-space-glyph">▶</span>}
            </div>
          ))}
          {view.players.map((p, i) => {
            const pos = shownPos[i] ?? p.pos;
            const pt = PATH[pos]!;
            const off = TOKEN_OFFSETS[p.seat % TOKEN_OFFSETS.length]!;
            return (
              <div
                key={p.seat}
                className="party-token"
                style={{
                  left: `calc(${pt.x / 10}% + ${off[0]}px)`,
                  top: `calc(${pt.y / 10}% + ${off[1]}px)`,
                  background: p.color,
                }}
                title={p.nickname}
              />
            );
          })}
          <div className="party-center">
            {view.die !== null && <div className="party-die">{view.die}</div>}
            {myRoll && (
              <button className="btn btn-primary party-roll" onClick={() => void sendAction({ t: 'roll' })}>
                🎲 Roll
              </button>
            )}
            <div className="party-feed">
              {view.feed.slice(-6).map((f, i) => (
                <div key={`${view.feed.length}-${i}`} className="party-feed-item">
                  {feedText(view, f)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {myBuy && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>⭐ Buy the star?</h2>
            <p className="hint">
              {view.starCost} coins — you have {me?.coins}.
            </p>
            <div className="overlay-actions">
              <button className="btn" onClick={() => void sendAction({ t: 'buyStar', buy: false })}>
                Skip
              </button>
              <button className="btn btn-primary" onClick={() => void sendAction({ t: 'buyStar', buy: true })}>
                Buy the star
              </button>
            </div>
          </div>
        </div>
      )}

      {view.phase === 'chest' && !view.result && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>Bonus chests</h2>
            {myChest ? (
              <>
                <p className="hint">One holds +10, one +5… and one bites. Everyone picks.</p>
                <div className="party-chests">
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      className="party-chest"
                      onClick={() => void sendAction({ t: 'chest', index: i })}
                    >
                      🎁
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="hint">
                Waiting for{' '}
                {view.players
                  .filter((p) => !p.picked)
                  .map((p) => p.nickname)
                  .join(', ') || '…'}
              </p>
            )}
          </div>
        </div>
      )}

      {view.paused && !view.result && (
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

      {view.result && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>
              <IconTrophy /> {winnerNames} win{winners.length === 1 ? 's' : ''} the party!
            </h2>
            <table className="scoreboard">
              <tbody>
                {[...view.players]
                  .sort((a, b) => b.stars - a.stars || b.coins - a.coins)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        <span className="party-chip-color" style={{ background: p.color }} /> {p.nickname}
                        {p.seat === view.yourSeat ? ' (you)' : ''}
                      </td>
                      <td className="score-wins">
                        ★{p.stars} · ⛁{p.coins}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {isHost ? (
              <div className="overlay-actions">
                <button className="btn" onClick={() => void backToLobby()}>
                  Back to lobby
                </button>
                <button className="btn btn-primary" onClick={() => void nextRound()}>
                  Play again
                </button>
              </div>
            ) : (
              <p className="hint">Waiting for the host to continue…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
