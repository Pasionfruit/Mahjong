import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ensureSignedIn } from '../../arcade/auth';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import Countdown from '../../components/Countdown';
import { useStore } from '../../store';
import {
  BIRD_R,
  BIRD_X,
  DT,
  GROUND_H,
  GROUND_Y,
  HEIGHT,
  PIPE_W,
  WIDTH,
  createRun,
  scrollSpeed,
  step,
  type RunState,
} from './engine';
import './styles.css';

const GAME_ID = 'flappy';
/** Canvas backing-store scale — logical 360×540 drawn at 2× for crispness. */
const DPR = 2;
const STEP_MS = DT * 1000;
const FLASH_MS = 280;
/** Hit flash + the bird's tumble to the ground before the panel slides in. */
const DEATH_PANEL_DELAY_MS = 1000;

type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
  ctx.arc(x + 18 * s, y + 4 * s, 12 * s, 0, Math.PI * 2);
  ctx.arc(x - 17 * s, y + 5 * s, 11 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawPipeHalf(ctx: CanvasRenderingContext2D, x: number, y0: number, y1: number, lipAtBottom: boolean) {
  if (y1 <= y0) return;
  ctx.fillStyle = '#2e7d57';
  ctx.fillRect(x, y0, PIPE_W, y1 - y0);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)'; // left highlight
  ctx.fillRect(x + 6, y0, 6, y1 - y0);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.20)'; // right shade
  ctx.fillRect(x + PIPE_W - 9, y0, 9, y1 - y0);
  const lipH = 14;
  const lipY = lipAtBottom ? y1 - lipH : y0;
  ctx.fillStyle = '#39996b';
  ctx.beginPath();
  ctx.roundRect(x - 4, lipY, PIPE_W + 8, lipH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawBird(ctx: CanvasRenderingContext2D, s: RunState) {
  const bob = s.phase === 'ready' ? Math.sin(s.time * 3.4) * 6 : 0;
  const y = s.birdY + bob;
  const angle = s.phase === 'ready' ? 0 : clamp(s.birdVy / 500, -0.45, 1.1);
  ctx.save();
  ctx.translate(BIRD_X, y);
  ctx.rotate(angle);
  // body
  ctx.fillStyle = '#e8c15a';
  circle(ctx, 0, 0, BIRD_R);
  // belly
  ctx.fillStyle = '#f2d98a';
  ctx.beginPath();
  ctx.ellipse(-1, 4.5, BIRD_R * 0.68, BIRD_R * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // wing — flaps hard while rising, lazy otherwise
  const flapAmp = s.phase === 'ready' ? 0.35 : s.birdVy < 0 ? 0.85 : 0.2;
  ctx.save();
  ctx.translate(-3, 1);
  ctx.rotate(Math.sin(s.time * 17) * flapAmp);
  ctx.fillStyle = '#d9a83f';
  ctx.beginPath();
  ctx.ellipse(-3, 0, 8, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // eye
  ctx.fillStyle = '#ffffff';
  circle(ctx, 5, -4, 3.6);
  ctx.fillStyle = '#10241c';
  circle(ctx, 6, -4, 1.8);
  // beak
  ctx.fillStyle = '#e0916b';
  ctx.beginPath();
  ctx.moveTo(BIRD_R - 3, -1);
  ctx.lineTo(BIRD_R + 6, 2);
  ctx.lineTo(BIRD_R - 3, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawScene(ctx: CanvasRenderingContext2D, s: RunState, nowMs: number, flashUntil: number) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // Deep-jade sky with a soft glow toward the horizon.
  ctx.fillStyle = '#0b1f17';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, 'rgba(70, 140, 110, 0)');
  sky.addColorStop(1, 'rgba(70, 140, 110, 0.12)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, GROUND_Y);

  // Parallax clouds — drift even while idle so the ready screen breathes.
  const drift = s.dist + s.time * 16;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < 5; i++) {
    const span = WIDTH + 140;
    const factor = 0.18 + 0.06 * (i % 3);
    const cx = span - mod(i * 151 + 60 + drift * factor, span) - 70;
    const cy = 46 + ((i * 61) % 150);
    cloud(ctx, cx, cy, 0.9 + (i % 3) * 0.25);
  }

  // Pipes.
  for (const p of s.pipes) {
    const gapTop = p.gapY - p.gapH / 2;
    const gapBottom = p.gapY + p.gapH / 2;
    drawPipeHalf(ctx, p.x, 0, gapTop, true);
    drawPipeHalf(ctx, p.x, gapBottom, GROUND_Y, false);
  }

  // Ground strip with scrolling tufts.
  ctx.fillStyle = '#143024';
  ctx.fillRect(0, GROUND_Y, WIDTH, GROUND_H);
  ctx.fillStyle = '#1d4433';
  ctx.fillRect(0, GROUND_Y, WIDTH, 5);
  ctx.fillStyle = 'rgba(107, 214, 138, 0.28)';
  const dashSpan = 26;
  for (let x = -mod(s.dist, dashSpan); x < WIDTH; x += dashSpan) {
    ctx.fillRect(x, GROUND_Y + 12, 12, 3);
  }

  drawBird(ctx, s);

  // HUD.
  ctx.textAlign = 'center';
  if (s.phase === 'ready') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText('tap to flap', BIRD_X, s.birdY + 52);
  } else {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '800 36px system-ui, sans-serif';
    ctx.fillText(String(s.score), WIDTH / 2, 56);
  }

  // Hit flash.
  if (nowMs < flashUntil) {
    const a = (flashUntil - nowMs) / FLASH_MS;
    ctx.fillStyle = `rgba(255, 205, 165, ${(a * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.textAlign = 'start';
}

export default function FlappyGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunState>(createRun());
  const flapRef = useRef(false);
  const flashUntilRef = useRef(0);
  const deathTimerRef = useRef<number | null>(null);
  const recordedRef = useRef(false);

  const [view, setView] = useState<View>('play');
  const [runKey, setRunKey] = useState(0);
  /** Flapping stays locked until the 3-2-1 countdown finishes. The bird
   *  already idles in its 'ready' phase until the first flap, so this just
   *  gates that first input rather than freezing a running simulation. */
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [dead, setDead] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [sync, setSync] = useState<SyncBadge>('idle');

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  // Clear any pending death-panel timer on unmount.
  useEffect(
    () => () => {
      if (deathTimerRef.current !== null) window.clearTimeout(deathTimerRef.current);
    },
    [],
  );

  // Fixed-timestep game loop on rAF; paused while the leaderboard tab is open.
  useEffect(() => {
    if (view !== 'play') return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(now - last, 100); // never spiral after a background tab
      last = now;
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        const prev = stateRef.current;
        if (prev.phase === 'dead') {
          flapRef.current = false;
          continue;
        }
        const flap = flapRef.current;
        flapRef.current = false;
        const next = step(prev, { flap }, Math.random);
        stateRef.current = next;
        // The run is over the moment the bird leaves 'playing' — via 'dying'
        // (pipe hit, still tumbling to the ground) or straight to 'dead'
        // (ground hit). The tumble keeps animating while the panel waits.
        if (prev.phase === 'playing' && next.phase !== 'playing') {
          flashUntilRef.current = now + FLASH_MS;
          onDeath(next);
        }
      }
      drawScene(ctx, stateRef.current, now, flashUntilRef.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, runKey]);

  // Keyboard flaps.
  useEffect(() => {
    if (view !== 'play') return;
    function onKey(e: KeyboardEvent) {
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!startedRef.current) return;
        const ph = stateRef.current.phase;
        if (ph === 'ready' || ph === 'playing') flapRef.current = true;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!startedRef.current) return;
    const ph = stateRef.current.phase;
    if (ph === 'ready' || ph === 'playing') flapRef.current = true;
  }

  function beginPlay() {
    startedRef.current = true;
    setStarted(true);
  }

  function onDeath(s: RunState) {
    if (recordedRef.current) return;
    recordedRef.current = true;
    deathTimerRef.current = window.setTimeout(() => {
      deathTimerRef.current = null;
      setFinalScore(s.score);
      setDead(true);
      void saveResult(s.score);
    }, DEATH_PANEL_DELAY_MS);
  }

  async function saveResult(score: number) {
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode: 'endless',
      dateKey: null,
      score,
      stats: { pipes: score },
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

  function restart() {
    if (deathTimerRef.current !== null) {
      window.clearTimeout(deathTimerRef.current);
      deathTimerRef.current = null;
    }
    stateRef.current = createRun();
    recordedRef.current = false;
    flashUntilRef.current = 0;
    flapRef.current = false;
    startedRef.current = false;
    setStarted(false);
    setDead(false);
    setFinalScore(0);
    setSync('idle');
    setView('play');
    setRunKey((k) => k + 1);
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🐤 Flappy Bird</h1>
        <p className="hint arcade-head">
          Thread the pipes — every pair scores a point.
        </p>


        {(
          <>
            <canvas
              ref={canvasRef}
              className="flappy-canvas"
              width={WIDTH * DPR}
              height={HEIGHT * DPR}
              onPointerDown={onPointerDown}
            />

            {!started && <Countdown onDone={beginPlay} />}

            <p className="hint flappy-hint">Tap the canvas, Space, or ↑ to flap.</p>

            {dead && (
              <div className="flappy-result">
                <h2>
                  {finalScore} pipe{finalScore === 1 ? '' : 's'} cleared 🐤
                </h2>
                <p className="hint">
                  Pipes passed: {finalScore} · Top speed {Math.round(scrollSpeed(finalScore))} px/s
                </p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <div className="arcade-actions">
                  <button className="btn btn-primary" onClick={restart}>
                    Play again
                  </button>
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
