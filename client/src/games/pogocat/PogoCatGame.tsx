import { useEffect, useRef, useState } from 'react';
import { mulberry32 } from '@shared/rng';
import { play } from '../../audio';
import { ensureSignedIn } from '../../arcade/auth';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import Countdown from '../../components/Countdown';
import { useStore } from '../../store';
import {
  HEIGHT,
  PLATFORM_Y,
  WIDTH,
  createPogo,
  releaseJump,
  startCharge,
  stepJump,
  tickCharge,
  type PogoState,
} from './engine';
import './styles.css';

const GAME_ID = 'pogocat';
/** Frames the landing squash lasts. */
const SQUASH_FRAMES = 9;

type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/** Fixed starfield (screen space, slight parallax) — same sky every night. */
const STARS: { x: number; y: number; r: number; p: number }[] = (() => {
  const rand = mulberry32(0x9067ca7);
  return Array.from({ length: 42 }, () => ({
    x: rand() * WIDTH,
    y: rand() * 300,
    r: 0.7 + rand() * 1.3,
    p: rand() * Math.PI * 2,
  }));
})();

function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = '#e8c15a';
  ctx.beginPath();
  ctx.ellipse(x, y, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + 7, y);
  ctx.lineTo(x + 13, y - 4.5);
  ctx.lineTo(x + 13, y + 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#0b1f17';
  ctx.beginPath();
  ctx.arc(x - 4, y - 1, 1, 0, Math.PI * 2);
  ctx.fill();
}

/** The cat, drawn feet-at-origin so squash scales from the ground up. */
function drawCat(ctx: CanvasRenderingContext2D, x: number, baseY: number, sq: number, time: number) {
  ctx.save();
  ctx.translate(x, baseY);
  ctx.scale(1 + 0.22 * sq, 1 - 0.28 * sq);
  const body = '#41505c';

  // Tail — a springy curl that wags.
  const wag = Math.sin(time * 0.12) * 3;
  ctx.strokeStyle = body;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11, -8);
  ctx.quadraticCurveTo(-24, -13 + wag, -20, -26 + wag);
  ctx.stroke();

  // Body + head.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, -10, 14, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(4, -24, 10, 0, Math.PI * 2);
  ctx.fill();

  // Triangle ears with pink inners.
  ctx.beginPath();
  ctx.moveTo(-3, -30);
  ctx.lineTo(0, -40);
  ctx.lineTo(4, -31);
  ctx.moveTo(7, -31);
  ctx.lineTo(12, -39);
  ctx.lineTo(13, -29);
  ctx.fill();
  ctx.fillStyle = '#e08a8a';
  ctx.beginPath();
  ctx.moveTo(-1, -31.5);
  ctx.lineTo(0.5, -36.5);
  ctx.lineTo(2.5, -31.8);
  ctx.moveTo(8.5, -31.8);
  ctx.lineTo(11, -35.8);
  ctx.lineTo(11.5, -30.8);
  ctx.fill();

  // Eyes + nose.
  ctx.fillStyle = '#f2ecd9';
  ctx.beginPath();
  ctx.arc(1, -24, 2.4, 0, Math.PI * 2);
  ctx.arc(8, -24, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0b1f17';
  ctx.beginPath();
  ctx.arc(1.7, -24, 1.2, 0, Math.PI * 2);
  ctx.arc(8.7, -24, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e08a8a';
  ctx.beginPath();
  ctx.moveTo(3.2, -20.6);
  ctx.lineTo(5.8, -20.6);
  ctx.lineTo(4.5, -18.6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** Pogo stick (foot, coil spring, stick, pegs) + the cat on top. */
function drawPogoCat(
  ctx: CanvasRenderingContext2D,
  x: number,
  groundY: number,
  comp: number,
  sq: number,
  time: number,
) {
  const springLen = 8 + 14 * (1 - comp);
  const top = groundY - 3 - springLen;

  ctx.strokeStyle = '#9fb8a8';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 5, groundY);
  ctx.lineTo(x + 5, groundY);
  ctx.stroke();

  const zigs = 7;
  ctx.beginPath();
  ctx.moveTo(x, groundY - 2);
  for (let i = 1; i < zigs; i++) {
    const yy = groundY - 2 - ((springLen - 1) * i) / zigs;
    ctx.lineTo(x + (i % 2 === 1 ? 5 : -5), yy);
  }
  ctx.lineTo(x, top);
  ctx.stroke();

  ctx.strokeStyle = '#e8c15a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, top - 10);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x - 9, top - 10);
  ctx.lineTo(x + 9, top - 10);
  ctx.stroke();

  drawCat(ctx, x, top - 10, sq, time);
}

export default function PogoCatGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PogoState | null>(null);
  const randRef = useRef<() => number>(Math.random);
  const recordedRef = useRef(false);
  const viewRef = useRef<View>('play');
  const camRef = useRef(0);
  const timeRef = useRef(0);
  const squashRef = useRef(0);
  const spaceHeldRef = useRef(false);

  const [view, setView] = useState<View>('play');
  const [sync, setSync] = useState<SyncBadge>('idle');
  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ score: 0, fish: 0 });
  const [result, setResult] = useState<{ score: number; hops: number; fish: number } | null>(null);
  const [runId, setRunId] = useState(0);
  /** Charging/jumping stays locked until the 3-2-1 countdown finishes. The
   *  cat idles until the first press anyway, so this gates that input. */
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Fresh run: reseed the platform generator.
  useEffect(() => {
    randRef.current = mulberry32(randomSeed());
    stateRef.current = createPogo(randRef.current);
    recordedRef.current = false;
    camRef.current = 0;
    squashRef.current = 0;
    startedRef.current = false;
    setStarted(false);
    setOver(false);
    setResult(null);
    setSync('idle');
    setHud({ score: 0, fish: 0 });
  }, [runId]);

  function beginPlay() {
    startedRef.current = true;
    setStarted(true);
  }

  async function finishRun(s: PogoState) {
    play('lose');
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode: 'endless',
      dateKey: null,
      score: s.score,
      stats: { hops: s.hops, fish: s.fish },
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

  // Main loop — paused while the leaderboard tab is open.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / (1000 / 60), 2.5);
      last = now;
      const s = stateRef.current;
      if (!s || viewRef.current !== 'play') return;
      timeRef.current += dt;

      if (s.phase === 'charging') {
        tickCharge(s, dt);
      } else if (s.phase === 'jumping') {
        const out = stepJump(s, dt, randRef.current);
        if (out === 'landed') squashRef.current = SQUASH_FRAMES;
        if (out === 'fell' && !recordedRef.current) {
          recordedRef.current = true;
          setResult({ score: s.score, hops: s.hops, fish: s.fish });
          setOver(true);
          void finishRun(s);
        }
      }
      if (squashRef.current > 0) squashRef.current = Math.max(0, squashRef.current - dt);

      const focusX = (s.phase === 'jumping' || s.phase === 'dead') && s.jump ? s.jump.x : s.catX;
      const targetCam = Math.max(0, focusX - 110);
      camRef.current += (targetCam - camRef.current) * Math.min(1, 0.08 * dt);

      setHud((h) => (h.score === s.score && h.fish === s.fish ? h : { score: s.score, fish: s.fish }));
      draw(s);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  function press() {
    const s = stateRef.current;
    if (!startedRef.current) return;
    if (s && s.phase === 'idle' && viewRef.current === 'play') startCharge(s);
  }
  function release() {
    const s = stateRef.current;
    if (s && s.phase === 'charging') releaseJump(s);
  }

  // Release must fire even if the pointer/finger leaves the canvas, and
  // Space works as the one button too.
  useEffect(() => {
    const onPointerUp = () => release();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== ' ' || viewRef.current !== 'play') return;
      e.preventDefault();
      if (!spaceHeldRef.current) {
        spaceHeldRef.current = true;
        press();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key !== ' ') return;
      spaceHeldRef.current = false;
      release();
    }
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw(s: PogoState) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const cam = camRef.current;
    const time = timeRef.current;

    // Deep-green night sky.
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#06130d');
    sky.addColorStop(0.7, '#0b1f17');
    sky.addColorStop(1, '#0e2a1e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    // Stars (parallax + twinkle) and moon.
    ctx.fillStyle = '#e9e6c8';
    for (const st of STARS) {
      const sx = (((st.x - cam * 0.15) % WIDTH) + WIDTH) % WIDTH;
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(time * 0.06 + st.p);
      ctx.fillRect(sx, st.y, st.r, st.r);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(233, 230, 200, 0.08)';
    ctx.beginPath();
    ctx.arc(312, 68, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9e6c8';
    ctx.beginPath();
    ctx.arc(312, 68, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(11, 31, 23, 0.12)';
    ctx.beginPath();
    ctx.arc(304, 62, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(319, 76, 4, 0, Math.PI * 2);
    ctx.fill();

    // Platforms.
    for (const p of s.platforms) {
      const x = p.x - cam;
      if (x + p.w < -30 || x > WIDTH + 30) continue;
      ctx.fillStyle = '#14382a';
      ctx.fillRect(x, PLATFORM_Y, p.w, HEIGHT - PLATFORM_Y);
      ctx.fillStyle = '#2a6a4a';
      ctx.fillRect(x, PLATFORM_Y, p.w, 6);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.fillRect(x + p.w - 5, PLATFORM_Y + 6, 5, HEIGHT - PLATFORM_Y - 6);
      if (p.fish) drawFish(ctx, x + p.w / 2, PLATFORM_Y - 12 + Math.sin(time * 0.1) * 2.5);
    }

    // The cat: grounded (idle bounce / charging crouch) or mid-arc.
    const squashNorm = squashRef.current / SQUASH_FRAMES;
    let catX: number;
    let groundY: number;
    let comp: number;
    let inAir = false;
    if ((s.phase === 'jumping' || s.phase === 'dead') && s.jump) {
      catX = s.jump.x - cam;
      groundY = s.jump.y;
      comp = 0;
      inAir = true;
    } else {
      catX = s.catX - cam;
      if (s.phase === 'charging') {
        groundY = PLATFORM_Y;
        comp = 0.25 + 0.6 * s.charge;
      } else {
        const hop = Math.abs(Math.sin(time * 0.09)) * 13;
        groundY = PLATFORM_Y - hop;
        comp = hop < 2 ? 0.35 : 0.08;
      }
    }
    const sq = inAir ? 0 : Math.max(squashNorm, s.phase === 'charging' ? 0.35 * s.charge : 0);
    if (!inAir) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.beginPath();
      ctx.ellipse(catX, PLATFORM_Y + 4, 15, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      comp = Math.max(comp, 0.55 * squashNorm);
    }
    if (groundY < HEIGHT + 60) drawPogoCat(ctx, catX, groundY, comp, sq, time);

    // Charge meter — an arc over the cat's head.
    if (s.phase === 'charging') {
      const cx = catX;
      const cy = groundY - 60;
      const start = Math.PI * 0.75;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, start, start + Math.PI * 1.5);
      ctx.stroke();
      ctx.strokeStyle = s.charge < 0.5 ? '#6bd68a' : s.charge < 0.8 ? '#e8c15a' : '#e08a8a';
      ctx.beginPath();
      ctx.arc(cx, cy, 24, start, start + Math.PI * 1.5 * s.charge);
      ctx.stroke();
    }

    if (s.phase === 'idle' && s.score === 0 && !over) {
      ctx.fillStyle = 'rgba(242, 236, 217, 0.55)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('hold to charge · release to leap', WIDTH / 2, 200);
    }
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🐱 Pogo Cat</h1>
        <p className="hint arcade-head">
          Time each leap, land every platform, snag the fish.
        </p>


        {(
          <>
            <p className="pogocat-status">
              <span>Score {hud.score}</span>
              <span>🐟 {hud.fish}</span>
            </p>

            <canvas
              ref={canvasRef}
              className="pogocat-canvas"
              width={WIDTH}
              height={HEIGHT}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                press();
              }}
            />

            {!started && <Countdown onDone={beginPlay} />}

            <p className="hint pogocat-hint">Hold (or Space) to charge the spring · release to leap the gap.</p>

            {over && (
              <div className="pogocat-result">
                <h2>Splat! Final score {result?.score ?? 0} 🐾</h2>
                <p className="hint">
                  {result?.hops ?? 0} platforms landed · {result?.fish ?? 0} fish snagged
                </p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <div className="arcade-actions">
                  <button className="btn btn-primary" onClick={() => setRunId((n) => n + 1)}>
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
