import { useState } from 'react';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import TimerBar from '../../components/TimerBar';
import VolumeControl from '../../components/VolumeControl';
import { IconMenu, IconPause } from '../../components/icons';

export default function UtttGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  if (!game || game.g !== 'uttt' || !lobby) return null;

  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const myMove = game.turnSeat === game.yourSeat && !game.result && !game.paused;
  const turnPlayer = game.players.find((p) => p.seat === game.turnSeat);
  const winLine = game.result?.line ?? null;

  const boardActive = (b: number) =>
    game.boardResults[b] === null && (game.activeBoard === null || game.activeBoard === b);
  const cellPlayable = (b: number, c: number) =>
    myMove && boardActive(b) && game.boards[b]![c] === null;

  function play(b: number, c: number) {
    if (cellPlayable(b, c)) void sendAction({ t: 'place', board: b, cell: c });
  }

  const status = game.result
    ? ''
    : myMove
      ? game.activeBoard === null
        ? 'Your move — any open board'
        : 'Your move'
      : `${turnPlayer?.nickname ?? 'Opponent'}'s move`;

  const winnerName =
    game.result && game.result.winnerSeat !== null
      ? game.players.find((p) => p.seat === game.result!.winnerSeat)?.nickname
      : null;

  return (
    <div className="uttt">
      <div className="uttt-hud">
        <div className="uttt-players">
          {game.players.map((p) => (
            <div
              key={p.seat}
              className={`uttt-chip mark-${p.mark}${game.turnSeat === p.seat && !game.result ? ' turn' : ''}`}
            >
              <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
              <span className="uttt-chip-mark">{p.mark}</span>
              <span className="uttt-chip-name">
                {p.nickname}
                {p.seat === game.yourSeat && <span className="you-tag"> (you)</span>}
              </span>
              {p.wins > 0 && <span className="uttt-chip-wins">{p.wins}</span>}
            </div>
          ))}
        </div>
        <TimerBar deadline={game.paused ? null : game.deadline} tickAudible={myMove} />
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

      <div className="uttt-status">{status}</div>

      <div className="uttt-meta">
        {game.boards.map((cells, b) => {
          const result = game.boardResults[b];
          return (
            <div
              key={b}
              className={[
                'uttt-board',
                boardActive(b) ? 'active' : '',
                boardActive(b) && myMove ? 'yourmove' : '',
                winLine?.includes(b) ? 'winline' : '',
                result && result !== 'draw' ? `won mark-${result}` : '',
                result === 'draw' ? 'drawn' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="uttt-cells">
                {cells.map((v, c) => (
                  <button
                    key={c}
                    className={[
                      'uttt-cell',
                      v ? `mark-${v}` : '',
                      cellPlayable(b, c) ? 'playable' : '',
                      game.lastMove?.board === b && game.lastMove?.cell === c ? 'last' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => play(b, c)}
                    disabled={!cellPlayable(b, c)}
                  >
                    {v ?? ''}
                  </button>
                ))}
              </div>
              {result && result !== 'draw' && <div className="uttt-board-badge">{result}</div>}
            </div>
          );
        })}
      </div>

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

      {game.result && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>{winnerName ? `${winnerName} wins!` : "It's a draw."}</h2>
            <table className="scoreboard">
              <tbody>
                {[...game.players]
                  .sort((a, b) => b.wins - a.wins)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        {p.mark} · {p.nickname}
                      </td>
                      <td className="score-wins">{p.wins}</td>
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
