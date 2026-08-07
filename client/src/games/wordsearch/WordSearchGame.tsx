import { useMemo, useRef, useState, type PointerEvent } from 'react';
import AuthWidget from '../../arcade/ui/AuthWidget';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { GRID_SIZE, wordSearchModule } from './engine';

interface Cell {
  row: number;
  col: number;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

function cellKey(c: Cell): string {
  return `${c.row},${c.col}`;
}

/** The straight-line path between two cells, inclusive — null if they
 *  don't form a horizontal/vertical/45° line. Purely for the live drag
 *  highlight; the engine does its own independent validation on release. */
function lineBetween(a: Cell, b: Cell): Cell[] | null {
  const dr = b.row - a.row;
  const dc = b.col - a.col;
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  const len = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  return Array.from({ length: len }, (_, i) => ({ row: a.row + stepR * i, col: a.col + stepC * i }));
}

export default function WordSearchGame() {
  const { mode, state, status, result, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(wordSearchModule, () => undefined);
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [dragStart, setDragStart] = useState<Cell | null>(null);
  const [dragEnd, setDragEnd] = useState<Cell | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const playing = status === 'playing';

  const foundCellKeys = useMemo(() => {
    if (!state) return new Set<string>();
    const keys = new Set<string>();
    for (const w of state.puzzle.words) {
      if (!state.found.includes(w.word)) continue;
      for (let i = 0; i < w.word.length; i++) keys.add(cellKey({ row: w.row + w.dRow * i, col: w.col + w.dCol * i }));
    }
    return keys;
  }, [state]);

  const dragCellKeys = useMemo(() => {
    if (!dragStart || !dragEnd) return new Set<string>();
    const line = lineBetween(dragStart, dragEnd);
    return new Set((line ?? [dragStart]).map(cellKey));
  }, [dragStart, dragEnd]);

  if (!state) return null;

  function cellFromPoint(clientX: number, clientY: number): Cell | null {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const col = Math.floor(((clientX - rect.left) / rect.width) * GRID_SIZE);
    const row = Math.floor(((clientY - rect.top) / rect.height) * GRID_SIZE);
    if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
    return { row, col };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!playing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell) {
      setDragStart(cell);
      setDragEnd(cell);
    }
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragStart) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    if (cell) setDragEnd(cell);
  }

  function onPointerUp() {
    if (dragStart && dragEnd) {
      void move({ startRow: dragStart.row, startCol: dragStart.col, endRow: dragEnd.row, endCol: dragEnd.col, at: Date.now() });
    }
    setDragStart(null);
    setDragEnd(null);
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🔍 Word Search</h1>
        {mode === 'daily' && streak.streak > 0 && (
          <p className="hint arcade-head">🔥 {streak.streak} day streak</p>
        )}

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('daily'); }}
          >
            Today's Puzzle
          </button>
          <button
            className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('endless', { fresh: true }); }}
          >
            Endless
          </button>
        </div>

        {(
          <>
            <div
              ref={gridRef}
              className="wordsearch-grid"
              style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {state.puzzle.grid.map((letter, i) => {
                const row = Math.floor(i / GRID_SIZE);
                const col = i % GRID_SIZE;
                const key = cellKey({ row, col });
                const cls = [
                  'wordsearch-cell',
                  foundCellKeys.has(key) ? 'wordsearch-cell-found' : '',
                  dragCellKeys.has(key) ? 'wordsearch-cell-selecting' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={i} className={cls}>
                    {letter.toUpperCase()}
                  </div>
                );
              })}
            </div>

            <div className="wordsearch-words">
              {state.puzzle.words.map((w) => (
                <span key={w.word} className={`wordsearch-word${state.found.includes(w.word) ? ' found' : ''}`}>
                  {w.word}
                </span>
              ))}
            </div>

            {!playing && (
              <div className="wordsearch-result">
                <h2>All words found in {formatTime(result?.score ?? 0)}! 🎉</h2>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">{dailyDoneToday ? 'Come back tomorrow for a new puzzle!' : ''}</p>
                  ) : (
                    <button className="btn btn-primary" onClick={() => void start('endless', { fresh: true })}>
                      Play again
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <button className="btn arcade-leave" onClick={() => useStore.getState().setLocalGame(null)}>
          Back
        </button>
      </div>
    </div>
  );
}
