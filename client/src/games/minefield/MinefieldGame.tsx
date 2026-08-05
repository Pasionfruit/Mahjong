import { useEffect, useMemo, useRef, useState } from 'react';
import type { MinefieldAction, MinefieldCellView, MinefieldView } from '@shared/minefield';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import VolumeControl from '../../components/VolumeControl';
import { IconFlag, IconMenu, IconMine, IconPause } from '../../components/icons';
import './styles.css';

/** Per-player color, purely for telling scoreboard rows apart at a glance —
 *  boards are private now, so this no longer means "who revealed this cell". */
const PLAYER_COLORS = ['#7fb8e8', '#e08a8a', '#6bd68a', '#d9c7a4', '#b389e0', '#f0a868', '#4fd0d0', '#e0e070'];

function renderBoard(
  cells: MinefieldCellView[],
  cols: number,
  rows: number,
  opts: {
    interactive: boolean;
    flags?: Set<number>;
    onCell?: (index: number, cell: MinefieldCellView) => void;
    onCellContextMenu?: (e: React.MouseEvent, index: number, cell: MinefieldCellView) => void;
  },
) {
  const style = { '--mf-cols': cols, '--mf-rows': rows } as React.CSSProperties;
  return (
    <div className="minefield-board" style={style}>
      {cells.map((cell, i) => {
        const flagged = opts.flags?.has(i) ?? false;
        let content: React.ReactNode = null;
        let cls = 'minefield-cell';
        if (cell.revealed) {
          cls += ' revealed';
          if (cell.mine) {
            cls += ' mine';
            content = <IconMine />;
          } else if (cell.adjacent > 0) {
            cls += ` n${cell.adjacent}`;
            content = cell.adjacent;
          }
        } else if (flagged) {
          cls += ' flagged';
          content = <IconFlag />;
        }
        return (
          <button
            key={i}
            className={cls}
            disabled={!opts.interactive || cell.revealed}
            onClick={() => opts.onCell?.(i, cell)}
            onContextMenu={(e) => opts.onCellContextMenu?.(e, i, cell)}
            aria-label={cell.revealed ? (cell.mine ? 'Mine' : `${cell.adjacent} adjacent mines`) : 'Hidden cell'}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export default function MinefieldGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const log = useStore((s) => s.log);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [eventBanner, setEventBanner] = useState<string | null>(null);
  /** Client-local only — never sent to the server, never visible to anyone
   *  else. See shared/src/minefield.ts's file doc for why. */
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const toastTimer = useRef<number | undefined>(undefined);
  const eventTimer = useRef<number | undefined>(undefined);

  const view = game && game.g === 'minefield' ? (game as MinefieldView) : null;

  const lastEvent = log.length > 0 ? log[log.length - 1] : undefined;
  useEffect(() => {
    if (!lastEvent || !view) return;
    let msg: string | null = null;
    if (lastEvent.t === 'explode') {
      const name = view.players.find((p) => p.seat === lastEvent.seat)?.nickname ?? 'Someone';
      msg = view.settings.eliminateOnMine ? `💥 ${name} hit a mine — eliminated!` : `💥 ${name} hit a mine!`;
    } else if (lastEvent.t === 'win' && lastEvent.by === 'lastStanding') {
      const name = view.players.find((p) => p.seat === lastEvent.seat)?.nickname ?? 'Someone';
      msg = `🏆 ${name} is the last one standing!`;
    } else if (lastEvent.t === 'win' && lastEvent.by === 'cleared') {
      const name = view.players.find((p) => p.seat === lastEvent.seat)?.nickname ?? 'Someone';
      msg = `🎉 ${name} cleared their board first!`;
    }
    if (msg === null) return;
    setEventBanner(msg);
    window.clearTimeout(eventTimer.current);
    eventTimer.current = window.setTimeout(() => setEventBanner(null), 2600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEvent]);

  useEffect(
    () => () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(eventTimer.current);
    },
    [],
  );

  // A fresh round starts with a clean slate of flags.
  useEffect(() => {
    if (view) setFlags(new Set());
  }, [view?.round]); // eslint-disable-line react-hooks/exhaustive-deps

  const playerColor = useMemo(() => (seat: number) => PLAYER_COLORS[seat % PLAYER_COLORS.length]!, []);

  if (!view || !lobby) return null;

  const me = view.players.find((p) => p.seat === view.yourSeat) ?? null;
  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const playing = !view.result && !view.paused && !!me && !me.eliminated;
  const winners = view.result ? view.result.winnerSeats : [];

  function showToast(msg: string): void {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }

  function act(a: MinefieldAction): void {
    void sendAction(a).then((r) => {
      if (!r.ok) showToast(r.error);
    });
  }

  function onCell(index: number, cell: MinefieldCellView): void {
    if (!playing || cell.revealed) return;
    if (flags.has(index)) return; // must unflag first — mirrors solo Minesweeper
    act({ t: 'mf', op: 'reveal', index });
  }

  function onCellContextMenu(e: React.MouseEvent, index: number, cell: MinefieldCellView): void {
    e.preventDefault();
    if (!playing || cell.revealed) return;
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="minefield">
      <div className="minefield-hud">
        <div className="minefield-hud-left">
          <span className="minefield-hud-title">💣 Minesweeper</span>
          <span className="minefield-hud-status">
            Round {view.round} · {view.mineCount} mines · {view.settings.noGuess ? 'no 50/50s' : 'classic odds'}
            {!view.settings.eliminateOnMine && ' · mines don’t eliminate'}
          </span>
        </div>
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

      <div className="minefield-scoreboard">
        {[...view.players]
          .sort((a, b) => b.revealedCount - a.revealedCount)
          .map((p) => (
            <div
              key={p.seat}
              className={`minefield-score${p.eliminated ? ' out' : ''}${p.seat === view.yourSeat ? ' me' : ''}`}
            >
              <span className="minefield-score-dot" style={{ background: playerColor(p.seat) }} />
              <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
              <span className="minefield-score-name">{p.nickname}</span>
              <span className="minefield-score-count" title="Cells revealed on their own board">
                {p.revealedCount}/{view.totalSafeCells}
              </span>
              {p.minesHit > 0 && (
                <span className="minefield-score-mines" title={`${p.minesHit} mine${p.minesHit === 1 ? '' : 's'} hit`}>
                  💥{p.minesHit}
                </span>
              )}
              {p.eliminated && <span className="minefield-score-out-badge">out</span>}
            </div>
          ))}
      </div>

      {me?.eliminated && !view.result && (
        <p className="hint minefield-spectate">💥 You're out this round — watching the race play out.</p>
      )}

      <div className="minefield-board-wrap">
        {view.yourCells &&
          renderBoard(view.yourCells, view.cols, view.rows, { interactive: playing, flags, onCell, onCellContextMenu })}
      </div>

      <p className="minefield-help hint">
        Everyone's racing an identical board, laid out just for them — reveals on your board are yours
        alone. Tap to reveal. Right-click (or long-press) to flag a cell for yourself.
      </p>

      {eventBanner && <div className="minefield-event">{eventBanner}</div>}
      {toast && <div className="minefield-toast">{toast}</div>}

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
          <div className="overlay-card minefield-result-card">
            <h2>
              {winners.length === 1
                ? `🏆 ${view.players.find((p) => p.seat === winners[0])?.nickname ?? 'Someone'} wins!`
                : '🤝 Draw!'}
            </h2>
            {view.finalLayout && (
              <div className="minefield-reveal">
                <p className="hint">Everyone raced this exact layout:</p>
                <div className="minefield-board-wrap minefield-board-wrap-small">
                  {renderBoard(view.finalLayout, view.cols, view.rows, { interactive: false })}
                </div>
              </div>
            )}
            <table className="scoreboard">
              <tbody>
                {[...view.players]
                  .sort((a, b) => b.revealedCount - a.revealedCount)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        {winners.includes(p.seat) ? '🏆 ' : ''}
                        {p.nickname}
                        {p.seat === view.yourSeat ? ' (you)' : ''}
                      </td>
                      <td className="score-wins">
                        {p.revealedCount}/{view.totalSafeCells} cleared
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
