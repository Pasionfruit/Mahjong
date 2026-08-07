import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ensureSignedIn } from '../../arcade/auth';
import { dateKeyUTC } from '../../arcade/dailySeed';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import Countdown from '../../components/Countdown';
import { useStore } from '../../store';
import {
  DINO_X,
  DT,
  DUCK_H,
  DUCK_W,
  GROUND_Y,
  HEIGHT,
  WIDTH,
  createRun,
  onGround,
  scrollSpeed,
  step,
  type Obstacle,
  type RunState,
} from './engine';
import './styles.css';

const GAME_ID = 'dino';
/** Canvas backing-store scale — logical 600×220 drawn at 2× for crispness. */
const DPR = 2;
const STEP_MS = DT * 1000;
const FLASH_MS = 280;
const DEATH_PANEL_DELAY_MS = 550;

/** Desert-at-dusk sprite tones — one light ink on dark slate, chrome-style. */
const INK = '#e9e2d4';
const INK_SOFT = 'rgba(233, 226, 212, 0.55)';
const CACTUS = '#3ecf74';

type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** Blocky little t-rex, drawn from rects so it reads pixel-art at any size. */
function drawDino(ctx: CanvasRenderingContext2D, s: RunState) {
  const grounded = onGround(s);
  // Legs alternate on a distance clock so the jog speed tracks the world.
  const legPhase = grounded && s.phase !== 'dead' ? Math.floor((s.phase === 'ready' ? s.time * 8 : s.dist / 24) % 2) : 2;
  ctx.fillStyle = INK;
  if (s.ducking) {
    const y = s.dinoY;
    // Long low body with the head thrust forward.
    ctx.fillRect(DINO_X, y + 4, DUCK_W - 12, DUCK_H - 8);
    ctx.fillRect(DINO_X + DUCK_W - 16, y, 16, 12); // head
    ctx.fillRect(DINO_X - 8, y + 2, 10, 6); // tail
    // eye
    ctx.fillStyle = '#131a24';
    ctx.fillRect(DINO_X + DUCK_W - 6, y + 3, 3, 3);
    ctx.fillStyle = INK;
    // legs
    if (legPhase === 0) {
      ctx.fillRect(DINO_X + 4, y + DUCK_H - 4, 5, 4);
      ctx.fillRect(DINO_X + 16, y + DUCK_H - 2, 5, 2);
    } else {
      ctx.fillRect(DINO_X + 4, y + DUCK_H - 2, 5, 2);
      ctx.fillRect(DINO_X + 16, y + DUCK_H - 4, 5, 4);
    }
    return;
  }
  const y = s.dinoY;
  // head
  ctx.fillRect(DINO_X + 8, y, 18, 12);
  // mouth notch — painted sky-color (clearRect would punch a transparent
  // hole showing the CSS card background through the canvas)
  ctx.fillStyle = '#131a24';
  ctx.fillRect(DINO_X + 20, y + 8, 6, 4);
  ctx.fillStyle = INK;
  ctx.fillRect(DINO_X + 8, y + 8, 12, 4);
  // body
  ctx.fillRect(DINO_X + 2, y + 10, 18, 18);
  // tail
  ctx.fillRect(DINO_X - 6, y + 12, 10, 8);
  // arm
  ctx.fillRect(DINO_X + 18, y + 16, 6, 3);
  // legs — spread while airborne, alternating jog on the ground
  const legTop = y + 27;
  if (legPhase === 0) {
    ctx.fillRect(DINO_X + 4, legTop, 6, 13);
    ctx.fillRect(DINO_X + 13, legTop, 6, 9);
  } else if (legPhase === 1) {
    ctx.fillRect(DINO_X + 4, legTop, 6, 9);
    ctx.fillRect(DINO_X + 13, legTop, 6, 13);
  } else {
    ctx.fillRect(DINO_X + 3, legTop, 6, 11);
    ctx.fillRect(DINO_X + 14, legTop, 6, 11);
  }
  // eye
  ctx.fillStyle = '#131a24';
  ctx.fillRect(DINO_X + 19, y + 3, 3, 3);
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, time: number) {
  if (o.kind === 'cactus') {
    ctx.fillStyle = CACTUS;
    // Stems with little arms, sliced from the cluster's width.
    const unit = o.h > 36 ? 18 : 14;
    for (let x = o.x; x + unit <= o.x + o.w + 1; x += unit + 3) {
      const stemX = x + unit / 2 - 3;
      ctx.fillRect(stemX, o.y, 6, o.h);
      ctx.fillRect(x, o.y + o.h * 0.3, 4, o.h * 0.28);
      ctx.fillRect(x + 1, o.y + o.h * 0.3, 3, 3);
      ctx.fillRect(x + unit - 4, o.y + o.h * 0.42, 4, o.h * 0.24);
      ctx.fillRect(x + unit - 4, o.y + o.h * 0.42, 3, 3);
    }
    return;
  }
  // Pterodactyl: body wedge + a wing flapping on a time clock.
  ctx.fillStyle = INK;
  const wingUp = Math.floor(time * 6) % 2 === 0;
  const cy = o.y + o.h / 2;
  ctx.fillRect(o.x + 6, cy - 3, o.w - 10, 6); // body
  ctx.fillRect(o.x + o.w - 10, cy - 6, 10, 5); // head
  ctx.fillRect(o.x, cy - 1, 8, 3); // tail
  ctx.fillRect(o.x + o.w - 2, cy - 5, 4, 2); // beak
  if (wingUp) ctx.fillRect(o.x + 12, o.y - 4, 8, o.h / 2 + 1);
  else ctx.fillRect(o.x + 12, cy + 2, 8, o.h / 2 + 1);
}

function drawScene(ctx: CanvasRenderingContext2D, s: RunState, nowMs: number, flashUntil: number) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // Night desert.
  ctx.fillStyle = '#131a24';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Moon + stars drift slowly with distance.
  const drift = s.dist * 0.06 + s.time * 2;
  ctx.fillStyle = 'rgba(233, 226, 212, 0.5)';
  for (let i = 0; i < 7; i++) {
    const x = WIDTH - mod(i * 97 + 40 + drift * (0.4 + (i % 3) * 0.2), WIDTH + 40) + 20;
    const y = 18 + ((i * 37) % 80);
    ctx.fillRect(x, y, 2, 2);
  }
  const moonX = WIDTH - mod(120 + drift * 0.3, WIDTH + 80) + 40;
  ctx.fillStyle = 'rgba(233, 226, 212, 0.75)';
  ctx.beginPath();
  ctx.arc(moonX, 42, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#131a24';
  ctx.beginPath();
  ctx.arc(moonX + 6, 38, 11, 0, Math.PI * 2);
  ctx.fill();

  // Ground: horizon line plus scrolling rubble.
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 1);
  ctx.lineTo(WIDTH, GROUND_Y + 1);
  ctx.stroke();
  ctx.fillStyle = 'rgba(233, 226, 212, 0.3)';
  const rubbleSpan = 34;
  for (let x = -mod(s.dist, rubbleSpan); x < WIDTH; x += rubbleSpan) {
    ctx.fillRect(x, GROUND_Y + 10, 8, 2);
    ctx.fillRect(x + 18, GROUND_Y + 20, 5, 2);
  }

  for (const o of s.obstacles) drawObstacle(ctx, o, s.time);
  drawDino(ctx, s);

  // Score, chrome-style zero-padded, top right.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(233, 226, 212, 0.9)';
  ctx.font = '700 18px ui-monospace, Menlo, monospace';
  ctx.fillText(String(s.score).padStart(5, '0'), WIDTH - 14, 28);
  if (s.phase === 'ready') {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(233, 226, 212, 0.78)';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText('tap to jump', DINO_X + 14, GROUND_Y - 66);
  }

  if (nowMs < flashUntil) {
    const a = (flashUntil - nowMs) / FLASH_MS;
    ctx.fillStyle = `rgba(255, 205, 165, ${(a * 0.55).toFixed(3)})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.textAlign = 'start';
}

export default function DinoGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<RunState>(createRun());
  const jumpRef = useRef(false);
  const duckRef = useRef(false);
  const flashUntilRef = useRef(0);
  const deathTimerRef = useRef<number | null>(null);
  const recordedRef = useRef(false);

  const [view, setView] = useState<View>('play');
  const [runKey, setRunKey] = useState(0);
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const [dead, setDead] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [sync, setSync] = useState<SyncBadge>('idle');

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

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
          jumpRef.current = false;
          continue;
        }
        const jump = jumpRef.current;
        jumpRef.current = false;
        const next = step(prev, { jump, duck: duckRef.current }, Math.random);
        stateRef.current = next;
        if (next.phase === 'dead') {
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

  // Keyboard: Space/↑ jump, ↓ duck (held).
  useEffect(() => {
    if (view !== 'play') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!startedRef.current) return;
        if (stateRef.current.phase !== 'dead') jumpRef.current = true;
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (startedRef.current) duckRef.current = true;
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') duckRef.current = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [view]);

  /** Touch: tap = jump; touch-and-hold the lower third = duck. */
  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!startedRef.current || stateRef.current.phase === 'dead') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientY - rect.top) / rect.height;
    if (frac > 0.72) duckRef.current = true;
    else jumpRef.current = true;
  }

  function onPointerUp() {
    duckRef.current = false;
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
      stats: { distance: score },
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
    jumpRef.current = false;
    duckRef.current = false;
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
      <div className="arcade-card dino-card">
        <h1>🦖 Dino Run</h1>
        <p className="hint arcade-head">Jump the cacti, duck the pterodactyls — the desert never ends.</p>

        <div className="arcade-tabs">
          <button className={`arcade-tab${view === 'play' ? ' active' : ''}`} onClick={() => setView('play')}>
            Play
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
            <h3>All-Time Longest Runs</h3>
            <LeaderboardPanel gameId={GAME_ID} mode="endless" dateKey={dateKeyUTC()} ascending={false} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              className="dino-canvas"
              width={WIDTH * DPR}
              height={HEIGHT * DPR}
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerUp}
            />

            {!started && <Countdown onDone={beginPlay} />}

            <p className="hint dino-hint">
              Tap, Space, or ↑ to jump · hold ↓ (or the bottom of the canvas) to duck.
            </p>

            {dead && (
              <div className="dino-result">
                <h2>{finalScore} m before the cactus won 🌵</h2>
                <p className="hint">Top speed {Math.round(scrollSpeed(stateRef.current.dist))} px/s</p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>All-Time Longest Runs</h3>
                <LeaderboardPanel
                  gameId={GAME_ID}
                  mode="endless"
                  dateKey={dateKeyUTC()}
                  ascending={false}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
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
