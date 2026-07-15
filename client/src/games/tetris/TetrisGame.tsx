import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GARBAGE_COLOR,
  PIECE_CELLS,
  PIECE_COLORS,
  TETRIS_H,
  TETRIS_HIDDEN_ROWS,
  TETRIS_W,
  type PieceKind,
  type TetrisOp,
  type TetrisPlayerView,
  type TetrisView,
} from '@shared/tetris';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import { play } from '../../audio';
import VolumeControl from '../../components/VolumeControl';
import { IconMenu, IconPause, IconTrophy } from '../../components/icons';

const VISIBLE_ROWS = TETRIS_H - TETRIS_HIDDEN_ROWS;
const CELL = 28; // logical canvas pixels per cell
/** Keyboard auto-repeat: delayed auto shift then rapid repeat. */
const DAS_MS = 160;
const ARR_MS = 40;
const SOFT_MS = 45;

function send(op: TetrisOp): void {
  void sendAction({ t: 'tetris', op });
}

function colorOf(ch: string): string | null {
  if (ch === '.') return null;
  if (ch === 'G') return GARBAGE_COLOR;
  return PIECE_COLORS[ch as PieceKind] ?? null;
}

function cellsOccupied(grid: string[], x: number, y: number): boolean {
  if (x < 0 || x >= TETRIS_W || y >= TETRIS_H) return true;
  if (y < 0) return true;
  return grid[y]![x] !== '.';
}

function pieceCollides(grid: string[], kind: PieceKind, rot: number, x: number, y: number): boolean {
  return PIECE_CELLS[kind][rot & 3]!.some(([cx, cy]) => cellsOccupied(grid, x + cx, y + cy));
}

/** Where the active piece would land — for the ghost outline. */
function ghostY(p: TetrisPlayerView): number {
  const a = p.active!;
  let y = a.y;
  while (!pieceCollides(p.grid, a.kind, a.rot, a.x, y + 1)) y++;
  return y;
}

// ── board canvas ────────────────────────────────────────────────────────────

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, ghost = false): void {
  const px = x * CELL;
  const py = (y - TETRIS_HIDDEN_ROWS) * CELL;
  if (py < -CELL) return;
  if (ghost) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 2.5, py + 2.5, CELL - 5, CELL - 5);
    return;
  }
  ctx.fillStyle = color;
  ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
  // A soft top bevel keeps the blocks readable when stacked.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(px + 1, py + 1, CELL - 2, 4);
}

function drawBoard(canvas: HTMLCanvasElement, p: TetrisPlayerView, mine: boolean): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = TETRIS_HIDDEN_ROWS; y < TETRIS_H; y++) {
    for (let x = 0; x < TETRIS_W; x++) {
      const color = colorOf(p.grid[y]![x]!);
      if (color) drawCell(ctx, x, y, p.alive ? color : GARBAGE_COLOR);
    }
  }
  if (p.active && p.alive) {
    const color = PIECE_COLORS[p.active.kind];
    if (mine) {
      const gy = ghostY(p);
      if (gy !== p.active.y) {
        for (const [cx, cy] of PIECE_CELLS[p.active.kind][p.active.rot & 3]!) {
          drawCell(ctx, p.active.x + cx, gy + cy, color, true);
        }
      }
    }
    for (const [cx, cy] of PIECE_CELLS[p.active.kind][p.active.rot & 3]!) {
      drawCell(ctx, p.active.x + cx, p.active.y + cy, color);
    }
  }
  if (!p.alive) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function BoardCanvas({
  player,
  mine,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  player: TetrisPlayerView;
  mine: boolean;
  onPointerDown?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp?: (e: React.PointerEvent<HTMLCanvasElement>) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawBoard(ref.current, player, mine);
  }, [player, mine]);
  return (
    <canvas
      ref={ref}
      className={`tet-canvas${mine ? ' mine' : ''}`}
      width={TETRIS_W * CELL}
      height={VISIBLE_ROWS * CELL}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // A long press must never open the selection / copy-paste callout.
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/** A tiny 4×2 preview of a piece (hold box / next queue). */
function PiecePreview({ kind }: { kind: PieceKind | null }) {
  const cells = kind ? PIECE_CELLS[kind][0]! : [];
  return (
    <div className="tet-mini" aria-label={kind ?? 'empty'}>
      {Array.from({ length: 8 }, (_, i) => {
        const x = i % 4;
        const y = (i / 4) | 0;
        const on = kind && cells.some(([cx, cy]) => cx === x && cy === y);
        return (
          <i key={i} style={on ? { background: PIECE_COLORS[kind!] } : undefined} />
        );
      })}
    </div>
  );
}

// ── screen ──────────────────────────────────────────────────────────────────

export default function TetrisGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  const gesture = useRef<{
    id: number;
    x0: number;
    y0: number;
    t0: number;
    movedCells: number;
    dragged: boolean;
    /** A one-shot gesture (drop / store) already fired for this touch. */
    consumed: boolean;
  } | null>(null);
  const cssCell = useRef(24);

  const view = game && game.g === 'tetris' ? (game as TetrisView) : null;
  const me = view?.players.find((p) => p.seat === view.yourSeat) ?? null;
  const playing =
    !!view && !!me && me.alive && view.result === null && !view.paused;

  // Keyboard: ←/→ move (with auto-repeat), ↑ rotate, ↓ soft drop,
  // space hard drop, C stores/trades the piece.
  useEffect(() => {
    if (!playing) return;
    const timers = new Map<string, { delay?: number; repeat?: number }>();
    const REPEAT: Record<string, { op: TetrisOp; delay: number; every: number }> = {
      ArrowLeft: { op: 'left', delay: DAS_MS, every: ARR_MS },
      ArrowRight: { op: 'right', delay: DAS_MS, every: ARR_MS },
      ArrowDown: { op: 'soft', delay: SOFT_MS, every: SOFT_MS },
    };
    const stop = (key: string) => {
      const t = timers.get(key);
      if (t?.delay) window.clearTimeout(t.delay);
      if (t?.repeat) window.clearInterval(t.repeat);
      timers.delete(key);
    };
    const onDown = (e: KeyboardEvent) => {
      const r = REPEAT[e.key];
      if (r) {
        e.preventDefault();
        if (e.repeat || timers.has(e.key)) return;
        send(r.op);
        const entry: { delay?: number; repeat?: number } = {};
        entry.delay = window.setTimeout(() => {
          entry.repeat = window.setInterval(() => send(r.op), r.every);
        }, r.delay);
        timers.set(e.key, entry);
        return;
      }
      if (e.repeat) return;
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        send('cw');
      } else if (e.key === ' ') {
        e.preventDefault();
        send('hard');
        play('discard');
      } else if (e.key === 'c' || e.key === 'C') {
        send('hold');
        play('draw');
      }
    };
    const onUp = (e: KeyboardEvent) => stop(e.key);
    const stopAll = () => [...timers.keys()].forEach(stop);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', stopAll);
    return () => {
      stopAll();
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', stopAll);
    };
  }, [playing]);

  if (!view || !lobby || !me) return null;

  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const opponents = view.players.filter((p) => p.seat !== view.yourSeat);
  const winner = view.result?.winnerSeat ?? null;
  const winnerName =
    winner !== null ? view.players.find((p) => p.seat === winner)?.nickname : null;

  // Touch: drag sideways to move, tap to rotate, drag down to drop,
  // flick left/right to store/trade.
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing || e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    cssCell.current = e.currentTarget.getBoundingClientRect().width / TETRIS_W;
    gesture.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      t0: performance.now(),
      movedCells: 0,
      dragged: false,
      consumed: false,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.consumed) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    // Drag down → hard drop (once).
    if (!g.dragged && dy > 70 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      g.consumed = true;
      send('hard');
      play('discard');
      return;
    }
    // Swipe up → store / trade (once).
    if (!g.dragged && dy < -60 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      g.consumed = true;
      send('hold');
      play('draw');
      return;
    }
    // Sideways drag → move cell by cell.
    const targetCells = Math.trunc(dx / (cssCell.current * 0.85));
    while (g.movedCells < targetCells) {
      send('right');
      g.movedCells++;
      g.dragged = true;
    }
    while (g.movedCells > targetCells) {
      send('left');
      g.movedCells--;
      g.dragged = true;
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.id !== e.pointerId || g.consumed || !playing) return;
    const dx = e.clientX - g.x0;
    const dy = e.clientY - g.y0;
    const dt = performance.now() - g.t0;
    if (!g.dragged && dt < 260 && Math.abs(dx) < 14 && Math.abs(dy) < 14) {
      send('cw'); // tap = rotate
      return;
    }
    if (!g.dragged && dt < 260 && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) {
      send('hold'); // quick flick left/right = store / trade
      play('draw');
    }
  }

  return (
    <div className="tet">
      <div className="tet-hud">
        <div className="tet-hud-left">
          <span className="tet-hud-title">Tetris</span>
          <span className="tet-hud-status">
            Level {me.level} · {me.lines} lines · {me.score.toLocaleString()} pts
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

      <div className="tet-arena">
        <div className="tet-sidebar">
          <div className="tet-box">
            <span className="tet-box-label">Hold · C</span>
            <button className="tet-hold-btn" onClick={() => playing && send('hold')} aria-label="Store or trade piece">
              <PiecePreview kind={me.hold} />
            </button>
          </div>
          <div className="tet-box">
            <span className="tet-box-label">Next</span>
            {me.next.map((k, i) => (
              <PiecePreview key={i} kind={k} />
            ))}
          </div>
          {me.incoming > 0 && <div className="tet-incoming">⚠ {me.incoming} incoming</div>}
        </div>

        <div className="tet-main">
          <BoardCanvas
            player={me}
            mine
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          />
          {!me.alive && view.result === null && <div className="tet-dead-note">Topped out — spectating</div>}
        </div>

        {opponents.length > 0 && (
          <div className="tet-opponents">
            {opponents.map((p) => (
              <div key={p.seat} className={`tet-opp${p.alive ? '' : ' dead'}`}>
                <div className="tet-opp-name">
                  <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
                  {p.nickname}
                  <span className="tet-opp-stats">
                    L{p.level} · {p.lines}
                  </span>
                </div>
                <BoardCanvas player={p} mine={false} />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="tet-help hint">
        ←→ move · ↑ or tap rotates · ↓ soft drop · space / drag down drops · C or swipe ⇄/↑
        stores &amp; trades
      </p>

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
              {winnerName ? (
                <>
                  <IconTrophy /> {winnerName} wins!
                </>
              ) : (
                'Game over'
              )}
            </h2>
            <table className="scoreboard">
              <tbody>
                {[...view.players]
                  .sort((a, b) => b.score - a.score)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        {p.nickname}
                        {p.seat === view.yourSeat ? ' (you)' : ''}
                      </td>
                      <td className="score-wins">
                        {p.score.toLocaleString()} · {p.lines} lines · L{p.level}
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
