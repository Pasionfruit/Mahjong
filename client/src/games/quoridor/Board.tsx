import { useEffect, useMemo, useRef, useState } from 'react';
import { play } from '../../audio';
import {
  SIZE,
  WGRID,
  checkWall,
  goalRow,
  pawnMoves,
  type Move,
  type Orientation,
  type PlayerIndex,
  type Pos,
  type QuoridorState,
} from '@shared/quoridor';

/** Track units: 9 cells × 7 + 8 gutters × 2. */
const UNITS = 9 * 7 + 8 * 2; // 79
const CELL = (7 / UNITS) * 100;
const GUTTER = (2 / UNITS) * 100;
const STEP = (9 / UNITS) * 100;

const pct = (n: number) => `${n}%`;

/** Player glyphs: shape + color redundancy (colorblind-safe identities). */
export function PawnGlyph({ player }: { player: PlayerIndex }) {
  return player === 0 ? (
    <svg viewBox="0 0 24 24" className="quor-glyph" aria-hidden>
      <circle cx="12" cy="12" r="8.5" fill="var(--quor-p0)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
      <circle cx="12" cy="9.4" r="3.1" fill="rgba(255,255,255,0.4)" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="quor-glyph" aria-hidden>
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="3.4" fill="var(--quor-p1)" stroke="rgba(0,0,0,0.55)" strokeWidth="1.6" />
      <rect x="7.6" y="7.2" width="8.8" height="3.4" rx="1.7" fill="rgba(255,255,255,0.4)" />
    </svg>
  );
}

export interface BoardProps {
  game: QuoridorState;
  /** Bumped by the parent after every engine mutation. */
  version: number;
  /** True when the side to move is a human at this device. */
  interactive: boolean;
  onMove: (move: Move) => void;
  /** Flash this pawn destination as a suggested move. */
  hint: Pos | null;
  /** Winning player, for the victory pulse. */
  winner: PlayerIndex | null;
}

interface WallPreview {
  r: number;
  c: number;
  o: Orientation;
  legal: boolean;
}

export default function QuoridorBoard({ game, version, interactive, onMove, hint, winner }: BoardProps) {
  const [wallDir, setWallDir] = useState<Orientation>('h');
  const [hover, setHover] = useState<{ r: number; c: number; o: Orientation } | null>(null);
  const [pending, setPending] = useState<Move | null>(null);
  /** Keyboard wall cursor (W + arrows + Enter): a slot, or null when off. */
  const [kbSlot, setKbSlot] = useState<{ r: number; c: number } | null>(null);
  const [rejectKey, setRejectKey] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);

  const coarse = useMemo(() => window.matchMedia('(pointer: coarse)').matches, []);

  const legalPawn = useMemo(() => {
    if (!interactive || game.winner !== null) return new Set<number>();
    return new Set(pawnMoves(game, game.turn).map((p) => p.r * SIZE + p.c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, version, interactive]);

  // Keyboard controls: R rotates, Escape cancels, W opens a wall cursor that
  // the arrows steer and Enter commits — so walls are placeable without a
  // pointer. Registered once; the handler lives in a ref so it never staleness.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  keyRef.current = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setHover(null);
      setPending(null);
      setKbSlot(null);
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      rotate();
      return;
    }
    if (!interactive) return;
    if (e.key === 'w' || e.key === 'W') {
      setKbSlot((k) => (k ? null : { r: 3, c: 3 }));
      return;
    }
    if (!kbSlot) return;
    const ARROWS: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const step = ARROWS[e.key];
    if (step) {
      e.preventDefault();
      setKbSlot({
        r: Math.max(0, Math.min(WGRID - 1, kbSlot.r + step[0])),
        c: Math.max(0, Math.min(WGRID - 1, kbSlot.c + step[1])),
      });
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      tryPlaceWall(kbSlot.r, kbSlot.c, wallDir);
    }
  };

  // A new position invalidates any half-made decision.
  useEffect(() => {
    setPending(null);
    setHover(null);
    setKbSlot(null);
  }, [version]);

  /**
   * The slot to actually preview for a pointer on (r,c,o): when the exact
   * slot is geometrically taken but the anchor one step back fits, snap to
   * it — reads as the game understanding the intent.
   */
  function resolveSlot(r: number, c: number, o: Orientation): WallPreview {
    const direct = checkWall(game, game.turn, r, c, o);
    if (direct.ok) return { r, c, o, legal: true };
    if (direct.reason === 'overlap' || direct.reason === 'cross') {
      const [ar, ac] = o === 'h' ? [r, c - 1] : [r - 1, c];
      if (ar >= 0 && ac >= 0 && checkWall(game, game.turn, ar, ac, o).ok) {
        return { r: ar, c: ac, o, legal: true };
      }
    }
    return { r, c, o, legal: false };
  }

  function rotate(): void {
    const next: Orientation = wallDir === 'h' ? 'v' : 'h';
    setWallDir(next);
    // Keep any live preview in place, re-oriented.
    setHover((h) => (h ? { ...h, o: next } : h));
    setPending((p) => {
      if (!p || p.t !== 'wall') return p;
      const slot = resolveSlot(p.r, p.c, next);
      return { t: 'wall', r: slot.r, c: slot.c, o: slot.o };
    });
  }

  function tryPlaceWall(r: number, c: number, o: Orientation): void {
    const slot = resolveSlot(r, c, o);
    if (!slot.legal) {
      setRejectKey((k) => k + 1);
      play('hurt');
      return;
    }
    onMove({ t: 'wall', r: slot.r, c: slot.c, o: slot.o });
  }

  function clickSlot(r: number, c: number, o: Orientation): void {
    if (!interactive) return;
    if (coarse) {
      const slot = resolveSlot(r, c, o);
      setPending({ t: 'wall', r: slot.r, c: slot.c, o: slot.o });
      return;
    }
    tryPlaceWall(r, c, o);
  }

  function clickCell(r: number, c: number): void {
    if (!interactive || !legalPawn.has(r * SIZE + c)) return;
    if (coarse) {
      setPending({ t: 'pawn', to: { r, c } });
      return;
    }
    onMove({ t: 'pawn', to: { r, c } });
  }

  function confirmPending(): void {
    if (!pending) return;
    const move = pending;
    setPending(null);
    if (move.t === 'pawn') onMove(move);
    else tryPlaceWall(move.r, move.c, move.o);
  }

  // What wall ghost to draw: touch pending, then keyboard cursor, then hover.
  let preview: WallPreview | null = null;
  if (pending?.t === 'wall') {
    preview = { ...resolveSlot(pending.r, pending.c, pending.o) };
  } else if (kbSlot && interactive) {
    preview = resolveSlot(kbSlot.r, kbSlot.c, wallDir);
  } else if (hover && interactive && !coarse) {
    preview = resolveSlot(hover.r, hover.c, hover.o);
  }

  const cells = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const legal = legalPawn.has(r * SIZE + c);
      const isHint = hint?.r === r && hint?.c === c;
      const pendingHere = pending?.t === 'pawn' && pending.to.r === r && pending.to.c === c;
      cells.push(
        <button
          key={`c${r}-${c}`}
          className={[
            'quor-cell',
            legal ? 'legal' : '',
            isHint ? 'hint' : '',
            pendingHere ? 'pending' : '',
            r === goalRow(0) || r === goalRow(1) ? 'goal' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ gridRow: r * 2 + 1, gridColumn: c * 2 + 1 }}
          onClick={() => clickCell(r, c)}
          aria-label={`cell ${String.fromCharCode(97 + c)}${r + 1}${legal ? ' (legal move)' : ''}`}
          tabIndex={legal ? 0 : -1}
        />,
      );
    }
  }

  const slots = [];
  for (let r = 0; r < WGRID; r++) {
    for (let c = 0; c < WGRID; c++) {
      slots.push(
        <button
          key={`h${r}-${c}`}
          className="quor-slot quor-slot-h"
          style={{ gridRow: r * 2 + 2, gridColumn: `${c * 2 + 1} / span 3` }}
          tabIndex={-1}
          aria-label={`wall slot ${String.fromCharCode(97 + c)}${r + 1} horizontal`}
          onMouseEnter={() => setHover({ r, c, o: 'h' })}
          onMouseLeave={() => setHover((h) => (h?.r === r && h.c === c && h.o === 'h' ? null : h))}
          onClick={() => clickSlot(r, c, 'h')}
        />,
        <button
          key={`v${r}-${c}`}
          className="quor-slot quor-slot-v"
          style={{ gridColumn: c * 2 + 2, gridRow: `${r * 2 + 1} / span 3` }}
          tabIndex={-1}
          aria-label={`wall slot ${String.fromCharCode(97 + c)}${r + 1} vertical`}
          onMouseEnter={() => setHover({ r, c, o: 'v' })}
          onMouseLeave={() => setHover((h) => (h?.r === r && h.c === c && h.o === 'v' ? null : h))}
          onClick={() => clickSlot(r, c, 'v')}
        />,
      );
    }
  }

  const wallPieces = [];
  for (let i = 0; i < WGRID * WGRID; i++) {
    const r = (i / WGRID) | 0;
    const c = i % WGRID;
    if (game.hWalls[i] === 1) {
      wallPieces.push(
        <div
          key={`wh${i}`}
          className="quor-wall h"
          style={{
            left: pct(c * STEP),
            top: pct(r * STEP + CELL),
            width: pct(CELL * 2 + GUTTER),
            height: pct(GUTTER),
          }}
        />,
      );
    }
    if (game.vWalls[i] === 1) {
      wallPieces.push(
        <div
          key={`wv${i}`}
          className="quor-wall v"
          style={{
            left: pct(c * STEP + CELL),
            top: pct(r * STEP),
            width: pct(GUTTER),
            height: pct(CELL * 2 + GUTTER),
          }}
        />,
      );
    }
  }

  return (
    <div className="quor-board-wrap">
      <div
        ref={boardRef}
        className="quor-board"
        data-walldir={interactive ? wallDir : 'none'}
        onContextMenu={(e) => {
          e.preventDefault();
          if (interactive) rotate();
        }}
      >
        {cells}
        {slots}
        <div className="quor-overlay">
          {wallPieces}
          {preview && (
            <div
              key={`p${rejectKey}`}
              className={`quor-wall preview ${preview.o}${preview.legal ? '' : ' illegal rejected'}`}
              style={
                preview.o === 'h'
                  ? {
                      left: pct(preview.c * STEP),
                      top: pct(preview.r * STEP + CELL),
                      width: pct(CELL * 2 + GUTTER),
                      height: pct(GUTTER),
                    }
                  : {
                      left: pct(preview.c * STEP + CELL),
                      top: pct(preview.r * STEP),
                      width: pct(GUTTER),
                      height: pct(CELL * 2 + GUTTER),
                    }
              }
            />
          )}
          {pending?.t === 'pawn' && (
            <div
              className="quor-pawn ghost"
              style={{
                width: pct(CELL),
                height: pct(CELL),
                transform: `translate(${(pending.to.c * STEP * 100) / CELL}%, ${(pending.to.r * STEP * 100) / CELL}%)`,
              }}
            >
              <PawnGlyph player={game.turn} />
            </div>
          )}
          {([0, 1] as const).map((p) => (
            <div
              key={p}
              className={`quor-pawn${winner === p ? ' winner' : ''}`}
              style={{
                width: pct(CELL),
                height: pct(CELL),
                transform: `translate(${(game.pawns[p].c * STEP * 100) / CELL}%, ${(game.pawns[p].r * STEP * 100) / CELL}%)`,
              }}
            >
              <PawnGlyph player={p} />
            </div>
          ))}
        </div>
      </div>

      {coarse && interactive && (
        <div className={`quor-confirm${pending ? '' : ' hidden'}`}>
          <button className="btn btn-primary" onClick={confirmPending}>
            ✓ {pending?.t === 'wall' ? 'Place wall' : 'Move here'}
          </button>
          {pending?.t === 'wall' && (
            <button className="btn" onClick={rotate}>
              ⤢ Rotate
            </button>
          )}
          <button className="btn" aria-label="Cancel" onClick={() => setPending(null)}>
            ✕
          </button>
        </div>
      )}
      {interactive && !coarse && (
        <p className="quor-help hint">
          Click a highlighted square to move · hover a gap and click to wall ·{' '}
          <kbd>R</kbd>/right-click rotates · <kbd>W</kbd>+arrows+<kbd>Enter</kbd> walls by keyboard ·{' '}
          <kbd>Esc</kbd> cancels
        </p>
      )}
    </div>
  );
}
