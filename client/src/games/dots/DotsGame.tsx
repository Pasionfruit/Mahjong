import { useState } from 'react';
import type { DotsView } from '@shared/dots';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import TimerBar from '../../components/TimerBar';
import VolumeControl from '../../components/VolumeControl';
import { IconBot, IconMenu, IconPause, IconTrophy } from '../../components/icons';

export default function DotsGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!game || game.g !== 'dots' || !lobby) return null;
  const view = game as DotsView;

  const n = view.size;
  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const myMove = view.turnSeat === view.yourSeat && !view.result && !view.paused;
  const turnPlayer = view.players.find((p) => p.seat === view.turnSeat);
  const colorOf = (seat: number) => view.players.find((p) => p.seat === seat)?.color ?? '#fff';

  function draw(o: 'h' | 'v', r: number, c: number) {
    if (!myMove) return;
    void sendAction({ t: 'edge', o, r, c });
  }

  const status = view.result
    ? ''
    : myMove
      ? view.extraTurn
        ? 'Box! Go again'
        : 'Your move'
      : `${turnPlayer?.nickname ?? '…'}'s move${view.extraTurn ? ' — they go again' : ''}`;

  // Board cells on a (2n+1)² grid: dots even/even, h-edges even/odd,
  // v-edges odd/even, boxes odd/odd.
  const cells = [];
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c <= n; c++) {
      cells.push(
        <i
          key={`d${r}-${c}`}
          className="dots-dot"
          style={{ gridRow: r * 2 + 1, gridColumn: c * 2 + 1 }}
        />,
      );
    }
  }
  for (let r = 0; r <= n; r++) {
    for (let c = 0; c < n; c++) {
      const owner = view.hEdges[r * n + c]!;
      const last = view.lastEdge?.o === 'h' && view.lastEdge.r === r && view.lastEdge.c === c;
      cells.push(
        <button
          key={`h${r}-${c}`}
          className={`dots-edge h${owner !== -1 ? ' drawn' : ''}${last ? ' last' : ''}${myMove && owner === -1 ? ' open' : ''}`}
          style={{ gridRow: r * 2 + 1, gridColumn: c * 2 + 2, ...(owner !== -1 ? { background: colorOf(owner) } : {}) }}
          disabled={owner !== -1 || !myMove}
          aria-label={`edge h ${r},${c}`}
          onClick={() => draw('h', r, c)}
        />,
      );
    }
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= n; c++) {
      const owner = view.vEdges[r * (n + 1) + c]!;
      const last = view.lastEdge?.o === 'v' && view.lastEdge.r === r && view.lastEdge.c === c;
      cells.push(
        <button
          key={`v${r}-${c}`}
          className={`dots-edge v${owner !== -1 ? ' drawn' : ''}${last ? ' last' : ''}${myMove && owner === -1 ? ' open' : ''}`}
          style={{ gridRow: r * 2 + 2, gridColumn: c * 2 + 1, ...(owner !== -1 ? { background: colorOf(owner) } : {}) }}
          disabled={owner !== -1 || !myMove}
          aria-label={`edge v ${r},${c}`}
          onClick={() => draw('v', r, c)}
        />,
      );
    }
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const owner = view.boxes[r * n + c]!;
      cells.push(
        <div
          key={`b${r}-${c}`}
          className={`dots-box${owner !== -1 ? ' owned' : ''}`}
          style={{
            gridRow: r * 2 + 2,
            gridColumn: c * 2 + 2,
            ...(owner !== -1 ? { background: colorOf(owner) } : {}),
          }}
        >
          {owner !== -1 && (
            <span className="dots-box-initial">
              {view.players.find((p) => p.seat === owner)?.nickname[0] ?? ''}
            </span>
          )}
        </div>,
      );
    }
  }

  const ranked = [...view.players].sort((a, b) => b.score - a.score);
  const winners = view.result?.winnerSeats ?? [];
  const winnerNames = winners
    .map((w) => view.players.find((p) => p.seat === w)?.nickname)
    .filter(Boolean)
    .join(' & ');

  return (
    <div className="dots">
      <div className="dots-hud">
        <div className="dots-players">
          {view.players.map((p) => (
            <div
              key={p.seat}
              className={`dots-chip${view.turnSeat === p.seat && !view.result ? ' turn' : ''}`}
            >
              <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
              <span className="dots-chip-color" style={{ background: p.color }} />
              <span className="dots-chip-name">
                {p.isBot && (
                  <span className="bot-glyph">
                    <IconBot />
                  </span>
                )}
                {p.nickname}
                {p.seat === view.yourSeat && <span className="you-tag"> (you)</span>}
              </span>
              <span className="dots-chip-score">{p.score}</span>
            </div>
          ))}
        </div>
        <TimerBar deadline={view.paused ? null : view.deadline} tickAudible={myMove} />
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

      <div className={`dots-status${myMove && view.extraTurn ? ' extra' : ''}`}>{status}</div>

      <div
        className="dots-board"
        style={{ gridTemplateColumns: `repeat(${n}, 12px 1fr) 12px`, gridTemplateRows: `repeat(${n}, 12px 1fr) 12px` }}
      >
        {cells}
      </div>

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
              {winners.length > 1 ? (
                `It's a tie — ${winnerNames}!`
              ) : (
                <>
                  <IconTrophy /> {winnerNames} wins!
                </>
              )}
            </h2>
            <table className="scoreboard">
              <tbody>
                {ranked.map((p) => (
                  <tr key={p.seat}>
                    <td>
                      <span className="dots-chip-color" style={{ background: p.color }} />{' '}
                      {p.nickname}
                      {p.seat === view.yourSeat ? ' (you)' : ''}
                    </td>
                    <td className="score-wins">{p.score} boxes</td>
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
