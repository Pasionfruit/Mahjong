import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BG_SIZE,
  bgCellKey,
  type BananagramsAction,
  type BananagramsView,
  type BgPlacedTile,
} from '@shared/bananagrams';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import VolumeControl from '../../components/VolumeControl';
import { IconMenu, IconPause } from '../../components/icons';
import './styles.css';

/** What the player has tapped and is about to move: a tray tile or a placed one. */
type Selection = { from: 'tray' | 'board'; tileId: number } | null;

/** An opponent's board occupancy, letters hidden — tiny filled squares. */
function Silhouette({ cells }: { cells: number[] }) {
  return (
    <svg className="banana-sil" viewBox={`0 0 ${BG_SIZE} ${BG_SIZE}`} aria-hidden="true">
      {cells.map((k) => (
        <rect
          key={k}
          x={(k % BG_SIZE) + 0.08}
          y={Math.floor(k / BG_SIZE) + 0.08}
          width={0.84}
          height={0.84}
          rx={0.18}
        />
      ))}
    </svg>
  );
}

/** A fully revealed board (round end): tiles with letters, cropped to fit. */
function RevealedBoard({ tiles }: { tiles: BgPlacedTile[] }) {
  if (tiles.length === 0) return <p className="hint">No tiles placed</p>;
  let minX = BG_SIZE;
  let minY = BG_SIZE;
  let maxX = 0;
  let maxY = 0;
  for (const t of tiles) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x);
    maxY = Math.max(maxY, t.y);
  }
  const pad = 0.35;
  const w = maxX - minX + 1 + pad * 2;
  const h = maxY - minY + 1 + pad * 2;
  return (
    <svg
      className="banana-board-svg"
      viewBox={`${minX - pad} ${minY - pad} ${w} ${h}`}
      style={{ aspectRatio: `${w} / ${h}` }}
    >
      {tiles.map((t) => (
        <g key={t.id}>
          <rect x={t.x + 0.05} y={t.y + 0.05} width={0.9} height={0.9} rx={0.14} />
          <text x={t.x + 0.5} y={t.y + 0.54}>
            {t.letter}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function BananagramsGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const log = useStore((s) => s.log);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sel, setSel] = useState<Selection>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [eventBanner, setEventBanner] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const eventTimer = useRef<number | undefined>(undefined);

  const view = game && game.g === 'bananagrams' ? (game as BananagramsView) : null;
  const you = view?.you ?? null;
  const playing = !!view && !!you && view.result === null && !view.paused;

  // Peel / dump announcements ride the shared event log.
  const lastEvent = log.length > 0 ? log[log.length - 1] : undefined;
  useEffect(() => {
    if (!lastEvent || !view) return;
    let msg: string | null = null;
    if (lastEvent.t === 'peel') {
      const name = view.players.find((p) => p.seat === lastEvent.seat)?.nickname ?? 'Someone';
      msg = `🍌 PEEL! ${name} used every tile — everyone draws`;
    } else if (lastEvent.t === 'dump') {
      const name = view.players.find((p) => p.seat === lastEvent.seat)?.nickname ?? 'Someone';
      msg = `${name} dumped`;
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

  // A round reset (or losing the tile we held) must not keep a stale selection.
  useEffect(() => {
    if (!sel || !you) return;
    const pool = sel.from === 'tray' ? you.tray : you.board;
    if (!pool.some((t) => t.id === sel.tileId)) setSel(null);
  }, [sel, you]);

  const byCell = useMemo(() => {
    const m = new Map<number, BgPlacedTile>();
    if (you) for (const t of you.board) m.set(bgCellKey(t.x, t.y), t);
    return m;
  }, [you]);
  const invalid = useMemo(() => new Set(you?.invalidCells ?? []), [you]);

  if (!view || !lobby) return null;

  const me = view.players.find((p) => p.seat === view.yourSeat) ?? null;
  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const opponents = view.players.filter((p) => p.seat !== view.yourSeat);
  const winnerName =
    view.result !== null
      ? (view.players.find((p) => p.seat === view.result!.winnerSeat)?.nickname ?? 'Someone')
      : null;

  function showToast(msg: string): void {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }

  function act(a: BananagramsAction): void {
    void sendAction(a).then((r) => {
      if (!r.ok) showToast(r.error);
    });
  }

  function onTrayTile(tileId: number): void {
    if (!playing) return;
    setSel(sel?.from === 'tray' && sel.tileId === tileId ? null : { from: 'tray', tileId });
  }

  function onCell(x: number, y: number, placed: BgPlacedTile | undefined): void {
    if (!playing) return;
    if (placed) {
      // Tapping your placed tile selects it; tapping it again deselects.
      setSel(
        sel?.from === 'board' && sel.tileId === placed.id
          ? null
          : { from: 'board', tileId: placed.id },
      );
      return;
    }
    if (!sel) return;
    act({ t: 'bg', op: 'place', tileId: sel.tileId, x, y });
    setSel(null);
  }

  function recallSelected(): void {
    if (!playing || sel?.from !== 'board') return;
    act({ t: 'bg', op: 'recall', tileId: sel.tileId });
    setSel(null);
  }

  /** Tapping empty tray space recalls a selected board tile (or just deselects). */
  function onTrayArea(): void {
    if (!playing) return;
    if (sel?.from === 'board') recallSelected();
    else setSel(null);
  }

  function dumpSelected(): void {
    if (!playing || sel?.from !== 'tray' || !view?.canDump) return;
    act({ t: 'bg', op: 'dump', tileId: sel.tileId });
    setSel(null);
  }

  /** Slide every placed tile one cell — frees room to grow the grid. */
  function shiftBoard(dx: number, dy: number): void {
    if (!playing || !you || you.board.length === 0) return;
    act({ t: 'bg', op: 'shift', dx, dy });
  }

  const boardStyle = {
    '--bg-n': BG_SIZE,
    gridTemplateColumns: `repeat(${BG_SIZE}, var(--bg-cell))`,
  } as React.CSSProperties;

  const boardCells: React.ReactNode[] = [];
  if (you) {
    for (let y = 0; y < BG_SIZE; y++) {
      for (let x = 0; x < BG_SIZE; x++) {
        const key = bgCellKey(x, y);
        const placed = byCell.get(key);
        const isSel = !!placed && sel?.from === 'board' && sel.tileId === placed.id;
        const cls = placed
          ? `banana-cell banana-tile${invalid.has(key) ? ' bad' : ''}${isSel ? ' sel' : ''}`
          : 'banana-cell';
        boardCells.push(
          <button
            key={key}
            className={cls}
            onClick={() => onCell(x, y, placed)}
            aria-label={placed ? `Tile ${placed.letter}` : `Empty cell ${x + 1},${y + 1}`}
          >
            {placed?.letter ?? ''}
          </button>,
        );
      }
    }
  }

  return (
    <div className="banana">
      <div className="banana-hud">
        <div className="banana-hud-left">
          <span className="banana-hud-title">Bananagrams</span>
          <span className="banana-hud-status">
            Round {view.round} · your peels {me?.peels ?? 0}
          </span>
        </div>
        <div className="banana-bunch" title="Tiles left in the bunch">
          🍌 <b>{view.bunchCount}</b>
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
                  <button
                    className="btn"
                    onClick={() => void resumeGame().then(() => setMenuOpen(false))}
                  >
                    Resume
                  </button>
                ) : (
                  <button
                    className="btn"
                    onClick={() => void pauseGame().then(() => setMenuOpen(false))}
                  >
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

      {opponents.length > 0 && (
        <div className="banana-opps">
          {opponents.map((p) => (
            <div key={p.seat} className={`banana-opp${p.connected ? '' : ' off'}`}>
              <div className="banana-opp-name">
                <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
                <span className="banana-opp-nick">{p.nickname}</span>
                <span className="banana-opp-count" title="Tiles in tray">
                  {p.trayCount}
                </span>
              </div>
              <Silhouette cells={p.silhouette ?? []} />
              <div className="banana-opp-badges">🍌 {p.peels} peels</div>
            </div>
          ))}
        </div>
      )}

      {you ? (
        <>
          {!you.connected && you.board.length > 0 && (
            <div className="banana-warn">Connect all your words into one grid!</div>
          )}
          {you.connected && invalid.size > 0 && (
            <div className="banana-warn bad">Some words aren't valid — fix the red tiles.</div>
          )}
          {you.ready && <div className="banana-ready">✓ Grid complete — all words valid!</div>}

          <div className="banana-board-wrap">
            <div className="banana-board" style={boardStyle}>
              {boardCells}
            </div>
          </div>

          {you.board.length > 0 && (
            <div className="banana-shift" aria-label="Move all placed tiles">
              <span className="banana-shift-label">Move all</span>
              <button className="btn banana-shift-btn" onClick={() => shiftBoard(-1, 0)} aria-label="Move all tiles left">
                ←
              </button>
              <button className="btn banana-shift-btn" onClick={() => shiftBoard(0, -1)} aria-label="Move all tiles up">
                ↑
              </button>
              <button className="btn banana-shift-btn" onClick={() => shiftBoard(0, 1)} aria-label="Move all tiles down">
                ↓
              </button>
              <button className="btn banana-shift-btn" onClick={() => shiftBoard(1, 0)} aria-label="Move all tiles right">
                →
              </button>
            </div>
          )}

          <div className="banana-tray-box" onClick={onTrayArea}>
            <span className="banana-tray-label">Tray · {you.tray.length}</span>
            <div className="banana-tray">
              {you.tray.map((t) => (
                <button
                  key={t.id}
                  className={`banana-tile banana-tray-tile${
                    sel?.from === 'tray' && sel.tileId === t.id ? ' sel' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTrayTile(t.id);
                  }}
                >
                  {t.letter}
                </button>
              ))}
              {you.tray.length === 0 && <span className="hint">Tray empty</span>}
            </div>
          </div>

          <div className="banana-actions">
            <button className="btn" disabled={sel?.from !== 'board' || !playing} onClick={recallSelected}>
              Recall
            </button>
            <button
              className="btn btn-primary"
              disabled={sel?.from !== 'tray' || !view.canDump || !playing}
              onClick={dumpSelected}
            >
              Dump 1 → 3 🍌
            </button>
          </div>
          <p className="banana-help hint">
            Tap a tile, then tap a square to place it. Tap a placed tile to move or recall it.
          </p>
        </>
      ) : (
        <p className="hint banana-spectate">You're on the bench — watching this round.</p>
      )}

      {eventBanner && <div className="banana-event">{eventBanner}</div>}
      {toast && <div className="banana-toast">{toast}</div>}

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
          <div className="overlay-card banana-result-card">
            <h2>🍌 BANANAS! {winnerName} wins!</h2>
            <div className="banana-reveal">
              <RevealedBoard
                tiles={
                  view.result.boards.find((b) => b.seat === view.result!.winnerSeat)?.tiles ?? []
                }
              />
            </div>
            {view.result.boards.some((b) => b.seat !== view.result!.winnerSeat) && (
              <div className="banana-others">
                {view.result.boards
                  .filter((b) => b.seat !== view.result!.winnerSeat)
                  .map((b) => (
                    <div key={b.seat} className="banana-other">
                      <span className="banana-other-name">
                        {view.players.find((p) => p.seat === b.seat)?.nickname ?? `Seat ${b.seat}`}
                      </span>
                      <RevealedBoard tiles={b.tiles} />
                    </div>
                  ))}
              </div>
            )}
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
                      <td className="score-wins">
                        {p.wins} {p.wins === 1 ? 'win' : 'wins'}
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
