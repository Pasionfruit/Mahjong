import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ensureSignedIn } from '../../arcade/auth';
import { dailySeed, dateKeyUTC } from '../../arcade/dailySeed';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import Countdown from '../../components/Countdown';
import { useStore } from '../../store';
import {
  FUNNEL_TOP_ROW,
  SAND_COLS,
  SAND_ROWS,
  countByColor,
  drainBottomRow,
  funnelInset,
  funnelMouth,
  generateLevel,
  isCleared,
  isSettled,
  simulateStep,
  type Level,
  type SandGrid,
} from './engine';

const CELL = 6;
const TICK_MS = 40;
const GAME_ID = 'sandplay';

/** Extra canvas rows drawn BELOW the grid: the gap the drained grains fall
 *  through, plus the collecting bucket. Not part of the simulation. */
const CHUTE_ROWS = 8;
const BUCKET_ROWS = 12;
const EXTRA_ROWS = CHUTE_ROWS + BUCKET_ROWS;
const CANVAS_ROWS = SAND_ROWS + EXTRA_ROWS;

/** One drained grain, animating from the funnel mouth into the bucket. */
interface FallingGrain {
  x: number; // grid columns (fractional)
  y: number; // grid rows (fractional), starting at SAND_ROWS
  vy: number;
  color: string;
}

type Mode = 'daily' | 'endless';
type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

function redraw(
  ctx: CanvasRenderingContext2D,
  grid: SandGrid,
  falling: FallingGrain[],
  collected: Record<string, number>,
  activeColor: string | null,
) {
  const W = SAND_COLS * CELL;
  // Neutral dark slate (not green): every palette hue has to pop off it.
  ctx.fillStyle = '#131a24';
  ctx.fillRect(0, 0, W, CANVAS_ROWS * CELL);

  // ── funnel walls: one filled path down each side, so the taper reads as
  // a solid hopper rather than a staircase of individual cells.
  ctx.fillStyle = '#2b3d50';
  for (const side of ['left', 'right'] as const) {
    ctx.beginPath();
    ctx.moveTo(side === 'left' ? 0 : W, FUNNEL_TOP_ROW * CELL);
    for (let row = FUNNEL_TOP_ROW; row < SAND_ROWS; row++) {
      const inset = funnelInset(row) * CELL;
      ctx.lineTo(side === 'left' ? inset : W - inset, row * CELL);
    }
    ctx.lineTo(side === 'left' ? 0 : W, SAND_ROWS * CELL);
    ctx.closePath();
    ctx.fill();
  }

  // ── the sand itself
  for (let row = 0; row < SAND_ROWS; row++) {
    for (let col = 0; col < SAND_COLS; col++) {
      const color = grid[row * SAND_COLS + col];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
  }

  // ── grains in flight between the mouth and the bucket
  for (const g of falling) {
    ctx.fillStyle = g.color;
    ctx.fillRect(g.x * CELL, g.y * CELL, CELL, CELL);
  }

  // ── the bucket
  const bucketTop = (SAND_ROWS + CHUTE_ROWS) * CELL;
  const bucketH = BUCKET_ROWS * CELL;
  const bucketW = W * 0.42;
  const bucketX = (W - bucketW) / 2;
  // Contents first, so the rim strokes over them.
  const total = Object.values(collected).reduce((a, b) => a + b, 0);
  if (total > 0) {
    // Fill proportionally, capped so a long run doesn't overflow the pail.
    const fillFrac = Math.min(1, total / 260);
    const fillH = (bucketH - 4) * fillFrac;
    let y = bucketTop + bucketH - 2 - fillH;
    for (const [color, n] of Object.entries(collected)) {
      if (n <= 0) continue;
      const h = fillH * (n / total);
      // Taper the contents with the bucket's own walls.
      const t = (y - bucketTop) / bucketH;
      const halfTop = (bucketW / 2) * (1 - 0.18 * t);
      ctx.fillStyle = color;
      ctx.fillRect(W / 2 - halfTop + 2, y, halfTop * 2 - 4, h + 0.5);
      y += h;
    }
  }
  // Slightly tapered pail outline.
  ctx.strokeStyle = activeColor ?? '#7d8f9e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bucketX, bucketTop);
  ctx.lineTo(bucketX + bucketW * 0.09, bucketTop + bucketH);
  ctx.lineTo(bucketX + bucketW * 0.91, bucketTop + bucketH);
  ctx.lineTo(bucketX + bucketW, bucketTop);
  ctx.stroke();
  // Rim.
  ctx.beginPath();
  ctx.moveTo(bucketX - 3, bucketTop);
  ctx.lineTo(bucketX + bucketW + 3, bucketTop);
  ctx.stroke();
}

export default function SandPlayGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [view, setView] = useState<View>('play');
  const [level, setLevel] = useState<Level>(() => generateLevel(dailySeed(GAME_ID, dateKeyUTC())));
  const [endlessLevel, setEndlessLevel] = useState(1);

  const gridRef = useRef<SandGrid>(level.grid);
  const activeColorRef = useRef<string | null>(null);
  const clearedRef = useRef(false);
  const startTimeRef = useRef<number>(Date.now());
  /** Grains mid-flight from the funnel mouth to the bucket, and what the
   *  bucket has caught so far (per color). Refs, not state: they update
   *  every 40ms tick and only ever feed the canvas. */
  const fallingRef = useRef<FallingGrain[]>([]);
  const collectedRef = useRef<Record<string, number>>({});

  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sync, setSync] = useState<SyncBadge>('idle');
  /** Buckets stay locked until the opening avalanche has settled AND the
   *  countdown has finished — you shouldn't be draining a moving pile. */
  const [settled, setSettled] = useState(false);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  useEffect(() => {
    activeColorRef.current = activeColor;
  }, [activeColor]);

  const draw = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) redraw(ctx, gridRef.current, fallingRef.current, collectedRef.current, activeColorRef.current);
  };

  /** Advance in-flight grains; land them in the bucket at the chute's end. */
  function stepFalling(): void {
    const landY = SAND_ROWS + CHUTE_ROWS;
    const next: FallingGrain[] = [];
    for (const g of fallingRef.current) {
      g.vy += 0.08;
      g.y += g.vy;
      if (g.y >= landY) {
        collectedRef.current[g.color] = (collectedRef.current[g.color] ?? 0) + 1;
      } else {
        next.push(g);
      }
    }
    fallingRef.current = next;
  }

  // (Re)start whenever a new level is generated.
  useEffect(() => {
    gridRef.current = level.grid;
    activeColorRef.current = null;
    clearedRef.current = false;
    startedRef.current = false;
    startTimeRef.current = Date.now();
    fallingRef.current = [];
    collectedRef.current = {};
    setActiveColor(null);
    setCleared(false);
    setElapsedMs(0);
    setSettled(false);
    setStarted(false);
    setCounts(countByColor(level.grid, level.colors));
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (clearedRef.current) return;
      gridRef.current = simulateStep(gridRef.current);
      // Physics run during the settle/countdown phase (that's the point —
      // the pile has to fall into its heap first), but draining doesn't:
      // activeColorRef stays null until the player can actually pick a
      // bucket, so nothing can leak out early.
      const drain = drainBottomRow(gridRef.current, activeColorRef.current);
      gridRef.current = drain.grid;
      // Every drained grain becomes a visible particle falling into the
      // bucket — the drain is no longer sand silently vanishing.
      if (drain.drained > 0 && activeColorRef.current) {
        const { start, end } = funnelMouth();
        for (let i = 0; i < drain.drained; i++) {
          fallingRef.current.push({
            x: start + Math.random() * (end - start - 1),
            y: SAND_ROWS,
            vy: 0.35,
            color: activeColorRef.current,
          });
        }
      }
      stepFalling();
      draw();
      setCounts(countByColor(gridRef.current, level.colors));
      if (!startedRef.current) {
        // Still settling: hold the clock at zero and watch for stillness.
        if (isSettled(gridRef.current)) setSettled(true);
        return;
      }
      setElapsedMs(Date.now() - startTimeRef.current);
      if (!clearedRef.current && isCleared(gridRef.current)) {
        clearedRef.current = true;
        setCleared(true);
        void finishLevel();
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  /** Countdown finished — unlock the buckets and start the clock now (not
   *  at level-generation time, so settling doesn't count against the run). */
  function beginPlay() {
    startedRef.current = true;
    startTimeRef.current = Date.now();
    setStarted(true);
    setElapsedMs(0);
  }

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

  /** Endless is a true level chain: "Next level" keeps counting, switching
   *  modes from the tabs starts the run over at level 1. */
  function startMode(nextMode: Mode, opts: { chain?: boolean } = {}) {
    setMode(nextMode);
    setView('play');
    setSync('idle');
    setEndlessLevel(nextMode === 'endless' && opts.chain ? (n) => n + 1 : () => 1);
    const seed = nextMode === 'daily' ? dailySeed(GAME_ID, dateKeyUTC()) : randomSeed();
    setLevel(generateLevel(seed));
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🪣 Sand Play</h1>
        <p className="hint arcade-head">
          Open a bucket to drain that color. Clear the sand to win.
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
            <h3>🔥 Longest Daily Streaks</h3>
            <LeaderboardPanel gameId={GAME_ID} mode="streak" dateKey={dateKeyUTC()} ascending={false} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="sandsort-timer">
              {mode === 'endless' ? `Level ${endlessLevel} · ` : ''}⏱ {formatTime(elapsedMs)}
            </p>

            <canvas
              ref={canvasRef}
              className="sandplay-canvas"
              width={SAND_COLS * CELL}
              height={CANVAS_ROWS * CELL}
            />

            {!started && <Countdown waitFor={settled} onDone={beginPlay} />}

            <div className="sandsort-buckets">
              {level.colors.map((c) => (
                <button
                  key={c}
                  className={`sandsort-bucket${activeColor === c ? ' active' : ''}`}
                  style={{ '--bucket-color': c } as CSSProperties}
                  onClick={() => setActiveColor(c)}
                  disabled={cleared || !started}
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
                    <button className="btn btn-primary" onClick={() => startMode('endless', { chain: true })}>
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

