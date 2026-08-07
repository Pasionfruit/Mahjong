import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { play } from '../../audio';
import ResultPanel from '../../arcade/ui/ResultPanel';
import { ensureSignedIn } from '../../arcade/auth';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import Countdown from '../../components/Countdown';
import { useStore } from '../../store';
import {
  DT,
  HEIGHT,
  PLAT_H,
  PLAT_W,
  PLAYER_H,
  PLAYER_HALF,
  WIDTH,
  createRun,
  metersFromHeight,
  step,
  type BounceKind,
  type DoodleState,
  type Platform,
} from './engine';
import './styles.css';

const GAME_ID = 'doodlejump';
/** Canvas backing-store scale — logical 360×540 drawn at 2× for crispness. */
const DPR = 2;
const STEP_MS = DT * 1000;
const FLASH_MS = 280;
/** Brief fall flash before the result panel appears. */
const DEATH_PANEL_DELAY_MS = 550;
const SQUASH_MS = 180;

type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Cheap deterministic hash → [0,1) for background decoration. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatform(ctx: CanvasRenderingContext2D, p: Platform, sy: number) {
  const left = p.x - PLAT_W / 2;
  ctx.beginPath();
  ctx.roundRect(left, sy, PLAT_W, PLAT_H, 6);
  if (p.type === 'normal') ctx.fillStyle = '#2e8b5f';
  else if (p.type === 'moving') ctx.fillStyle = '#4d7fb0';
  else ctx.fillStyle = '#a07a52';
  ctx.fill();
  // top light stripe
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.roundRect(left + 3, sy + 1.5, PLAT_W - 6, 3, 2);
  ctx.fill();

  if (p.type === 'breakable') {
    // cracks
    ctx.strokeStyle = '#5f4630';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(p.x - 12, sy + 2);
    ctx.lineTo(p.x - 5, sy + 8);
    ctx.lineTo(p.x + 1, sy + 3);
    ctx.lineTo(p.x + 8, sy + 9);
    ctx.stroke();
  }

  if (p.spring) {
    const sx = p.x + 12;
    ctx.fillStyle = '#e8c15a';
    ctx.fillRect(sx - 6, sy - 8, 12, 8);
    ctx.strokeStyle = '#a8842f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx - 6, sy - 5.5);
    ctx.lineTo(sx + 6, sy - 5.5);
    ctx.moveTo(sx - 6, sy - 3);
    ctx.lineTo(sx + 6, sy - 3);
    ctx.stroke();
    ctx.fillStyle = '#f2d98a';
    ctx.fillRect(sx - 8, sy - 11, 16, 3);
  }
}

function drawPlayer(ctx: CanvasRenderingContext2D, sx: number, sy: number, s: DoodleState, scaleX: number, scaleY: number) {
  const look = clamp(s.vx / 150, -1, 1) * 3;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(scaleX, scaleY);
  // feet
  ctx.fillStyle = '#4faf6f';
  ctx.beginPath();
  ctx.ellipse(-7, -1, 5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(7, -1, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  // blob body
  ctx.fillStyle = '#6bd68a';
  ctx.beginPath();
  ctx.roundRect(-PLAYER_HALF, -PLAYER_H, PLAYER_HALF * 2, PLAYER_H, 11);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // eyes track the direction of travel
  ctx.fillStyle = '#ffffff';
  circle(ctx, -5 + look, -17, 3.4);
  circle(ctx, 5 + look, -17, 3.4);
  ctx.fillStyle = '#10241c';
  circle(ctx, -5 + look * 1.4, -17, 1.7);
  circle(ctx, 5 + look * 1.4, -17, 1.7);
  // little smile
  ctx.strokeStyle = '#2b6b45';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(look, -10.5, 3.2, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  s: DoodleState,
  nowMs: number,
  bounce: { at: number; kind: BounceKind },
  flashUntil: number,
) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const toY = (worldY: number) => HEIGHT - (worldY - s.cameraY);

  // Deep-jade sky.
  ctx.fillStyle = '#0b1f17';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Slow-parallax floating motes.
  const par = 0.4;
  const camP = s.cameraY * par;
  const tileH = 180;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let k = Math.floor(camP / tileH) - 1; k <= Math.floor((camP + HEIGHT) / tileH) + 1; k++) {
    for (let j = 0; j < 3; j++) {
      const x = hash01(k * 13.37 + j * 7.77) * WIDTH;
      const wy = k * tileH + hash01(k * 3.1 + j * 11.3) * tileH;
      circle(ctx, x, HEIGHT - (wy - camP), 1.2 + hash01(k + j * 5.5) * 2.2);
    }
  }

  // Height marker lines every 50 m.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.lineWidth = 1;
  const markPx = 500;
  for (let wy = Math.max(markPx, Math.ceil(s.cameraY / markPx) * markPx); wy <= s.cameraY + HEIGHT; wy += markPx) {
    const sy = toY(wy);
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(WIDTH, sy);
    ctx.stroke();
    ctx.fillText(`${wy / 10} m`, 8, sy - 4);
  }

  // Platforms.
  for (const p of s.platforms) {
    if (p.broken) continue;
    const sy = toY(p.y);
    if (sy < -24 || sy > HEIGHT + 24) continue;
    drawPlatform(ctx, p, sy);
  }

  // Player, squashing on bounce and stretching with speed.
  const sinceBounce = nowMs - bounce.at;
  let squash = 1;
  if (sinceBounce >= 0 && sinceBounce < SQUASH_MS) {
    const k = sinceBounce / SQUASH_MS;
    squash = 0.72 + 0.28 * (1 - Math.pow(1 - k, 3));
  }
  const stretch = 1 + Math.min(0.14, Math.abs(s.vy) / 5000);
  const scaleY = squash * stretch;
  const scaleX = 1 / scaleY;
  const px = s.x;
  const py = toY(s.y);
  drawPlayer(ctx, px, py, s, scaleX, scaleY);
  // Wrap ghosts so the blob never pops at the seam.
  if (px < PLAYER_HALF * 2) drawPlayer(ctx, px + WIDTH, py, s, scaleX, scaleY);
  if (px > WIDTH - PLAYER_HALF * 2) drawPlayer(ctx, px - WIDTH, py, s, scaleX, scaleY);

  // HUD.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.font = '800 20px system-ui, sans-serif';
  ctx.fillText(`${metersFromHeight(s.maxHeight)} m`, 10, 28);
  if (s.time < 3 && s.maxHeight < 60) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('hold left / right to steer', WIDTH / 2, HEIGHT - 84);
    ctx.textAlign = 'start';
  }

  // Fall flash.
  if (nowMs < flashUntil) {
    const a = (flashUntil - nowMs) / FLASH_MS;
    ctx.fillStyle = `rgba(255, 205, 165, ${(a * 0.5).toFixed(3)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
}

export default function DoodleJumpGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<DoodleState>(createRun(Math.random));
  const keysRef = useRef({ left: false, right: false });
  const pointerDirRef = useRef<-1 | 0 | 1>(0);
  const bounceRef = useRef<{ at: number; kind: BounceKind }>({ at: -1e9, kind: 'normal' });
  const flashUntilRef = useRef(0);
  const deathTimerRef = useRef<number | null>(null);
  const recordedRef = useRef(false);

  const [view, setView] = useState<View>('play');
  const [runKey, setRunKey] = useState(0);
  /** Physics and steering stay frozen until the 3-2-1 countdown finishes. */
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [dead, setDead] = useState(false);
  const [finalMeters, setFinalMeters] = useState(0);
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

  function currentDir(): -1 | 0 | 1 {
    if (pointerDirRef.current !== 0) return pointerDirRef.current;
    const { left, right } = keysRef.current;
    if (left && !right) return -1;
    if (right && !left) return 1;
    return 0;
  }

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
      // Draw the opening scene during the countdown, but hold the physics —
      // otherwise the player is already falling before they can steer.
      if (!startedRef.current) {
        acc = 0;
        drawScene(ctx, stateRef.current, now, bounceRef.current, flashUntilRef.current);
        return;
      }
      while (acc >= STEP_MS) {
        acc -= STEP_MS;
        const prev = stateRef.current;
        if (prev.phase === 'dead') continue;
        const next = step(prev, { dir: currentDir() }, Math.random);
        stateRef.current = next;
        if (next.lastBounce) bounceRef.current = { at: now, kind: next.lastBounce };
        if (next.phase === 'dead') {
          flashUntilRef.current = now + FLASH_MS;
          onDeath(next);
        }
      }
      drawScene(ctx, stateRef.current, now, bounceRef.current, flashUntilRef.current);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, runKey]);

  // Keyboard steering.
  useEffect(() => {
    if (view !== 'play') return;
    function set(e: KeyboardEvent, down: boolean): void {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (down) e.preventDefault();
        keysRef.current.left = down;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (down) e.preventDefault();
        keysRef.current.right = down;
      }
    }
    const onKeyDown = (e: KeyboardEvent) => set(e, true);
    const onKeyUp = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      keysRef.current = { left: false, right: false };
    };
  }, [view]);

  // Touch/pointer steering: hold the left or right half of the canvas.
  function dirFromPointer(e: ReactPointerEvent<HTMLCanvasElement>): -1 | 1 {
    const rect = e.currentTarget.getBoundingClientRect();
    return e.clientX - rect.left < rect.width / 2 ? -1 : 1;
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerDirRef.current = dirFromPointer(e);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (pointerDirRef.current !== 0) pointerDirRef.current = dirFromPointer(e);
  }

  function onPointerEnd() {
    pointerDirRef.current = 0;
  }

  function onDeath(s: DoodleState) {
    if (recordedRef.current) return;
    recordedRef.current = true;
    play('lose');
    const meters = metersFromHeight(s.maxHeight);
    deathTimerRef.current = window.setTimeout(() => {
      deathTimerRef.current = null;
      setFinalMeters(meters);
      setDead(true);
      void saveResult(meters);
    }, DEATH_PANEL_DELAY_MS);
  }

  async function saveResult(meters: number) {
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode: 'endless',
      dateKey: null,
      score: meters,
      stats: { height: meters },
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
    stateRef.current = createRun(Math.random);
    recordedRef.current = false;
    flashUntilRef.current = 0;
    bounceRef.current = { at: -1e9, kind: 'normal' };
    pointerDirRef.current = 0;
    startedRef.current = false;
    setStarted(false);
    setDead(false);
    setFinalMeters(0);
    setSync('idle');
    setView('play');
    setRunKey((k) => k + 1);
  }

  function beginPlay() {
    startedRef.current = true;
    setStarted(true);
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🐸 Doodle Jump</h1>
        <p className="hint arcade-head">
          Bounce ever higher — never look down.
        </p>


        {(
          <>
            <canvas
              ref={canvasRef}
              className="doodlejump-canvas"
              width={WIDTH * DPR}
              height={HEIGHT * DPR}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerEnd}
              onPointerCancel={onPointerEnd}
              onPointerLeave={onPointerEnd}
            />

            {!started && <Countdown onDone={beginPlay} />}

            <p className="hint doodlejump-hint">← → (or A/D) to steer — or hold either half of the canvas.</p>

            {dead && (
              <ResultPanel className="doodlejump-result">
                <h2>Reached {finalMeters} m 🐸</h2>
                <p className="hint">Max height: {finalMeters} m</p>
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
              </ResultPanel>
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
