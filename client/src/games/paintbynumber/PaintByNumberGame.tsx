import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { SIZE, paintByNumberModule, type PaintByNumberMove } from './engine';
import './styles.css';

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export default function PaintByNumberGame() {
  const { mode, seed, state, status, result, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(paintByNumberModule, () => undefined);
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [selected, setSelected] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Serialize move application: useSoloGame's move() closes over the render
  // it was created in, so a fast drag firing several paints per frame could
  // otherwise apply against stale state and drop fills. Each queued paint
  // awaits the previous one plus a macrotask (letting React flush and
  // moveRef pick up the fresh closure) before running.
  const moveRef = useRef(move);
  moveRef.current = move;
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  // One mistake per cell per stroke: the visited set lives for one pointer
  // stroke, so dragging back and forth over a wrong cell ticks it once.
  const strokeRef = useRef<{ pointerId: number; visited: Set<number> } | null>(null);

  const playing = status === 'playing';

  useEffect(() => {
    setSelected(0);
    strokeRef.current = null;
  }, [seed]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [playing]);

  const counts = useMemo(() => {
    if (!state) return [];
    const total = state.palette.map(() => 0);
    const done = state.palette.map(() => 0);
    state.target.forEach((t, i) => {
      if (t === null) return;
      total[t] = (total[t] ?? 0) + 1;
      if (state.painted[i] !== null) done[t] = (done[t] ?? 0) + 1;
    });
    return state.palette.map((_, k) => (total[k] ?? 0) - (done[k] ?? 0));
  }, [state]);

  if (!state) return null;

  const elapsedMs =
    state.firstMoveAt === null
      ? 0
      : result
        ? result.score
        : Math.max(0, now - state.firstMoveAt);

  function enqueueMove(m: PaintByNumberMove) {
    queueRef.current = queueRef.current
      .then(async () => {
        await moveRef.current(m);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      })
      .catch(() => undefined);
  }

  function cellFromEvent(e: PointerEvent): number | null {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!(el instanceof HTMLElement)) return null;
    const attr = el.dataset['cell'];
    if (attr === undefined) return null;
    const idx = Number(attr);
    return Number.isInteger(idx) ? idx : null;
  }

  function tryPaint(cell: number | null) {
    if (cell === null || !state || !playing) return;
    const stroke = strokeRef.current;
    if (stroke) {
      if (stroke.visited.has(cell)) return;
      stroke.visited.add(cell);
    }
    if (state.target[cell] === null) return; // background — nothing to do
    if (state.painted[cell] !== null) return; // already done (best-effort skip)
    enqueueMove({ cell, color: selected, at: Date.now() });
  }

  function onBoardPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!playing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    strokeRef.current = { pointerId: e.pointerId, visited: new Set() };
    tryPaint(cellFromEvent(e));
  }

  function onBoardPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (strokeRef.current?.pointerId !== e.pointerId) return;
    tryPaint(cellFromEvent(e));
  }

  function onBoardPointerEnd(e: PointerEvent<HTMLDivElement>) {
    if (strokeRef.current?.pointerId === e.pointerId) strokeRef.current = null;
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🎨 Paint by Number</h1>
        {mode === 'daily' && streak.streak > 0 && (
          <p className="hint arcade-head">🔥 {streak.streak} day streak</p>
        )}

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => {
              setView('play');
              void start('daily');
            }}
          >
            Today's Page
          </button>
          <button
            className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`}
            onClick={() => {
              setView('play');
              void start('endless', { fresh: true });
            }}
          >
            Endless
          </button>
          <button
            className={`arcade-tab${view === 'leaderboard' ? ' active' : ''}`}
            onClick={() => setView('leaderboard')}
          >
            🏆 Leaderboard
          </button>
        </div>

        {view === 'leaderboard' ? (
          <div className="arcade-leaderboard-view">
            <h3>All-Time Fastest (Endless)</h3>
            <LeaderboardPanel
              gameId="paintbynumber"
              mode="endless"
              dateKey={dateKeyUTC()}
              ascending
              formatScore={formatTime}
            />
            <h3>🔥 Longest Daily Streaks</h3>
            <LeaderboardPanel gameId="paintbynumber" mode="streak" dateKey={dateKeyUTC()} ascending={false} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="paintbynumber-hud">
              <span>⏱ {formatTime(elapsedMs)}</span>
              <span>✗ {state.mistakes} mistake{state.mistakes === 1 ? '' : 's'}</span>
            </div>
            <p className="hint paintbynumber-hint">
              Pick a color, then tap or drag across the matching numbers.
            </p>

            <div
              className={`paintbynumber-board${status === 'won' ? ' paintbynumber-celebrate' : ''}`}
              onPointerDown={onBoardPointerDown}
              onPointerMove={onBoardPointerMove}
              onPointerUp={onBoardPointerEnd}
              onPointerCancel={onBoardPointerEnd}
              style={{ '--pbn-size': SIZE } as CSSProperties}
            >
              {state.target.map((t, i) => {
                if (t === null) {
                  return <div key={i} className="paintbynumber-cell paintbynumber-cell-bg" />;
                }
                const done = state.painted[i] !== null;
                return (
                  <div
                    key={i}
                    data-cell={i}
                    className={`paintbynumber-cell ${done ? 'paintbynumber-cell-done' : 'paintbynumber-cell-open'}`}
                    style={done ? ({ '--pbn-color': state.palette[t] ?? '' } as CSSProperties) : undefined}
                  >
                    {t + 1}
                  </div>
                );
              })}
            </div>

            <div className="paintbynumber-palette">
              {state.palette.map((color, k) => {
                const remaining = counts[k] ?? 0;
                const cls = [
                  'paintbynumber-color',
                  selected === k ? 'selected' : '',
                  remaining === 0 ? 'complete' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button key={k} className={cls} onClick={() => setSelected(k)} disabled={!playing}>
                    <span className="paintbynumber-swatch" style={{ background: color }} />
                    <span className="paintbynumber-color-num">{k + 1}</span>
                    <span className="paintbynumber-color-count">{remaining === 0 ? '✓' : remaining}</span>
                  </button>
                );
              })}
            </div>

            {status === 'won' && (
              <div className="paintbynumber-result">
                <h2>Beautiful! 🎉 Finished in {formatTime(result?.score ?? 0)}</h2>
                <p className="hint">
                  {result?.stats?.mistakes ?? 0} mistake{(result?.stats?.mistakes ?? 0) === 1 ? '' : 's'} ·{' '}
                  {result?.stats?.colors} colors
                </p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>{mode === 'daily' ? "Today's Fastest" : 'All-Time Fastest'}</h3>
                <LeaderboardPanel
                  gameId="paintbynumber"
                  mode={mode}
                  dateKey={dateKeyUTC()}
                  ascending
                  formatScore={formatTime}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">{dailyDoneToday ? 'Come back tomorrow for a new page!' : ''}</p>
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
