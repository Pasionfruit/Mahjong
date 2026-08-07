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
  BALL_R,
  HEIGHT,
  PADDLE_H,
  PADDLE_W,
  PADDLE_Y,
  START_LIVES,
  WIDTH,
  advanceLevel,
  clampPaddleX,
  createGame,
  launchBall,
  stepFrame,
  type BrickBreakerState,
} from './engine';
import './styles.css';

const GAME_ID = 'brickbreaker';
/** Paddle speed (px per 60fps frame) when steering with the arrow keys. */
const PADDLE_KEY_SPEED = 7;
const ROW_COLORS = ['#e08a8a', '#e8c15a', '#6bd68a', '#7fb8e8', '#b389e0', '#4fd0d0'];

type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export default function BrickBreakerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<BrickBreakerState | null>(null);
  const randRef = useRef<() => number>(Math.random);
  const keysRef = useRef({ left: false, right: false });
  const recordedRef = useRef(false);
  const viewRef = useRef<View>('play');

  const [view, setView] = useState<View>('play');
  const [sync, setSync] = useState<SyncBadge>('idle');
  const [over, setOver] = useState(false);
  const [hud, setHud] = useState({ score: 0, level: 1, lives: START_LIVES });
  const [result, setResult] = useState<{ score: number; level: number; bricks: number } | null>(null);
  const [runId, setRunId] = useState(0);
  /** Physics and input stay frozen until the 3-2-1 countdown finishes. */
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Fresh run: new random seed for the level generator (endless = a new
  // procedural run per play, same pattern as the other arcade games).
  useEffect(() => {
    randRef.current = mulberry32(randomSeed());
    stateRef.current = createGame(randRef.current);
    recordedRef.current = false;
    startedRef.current = false;
    setStarted(false);
    setOver(false);
    setResult(null);
    setSync('idle');
    setHud({ score: 0, level: 1, lives: START_LIVES });
  }, [runId]);

  function beginPlay() {
    startedRef.current = true;
    setStarted(true);
  }

  async function finishRun(s: BrickBreakerState) {
    play('lose');
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode: 'endless',
      dateKey: null,
      score: s.score,
      stats: { level: s.level, bricks: s.bricksDestroyed },
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

  // Main loop — substepped so a slow frame can't tunnel the ball through
  // bricks or the paddle. Paused while the leaderboard tab is open.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min((now - last) / (1000 / 60), 3);
      last = now;
      const s = stateRef.current;
      if (!s || viewRef.current !== 'play') return;
      // Draw the board during the countdown, but don't advance physics —
      // the player sees what they're about to play before it moves.
      if (!startedRef.current) {
        draw(s);
        return;
      }
      if (!s.over) {
        if (keysRef.current.left) s.paddleX = clampPaddleX(s.paddleX - PADDLE_KEY_SPEED * dt);
        if (keysRef.current.right) s.paddleX = clampPaddleX(s.paddleX + PADDLE_KEY_SPEED * dt);
        let remaining = dt;
        while (remaining > 0 && !s.over) {
          const step = Math.min(1, remaining);
          remaining -= step;
          const res = stepFrame(s, step);
          if (res.levelCleared) advanceLevel(s, randRef.current);
          if (res.gameOver && !recordedRef.current) {
            recordedRef.current = true;
            setResult({ score: s.score, level: s.level, bricks: s.bricksDestroyed });
            setOver(true);
            void finishRun(s);
          }
        }
        setHud((h) =>
          h.score === s.score && h.level === s.level && h.lives === s.lives
            ? h
            : { score: s.score, level: s.level, lives: s.lives },
        );
      }
      draw(s);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  // Keyboard: arrows steer, space launches.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (viewRef.current !== 'play' || !startedRef.current) return;
      if (e.key === 'ArrowLeft') {
        keysRef.current.left = true;
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        keysRef.current.right = true;
        e.preventDefault();
      } else if (e.key === ' ') {
        const s = stateRef.current;
        if (s && s.attached && !s.over) launchBall(s, randRef.current);
        e.preventDefault();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') keysRef.current.left = false;
      else if (e.key === 'ArrowRight') keysRef.current.right = false;
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  function paddleFromClientX(clientX: number) {
    const canvas = canvasRef.current;
    const s = stateRef.current;
    if (!canvas || !s || s.over) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    s.paddleX = clampPaddleX(x - PADDLE_W / 2);
  }

  function draw(s: BrickBreakerState) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b1f17';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    for (const b of s.bricks) {
      ctx.fillStyle = ROW_COLORS[b.row % ROW_COLORS.length]!;
      ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      if (b.maxHp > 1 && b.hp === b.maxHp) {
        // 2-hit bricks start tinted darker; first hit reveals the base color.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      }
      if (b.flash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${(0.75 * b.flash) / 6})`;
        ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      }
    }

    ctx.fillStyle = '#d8e8dd';
    ctx.fillRect(s.paddleX, PADDLE_Y, PADDLE_W, PADDLE_H);
    ctx.fillStyle = '#6bd68a';
    ctx.fillRect(s.paddleX, PADDLE_Y, PADDLE_W, 3);

    ctx.fillStyle = '#f2ecd9';
    ctx.beginPath();
    ctx.arc(s.ball.x, s.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();

    if (s.attached && !s.over) {
      ctx.fillStyle = 'rgba(242, 236, 217, 0.55)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('click · tap · space to launch', WIDTH / 2, HEIGHT * 0.62);
    }
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🧱 Brick Breaker</h1>
        <p className="hint arcade-head">
          Smash every brick — 3 lives, endless levels.
        </p>


        {(
          <>
            <p className="brickbreaker-status">
              <span>Score {hud.score}</span>
              <span>Level {hud.level}</span>
              <span className="brickbreaker-lives">{'❤'.repeat(Math.max(0, hud.lives))}</span>
            </p>

            <canvas
              ref={canvasRef}
              className="brickbreaker-canvas"
              width={WIDTH}
              height={HEIGHT}
              onPointerMove={(e) => paddleFromClientX(e.clientX)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                paddleFromClientX(e.clientX);
                const s = stateRef.current;
                if (s && s.attached && !s.over && startedRef.current) launchBall(s, randRef.current);
              }}
            />

            {!started && <Countdown onDone={beginPlay} />}

            <p className="hint brickbreaker-hint">Move: mouse, drag, or ← → · Launch: click or space.</p>

            {over && (
              <div className="brickbreaker-result">
                <h2>Game over — score {result?.score ?? 0}</h2>
                <p className="hint">
                  Reached level {result?.level ?? 1} · {result?.bricks ?? 0} bricks smashed
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
