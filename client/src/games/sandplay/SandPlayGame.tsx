import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ensureSignedIn } from '../../arcade/auth';
import { dailySeed, dateKeyUTC } from '../../arcade/dailySeed';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useStore } from '../../store';
import {
  SAND_COLS,
  SAND_ROWS,
  countByColor,
  drainBottomRow,
  generateLevel,
  isCleared,
  simulateStep,
  type Level,
  type SandGrid,
} from './engine';

const CELL = 4;
const TICK_MS = 40;
const GAME_ID = 'sandplay';

type Mode = 'daily' | 'endless';
type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

function redraw(ctx: CanvasRenderingContext2D, grid: SandGrid) {
  ctx.fillStyle = '#0b1f17';
  ctx.fillRect(0, 0, SAND_COLS * CELL, SAND_ROWS * CELL);
  for (let row = 0; row < SAND_ROWS; row++) {
    for (let col = 0; col < SAND_COLS; col++) {
      const color = grid[row * SAND_COLS + col];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }
}

export default function SandPlayGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [view, setView] = useState<View>('play');
  const [level, setLevel] = useState<Level>(() => generateLevel(dailySeed(GAME_ID, dateKeyUTC())));

  const gridRef = useRef<SandGrid>(level.grid);
  const activeColorRef = useRef<string | null>(null);
  const clearedRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());

  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [signedIn, setSignedIn] = useState(false);
  const [sync, setSync] = useState<SyncBadge>('idle');

  useEffect(() => {
    void ensureSignedIn().then((u) => setSignedIn(!!u));
    return startAutoSync();
  }, []);

  useEffect(() => {
    activeColorRef.current = activeColor;
  }, [activeColor]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) redraw(ctx, gridRef.current);
  };

  // (Re)start whenever a new level is generated.
  useEffect(() => {
    gridRef.current = level.grid;
    activeColorRef.current = null;
    clearedRef.current = false;
    startTimeRef.current = Date.now();
    setActiveColor(null);
    setCleared(false);
    setElapsedMs(0);
    setCounts(countByColor(level.grid, level.colors));
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (clearedRef.current) return;
      gridRef.current = simulateStep(gridRef.current);
      const drain = drainBottomRow(gridRef.current, activeColorRef.current);
      gridRef.current = drain.grid;
      draw();
      setElapsedMs(Date.now() - startTimeRef.current);
      setCounts(countByColor(gridRef.current, level.colors));
      if (!clearedRef.current && isCleared(gridRef.current)) {
        clearedRef.current = true;
        setCleared(true);
        void finishLevel();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  async function finishLevel() {
    const elapsed = Date.now() - startTimeRef.current;
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode,
      dateKey: mode === 'daily' ? dateKeyUTC() : null,
      score: elapsed,
      stats: { time: Math.round(elapsed / 100) / 10, colors: level.colors.length },
      moveLog: [],
      completedAt: new Date().toISOString(),
    });
    await flushOutbox();
    const stillQueued = (await getUnsyncedResults()).some((r) => r.id === row.id);
    setSync(stillQueued ? 'queued' : 'synced');
  }

  async function forceSync() {
    setSync('saving');
    await flushOutbox();
    const unsynced = await getUnsyncedResults();
    setSync(unsynced.length > 0 ? 'queued' : 'synced');
  }

  function startMode(nextMode: Mode) {
    setMode(nextMode);
    setView('play');
    setSync('idle');
    const seed = nextMode === 'daily' ? dailySeed(GAME_ID, dateKeyUTC()) : randomSeed();
    setLevel(generateLevel(seed));
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🪣 Sand Sort</h1>
        <p className="hint arcade-head">
          {signedIn ? '✓ signed in' : 'signing in…'} · Open a bucket to drain that color. Clear the sand to win.
        </p>

        <div className="arcade-tabs">
          <button className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`} onClick={() => startMode('daily')}>
            Today's Level
          </button>
          <button className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`} onClick={() => startMode('endless')}>
            Endless
          </button>
          <button className={`arcade-tab${view === 'leaderboard' ? ' active' : ''}`} onClick={() => setView('leaderboard')}>
            🏆 Leaderboard
          </button>
        </div>

        {view === 'leaderboard' ? (
          <div className="arcade-leaderboard-view">
            <h3>All-Time Fastest (Endless)</h3>
            <LeaderboardPanel gameId={GAME_ID} mode="endless" dateKey={dateKeyUTC()} ascending formatScore={formatTime} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="sandsort-timer">⏱ {formatTime(elapsedMs)}</p>

            <canvas ref={canvasRef} className="sandplay-canvas" width={SAND_COLS * CELL} height={SAND_ROWS * CELL} />

            <div className="sandsort-buckets">
              {level.colors.map((c) => (
                <button
                  key={c}
                  className={`sandsort-bucket${activeColor === c ? ' active' : ''}`}
                  style={{ '--bucket-color': c } as CSSProperties}
                  onClick={() => setActiveColor(c)}
                  disabled={cleared}
                >
                  <span className="sandsort-bucket-swatch" style={{ background: c }} />
                  <span className="sandsort-bucket-count">{counts[c] ?? 0}</span>
                </button>
              ))}
            </div>

            {cleared && (
              <div className="sandsort-result">
                <h2>Cleared in {formatTime(elapsedMs)}! 🎉</h2>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>{mode === 'daily' ? "Today's Fastest" : 'All-Time Fastest'}</h3>
                <LeaderboardPanel
                  gameId={GAME_ID}
                  mode={mode}
                  dateKey={dateKeyUTC()}
                  ascending
                  formatScore={formatTime}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">Come back tomorrow for a new level!</p>
                  ) : (
                    <button className="btn btn-primary" onClick={() => startMode('endless')}>
                      Next level
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

