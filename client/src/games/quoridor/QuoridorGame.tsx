import { useMemo, useRef, useState } from 'react';
import {
  WALLS_PER_PLAYER,
  cellIndex,
  goalDistanceField,
  newGame,
  pawnMoves,
  type Move,
  type PlayerIndex,
  type Pos,
  type QuoridorOnlineView,
  type QuoridorState,
} from '@shared/quoridor';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import TimerBar from '../../components/TimerBar';
import VolumeControl from '../../components/VolumeControl';
import { IconBot, IconMenu, IconPause, IconTrophy } from '../../components/icons';
import QuoridorBoard, { PawnGlyph } from './Board';

/** Rebuild an engine state from the redacted view (walls, pawns, turn). */
function toState(v: QuoridorOnlineView): QuoridorState {
  const s = newGame();
  s.pawns = [{ ...v.pawns[0] }, { ...v.pawns[1] }];
  for (const i of v.hWalls) s.hWalls[i] = 1;
  for (const i of v.vWalls) s.vWalls[i] = 1;
  s.wallsLeft = [v.wallsLeft[0], v.wallsLeft[1]];
  s.turn = v.turnSeat as PlayerIndex;
  s.winner = v.result?.winnerSeat ?? null;
  return s;
}

/** The pawn move that best shortens the current player's path (hints). */
function bestPawnStep(s: QuoridorState): Pos | null {
  const field = goalDistanceField(s, s.turn);
  let best: Pos | null = null;
  let bestD = Infinity;
  for (const to of pawnMoves(s, s.turn)) {
    const d = field[cellIndex(to.r, to.c)]!;
    const dd = d === -1 ? 99 : d;
    if (dd < bestD) {
      best = to;
      bestD = dd;
    }
  }
  return best;
}

export default function QuoridorGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState<Pos | null>(null);
  const hintTimer = useRef(0);

  const view = game && game.g === 'quoridor' ? (game as QuoridorOnlineView) : null;
  const state = useMemo(() => (view ? toState(view) : null), [view]);
  if (!view || !state || !lobby) return null;

  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const myMove = view.turnSeat === view.yourSeat && !view.result && !view.paused;
  const turnPlayer = view.players.find((p) => p.seat === view.turnSeat);
  const winnerName =
    view.result !== null
      ? view.players.find((p) => p.seat === view.result!.winnerSeat)?.nickname
      : null;

  const status = view.result
    ? ''
    : myMove
      ? 'Your move'
      : `${turnPlayer?.nickname ?? 'Opponent'}'s move`;

  function showHint() {
    if (!myMove || !state) return;
    const best = bestPawnStep(state);
    if (!best) return;
    setHint(best);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 1600);
  }

  return (
    <div className="quor">
      <div className="quor-hud">
        <div className="quor-hud-left">
          <span className="quor-hud-title">Quoridor</span>
          <span className="quor-hud-status">{status}</span>
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

      <div className="quor-arena">
        <QuoridorBoard
          game={state}
          version={view.history.length}
          interactive={myMove}
          onMove={(move: Move) => {
            if (myMove) void sendAction(move);
          }}
          hint={hint}
          winner={view.result?.winnerSeat ?? null}
        />

        <div className="quor-side">
          {([0, 1] as const).map((p) => {
            const pl = view.players[p];
            if (!pl) return null;
            return (
              <div
                key={p}
                className={`quor-player-card${view.turnSeat === p && !view.result ? ' active' : ''}`}
              >
                <div className="quor-player-row">
                  <span className="quor-player-pawn">
                    <PawnGlyph player={p} />
                  </span>
                  <span className={`conn-dot ${pl.connected ? 'on' : 'off'}`} />
                  <span className="quor-player-name">
                    {pl.isBot && (
                      <span className="bot-glyph">
                        <IconBot />
                      </span>
                    )}
                    {pl.nickname}
                    {p === view.yourSeat && <span className="you-tag"> (you)</span>}
                  </span>
                  {pl.wins > 0 && <span className="win-count">{pl.wins}</span>}
                </div>
                <div className="quor-wallstack" title={`${pl.wallsLeft} walls left`}>
                  {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
                    <i key={i} className={i < pl.wallsLeft ? '' : 'spent'} />
                  ))}
                </div>
              </div>
            );
          })}

          <div className="quor-actions">
            <button className="btn" disabled={!myMove} onClick={showHint}>
              Hint
            </button>
          </div>

          {view.history.length > 0 && (
            <div className="quor-history">
              {view.history.map((n, i) => (
                // The opening move alternates by round; colors follow the mover.
                <span key={i} className={`quor-move p${((view.round - 1) % 2 + i) % 2}`}>
                  {i + 1}. {n}
                </span>
              ))}
            </div>
          )}
        </div>
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
              <IconTrophy /> {winnerName} wins!
            </h2>
            <table className="scoreboard">
              <tbody>
                {[...view.players]
                  .sort((a, b) => b.wins - a.wins)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        {p.nickname}
                        {p.seat === view.yourSeat ? ' (you)' : ''}
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
