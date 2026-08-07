import { useEffect, useRef, useState } from 'react';
import { ensureSignedIn } from '../../arcade/auth';
import { dailySeed, dateKeyUTC } from '../../arcade/dailySeed';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import { useStore } from '../../store';
import {
  BALLS_PER_GAME,
  BUCKET_TOP,
  BUCKET_WIDTH,
  CANNON_X,
  CANNON_Y,
  DAILY_ORANGE_COUNT,
  FIXED_DT,
  HEIGHT,
  ORANGE_COUNT,
  PEG_RADIUS,
  WIDTH,
  clampAimAngle,
  createGame,
  fireBall,
  step,
  traceAim,
  type GameState,
  type PegColor,
  type Status,
} from './engine';
import './styles.css';

const GAME_ID = 'peggle';

type Mode = 'daily' | 'endless';
type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

/** Daily gets the easier target (see DAILY_ORANGE_COUNT); endless keeps the full challenge. */
function orangeTargetFor(m: Mode): number {
  return m === 'daily' ? DAILY_ORANGE_COUNT : ORANGE_COUNT;
}

const PEG_FILL: Record<PegColor, string> = { blue: '#3f8fd4', orange: '#f08a2d', purple: '#a866e0' };
const PEG_LIT: Record<PegColor, string> = { blue: '#b8dcff', orange: '#ffcf80', purple: '#e6c4ff' };

interface Ring {
  x: number;
  y: number;
  color: PegColor;
  born: number;
}

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function drawFrame(ctx: CanvasRenderingContext2D, g: GameState, aim: number, rings: Ring[], now: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  grad.addColorStop(0, '#153729');
  grad.addColorStop(1, '#0a1c15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Aim guide: dotted preview of the first ~120px of flight.
  if (g.status === 'aiming' && g.ballsLeft > 0) {
    const pts = traceAim(g.pegs, aim, 120);
    ctx.fillStyle = 'rgba(245, 241, 230, 0.55)';
    for (let i = 4; i < pts.length; i += 5) {
      const p = pts[i]!;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Pegs — lit ones glow until the ball leaves play.
  for (const peg of g.pegs) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
    if (peg.hit) {
      ctx.shadowColor = PEG_FILL[peg.color];
      ctx.shadowBlur = 14;
      ctx.fillStyle = PEG_LIT[peg.color];
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = PEG_FILL[peg.color];
    }
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(peg.x - 2.5, peg.y - 3, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
  }

  // Hit flashes: expanding, fading rings.
  for (const r of rings) {
    const t = (now - r.born) / 400;
    ctx.beginPath();
    ctx.arc(r.x, r.y, PEG_RADIUS + t * 18, 0, Math.PI * 2);
    ctx.strokeStyle = PEG_LIT[r.color];
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Free-ball bucket sweeping the bottom lane.
  const bx = g.bucket.x;
  const bh = HEIGHT - BUCKET_TOP - 6;
  ctx.fillStyle = 'rgba(232, 193, 90, 0.22)';
  ctx.fillRect(bx, BUCKET_TOP, BUCKET_WIDTH, bh);
  ctx.fillStyle = '#e8c15a';
  ctx.fillRect(bx, BUCKET_TOP, 4, bh);
  ctx.fillRect(bx + BUCKET_WIDTH - 4, BUCKET_TOP, 4, bh);
  ctx.fillRect(bx, BUCKET_TOP + bh - 3, BUCKET_WIDTH, 3);
  ctx.fillStyle = 'rgba(232, 193, 90, 0.9)';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FREE BALL', bx + BUCKET_WIDTH / 2, BUCKET_TOP + 16);

  // Cannon: barrel along the current aim.
  const a = clampAimAngle(aim);
  ctx.strokeStyle = '#d8d2c2';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(CANNON_X, CANNON_Y);
  ctx.lineTo(CANNON_X + Math.cos(a) * 26, CANNON_Y + Math.sin(a) * 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CANNON_X, CANNON_Y, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#22453a';
  ctx.fill();
  ctx.strokeStyle = '#d8d2c2';
  ctx.lineWidth = 2;
  ctx.stroke();

  // The ball.
  if (g.ball) {
    ctx.beginPath();
    ctx.arc(g.ball.x, g.ball.y, g.ball.r, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f1e6';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 9;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

export default function PeggleGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [view, setView] = useState<View>('play');
  const [round, setRound] = useState(1);
  const [resetKey, setResetKey] = useState(0);

  const gameRef = useRef<GameState>(createGame(dailySeed(GAME_ID, dateKeyUTC()), DAILY_ORANGE_COUNT));
  const modeRef = useRef<Mode>('daily');
  const aimRef = useRef<number>(Math.PI / 2);
  const ringsRef = useRef<Ring[]>([]);
  const finishedRef = useRef(false);

  const [hud, setHud] = useState({ ballsLeft: BALLS_PER_GAME, orangeLeft: DAILY_ORANGE_COUNT, score: 0 });
  const [status, setStatus] = useState<Status>('aiming');
  const [sync, setSync] = useState<SyncBadge>('idle');

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  async function finishGame(g: GameState) {
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode: modeRef.current,
      dateKey: modeRef.current === 'daily' ? dateKeyUTC() : null,
      score: g.score,
      stats: { orangeCleared: orangeTargetFor(modeRef.current) - g.orangeRemaining, ballsLeft: g.ballsLeft },
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

  // Main loop: accumulate rAF time, advance the engine in fixed-dt steps,
  // then paint. All rules live in the engine — this only drives and draws.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min((now - last) / 1000, 0.05);
      last = now;
      const g = gameRef.current;
      while (acc >= FIXED_DT) {
        step(g, FIXED_DT);
        for (const h of g.newHits) ringsRef.current.push({ ...h, born: now });
        acc -= FIXED_DT;
      }
      ringsRef.current = ringsRef.current.filter((r) => now - r.born < 400);
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) drawFrame(ctx, g, aimRef.current, ringsRef.current, now);
      setHud((prev) =>
        prev.ballsLeft === g.ballsLeft && prev.orangeLeft === g.orangeRemaining && prev.score === g.score
          ? prev
          : { ballsLeft: g.ballsLeft, orangeLeft: g.orangeRemaining, score: g.score },
      );
      setStatus((prev) => (prev === g.status ? prev : g.status));
      if ((g.status === 'won' || g.status === 'lost') && !finishedRef.current) {
        finishedRef.current = true;
        void finishGame(g);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function updateAim(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    aimRef.current = clampAimAngle(Math.atan2(y - CANNON_Y, x - CANNON_X));
  }

  function startMode(nextMode: Mode, opts: { chain?: boolean } = {}) {
    setMode(nextMode);
    modeRef.current = nextMode;
    setView('play');
    setSync('idle');
    setRound(nextMode === 'endless' && opts.chain ? (r) => r + 1 : () => 1);
    const seed = nextMode === 'daily' ? dailySeed(GAME_ID, dateKeyUTC()) : randomSeed();
    const target = orangeTargetFor(nextMode);
    gameRef.current = createGame(seed, target);
    ringsRef.current = [];
    finishedRef.current = false;
    aimRef.current = Math.PI / 2;
    setHud({ ballsLeft: BALLS_PER_GAME, orangeLeft: target, score: 0 });
    setStatus('aiming');
    setResetKey((k) => k + 1);
  }

  const over = status === 'won' || status === 'lost';

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🟠 Peggle</h1>
        <p className="hint arcade-head">
          Aim with your mouse or finger, release to fire. Clear all{' '}
          {orangeTargetFor(mode)} orange pegs!
        </p>

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => startMode('daily')}
          >
            Today's Map
          </button>
          <button
            className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`}
            onClick={() => startMode('endless')}
          >
            Endless
          </button>
        </div>

        {(
          <>
            <div className="peggle-hud">
              {mode === 'endless' && <span className="peggle-hud-round">Map {round}</span>}
              <div className="peggle-stat">
                <span className="peggle-stat-label">Balls</span>
                <span className="peggle-stat-value">{hud.ballsLeft}</span>
              </div>
              <div className="peggle-stat">
                <span className="peggle-stat-label">Orange</span>
                <span className="peggle-stat-value peggle-stat-orange">{hud.orangeLeft}</span>
              </div>
              <div className="peggle-stat">
                <span className="peggle-stat-label">Score</span>
                <span className="peggle-stat-value">{hud.score.toLocaleString()}</span>
              </div>
            </div>

            <canvas
              ref={canvasRef}
              className="peggle-canvas"
              width={WIDTH}
              height={HEIGHT}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                updateAim(e);
              }}
              onPointerMove={updateAim}
              onPointerUp={(e) => {
                updateAim(e);
                fireBall(gameRef.current, aimRef.current);
              }}
            />

            {over && (
              <div className="peggle-result">
                {status === 'won' ? (
                  <h2 className="peggle-fever">EXTREME FEVER!</h2>
                ) : (
                  <h2 className="peggle-loss">Out of balls!</h2>
                )}
                <p className="peggle-final">
                  Score: <strong>{hud.score.toLocaleString()}</strong>
                  {status === 'won'
                    ? ` · ${hud.ballsLeft} ball${hud.ballsLeft === 1 ? '' : 's'} unused (+${(hud.ballsLeft * 1000).toLocaleString()})`
                    : ` · ${orangeTargetFor(mode) - hud.orangeLeft}/${orangeTargetFor(mode)} orange cleared`}
                </p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">Come back tomorrow for a new map!</p>
                  ) : (
                    <button className="btn btn-primary" onClick={() => startMode('endless', { chain: true })}>
                      Next map
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
