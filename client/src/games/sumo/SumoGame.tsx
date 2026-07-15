import { useEffect, useRef, useState } from 'react';
import {
  SUMO_TOP_RADIUS,
  SUMO_WORLD,
  type SumoView,
} from '@shared/sumo';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import VolumeControl from '../../components/VolumeControl';
import { IconBot, IconMenu, IconPause, IconTrophy } from '../../components/icons';

const CANVAS = 720; // logical pixels; CSS scales it
const K = CANVAS / SUMO_WORLD;
const SEND_MS = 70;
const JOY_RADIUS = 56; // px, on-screen joystick throw

interface Smooth {
  x: number;
  y: number;
  spin: number;
}

function fmtClock(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export default function SumoGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SumoView | null>(null);
  const smooth = useRef(new Map<number, Smooth>());
  const keys = useRef(new Set<string>());
  const mouse = useRef<{ held: boolean; x: number; y: number }>({ held: false, x: 0, y: 0 });
  const joy = useRef<{ id: number; ox: number; oy: number; x: number; y: number } | null>(null);
  const lastSent = useRef({ x: 0, y: 0 });
  const [joyView, setJoyView] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);

  const view = game && game.g === 'sumo' ? (game as SumoView) : null;
  viewRef.current = view;
  const me = view?.players.find((p) => p.seat === view.yourSeat) ?? null;
  const playing = !!view && !view.paused && view.result === null;

  // ── input: aggregate keys / mouse-follow / joystick into one stick vector ──
  function currentStick(): { x: number; y: number } {
    const k = keys.current;
    let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let y = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
    if (x !== 0 || y !== 0) {
      const m = Math.hypot(x, y);
      return { x: x / m, y: y / m };
    }
    if (joy.current) {
      return { x: joy.current.x, y: joy.current.y };
    }
    const v = viewRef.current;
    if (mouse.current.held && v) {
      const self = v.players.find((p) => p.seat === v.yourSeat);
      if (self?.alive) {
        x = mouse.current.x - self.x;
        y = mouse.current.y - self.y;
        const m = Math.hypot(x, y);
        if (m < SUMO_TOP_RADIUS) return { x: 0, y: 0 }; // deadzone: hovering over the top
        return { x: x / m, y: y / m };
      }
    }
    return { x: 0, y: 0 };
  }

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const s = currentStick();
      const last = lastSent.current;
      if (Math.hypot(s.x - last.x, s.y - last.y) > 0.04) {
        lastSent.current = s;
        void sendAction({ t: 'stick', x: Math.round(s.x * 100) / 100, y: Math.round(s.y * 100) / 100 });
      }
    }, SEND_MS);
    return () => {
      window.clearInterval(timer);
      lastSent.current = { x: 0, y: 0 };
      void sendAction({ t: 'stick', x: 0, y: 0 });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
        e.preventDefault();
        keys.current.add(k);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => keys.current.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // ── render loop (interpolates 20Hz server states to 60fps) ────────────────
  useEffect(() => {
    let raf = 0;
    let lastT = performance.now();
    const render = (t: number) => {
      raf = requestAnimationFrame(render);
      const dt = Math.min((t - lastT) / 1000, 0.1);
      lastT = t;
      const canvas = canvasRef.current;
      const v = viewRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || !v) return;

      ctx.clearRect(0, 0, CANVAS, CANVAS);

      // arena
      const cx = CANVAS / 2;
      const r = v.arenaRadius * K;
      ctx.beginPath();
      ctx.arc(cx, cx, r + 8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cx, r, 0, Math.PI * 2);
      ctx.fillStyle = v.shrinking ? 'rgba(120,52,44,0.55)' : 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = v.shrinking ? 'rgba(232,120,90,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.stroke();
      if (v.holeRadius > 0) {
        ctx.beginPath();
        ctx.arc(cx, cx, v.holeRadius * K, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // tops
      const blend = 1 - Math.exp(-dt * 14);
      for (const p of v.players) {
        if (!p.alive) {
          smooth.current.delete(p.seat);
          continue;
        }
        let sm = smooth.current.get(p.seat);
        if (!sm) {
          sm = { x: p.x, y: p.y, spin: 0 };
          smooth.current.set(p.seat, sm);
        }
        sm.x += (p.x - sm.x) * blend;
        sm.y += (p.y - sm.y) * blend;
        const spin01 = p.spin / 100;
        // Blade rate tracks remaining rotation — a drained top visibly dies.
        sm.spin += dt * (1.5 + p.speed * 0.25 + spin01 * 9);

        let px = sm.x * K;
        let py = sm.y * K;
        const pr = SUMO_TOP_RADIUS * K;
        if (spin01 < 0.35) {
          // Low spin: the top wobbles on its axis.
          const wob = ((0.35 - spin01) / 0.35) * pr * 0.12;
          px += Math.sin(t / 42) * wob;
          py += Math.cos(t / 51) * wob;
        }
        ctx.save();
        ctx.globalAlpha = p.ghost ? 0.45 : 1;
        // body
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = p.seat === v.yourSeat ? 4 : 2;
        ctx.strokeStyle = p.seat === v.yourSeat ? '#ffffff' : 'rgba(0,0,0,0.55)';
        ctx.stroke();
        // spinning blades
        ctx.translate(px, py);
        ctx.rotate(sm.spin);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        for (let b = 0; b < 3; b++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.ellipse(pr * 0.62, 0, pr * 0.3, pr * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.rotate(-sm.spin);
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.beginPath();
        ctx.arc(0, 0, pr * 0.22, 0, Math.PI * 2);
        ctx.fill();
        // Spin gauge: the arc empties as the rotation drains.
        ctx.beginPath();
        ctx.arc(0, 0, pr + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * spin01);
        ctx.lineWidth = 3;
        ctx.strokeStyle =
          spin01 > 0.35 ? 'rgba(255,255,255,0.55)' : 'rgba(240,120,90,0.9)';
        ctx.stroke();
        ctx.restore();

        // name
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(p.nickname, px, py + pr + 16);
      }
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!view || !lobby || !me) return null;

  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const winners = view.result?.winnerSeats ?? [];
  const winnerNames = winners
    .map((w) => view.players.find((p) => p.seat === w)?.nickname)
    .filter(Boolean)
    .join(' & ');

  const status = view.result
    ? ''
    : view.mode === 'lives'
      ? view.shrinking
        ? '⚠ The arena is shrinking!'
        : view.secondsLeft !== null
          ? `Shrinks in ${view.secondsLeft}s`
          : ''
      : `${fmtClock(view.secondsLeft ?? 0)} — most knockouts wins`;

  // ── pointer handling: mouse steer-while-held, touch joystick ──────────────
  function worldPos(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * SUMO_WORLD,
      y: ((e.clientY - rect.top) / rect.height) * SUMO_WORLD,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!playing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.pointerType === 'mouse') {
      mouse.current.held = true;
      const w = worldPos(e);
      mouse.current.x = w.x;
      mouse.current.y = w.y;
    } else {
      joy.current = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
      setJoyView({ ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 });
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'mouse') {
      const w = worldPos(e);
      mouse.current.x = w.x;
      mouse.current.y = w.y;
      return;
    }
    const j = joy.current;
    if (!j || j.id !== e.pointerId) return;
    let dx = e.clientX - j.ox;
    let dy = e.clientY - j.oy;
    const m = Math.hypot(dx, dy);
    if (m > JOY_RADIUS) {
      dx = (dx / m) * JOY_RADIUS;
      dy = (dy / m) * JOY_RADIUS;
    }
    j.x = dx / JOY_RADIUS;
    j.y = dy / JOY_RADIUS;
    setJoyView({ ox: j.ox, oy: j.oy, dx, dy });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (e.pointerType === 'mouse') {
      mouse.current.held = false;
      return;
    }
    if (joy.current?.id === e.pointerId) {
      joy.current = null;
      setJoyView(null);
    }
  }

  return (
    <div className="sumo">
      <div className="sumo-hud">
        <div className="sumo-players">
          {view.players.map((p) => (
            <div key={p.seat} className={`sumo-chip${p.eliminated ? ' out' : ''}`}>
              <span className="sumo-chip-color" style={{ background: p.color }} />
              <span className="sumo-chip-name">
                {p.isBot && (
                  <span className="bot-glyph">
                    <IconBot />
                  </span>
                )}
                {p.nickname}
                {p.seat === view.yourSeat && <span className="you-tag"> (you)</span>}
              </span>
              <span className="sumo-chip-stat">
                {view.mode === 'lives' ? '♥'.repeat(Math.max(0, p.lives)) || '—' : `${p.kos} KO`}
              </span>
            </div>
          ))}
        </div>
        <div className="hud-menu">
          <button className="btn hud-btn" onClick={() => setMenuOpen((o) => !o)}>
            <IconMenu /> Menu
          </button>
          {menuOpen && (
            <div className="hud-dropdown">
              <div className="menu-section">
                <span className="menu-section-title">Sound</span>
                <VolumeControl />
              </div>
              {isHost &&
                !view.result &&
                (view.paused ? (
                  <button className="btn" onClick={() => void resumeGame().then(() => setMenuOpen(false))}>
                    Resume
                  </button>
                ) : (
                  <button className="btn" onClick={() => void pauseGame().then(() => setMenuOpen(false))}>
                    Pause
                  </button>
                ))}
              {isHost && (
                <button
                  className="btn"
                  onClick={() => {
                    if (confirm('End the game and return everyone to the lobby?')) void backToLobby();
                    setMenuOpen(false);
                  }}
                >
                  End game
                </button>
              )}
              <button className="btn" onClick={leaveParty}>
                Leave
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={`sumo-status${view.shrinking ? ' danger' : ''}`}>{status}</div>

      <canvas
        ref={canvasRef}
        className="sumo-canvas"
        width={CANVAS}
        height={CANVAS}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />

      {joyView && (
        <div className="sumo-joy" style={{ left: joyView.ox, top: joyView.oy }}>
          <div className="sumo-joy-knob" style={{ transform: `translate(${joyView.dx}px, ${joyView.dy}px)` }} />
        </div>
      )}

      <p className="sumo-help hint">
        WASD / arrows steer · hold the mouse to chase it · touch &amp; drag for a joystick ·
        the ring shows your spin — trade too many hits and you'll fly like a leaf
      </p>

      {view.paused && !view.result && (
        <div className="overlay">
          <div className="overlay-card pause-card">
            <h2>
              <IconPause /> Game paused
            </h2>
            {isHost ? (
              <button className="btn btn-primary" onClick={() => void resumeGame()}>
                Resume
              </button>
            ) : (
              <p className="hint">Waiting for the host to resume…</p>
            )}
          </div>
        </div>
      )}

      {view.result && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>
              {winners.length === 0 ? (
                "It's a draw."
              ) : (
                <>
                  <IconTrophy /> {winnerNames} win{winners.length === 1 ? 's' : ''}!
                </>
              )}
            </h2>
            <table className="scoreboard">
              <tbody>
                {[...view.players]
                  .sort((a, b) => b.kos - a.kos || b.lives - a.lives)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        <span className="sumo-chip-color" style={{ background: p.color }} /> {p.nickname}
                        {p.seat === view.yourSeat ? ' (you)' : ''}
                      </td>
                      <td className="score-wins">
                        {p.kos} KO{view.mode === 'lives' ? ` · ${Math.max(0, p.lives)}♥` : ''}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {isHost ? (
              <div className="overlay-actions">
                <button className="btn" onClick={() => void backToLobby()}>
                  Back to lobby
                </button>
                <button className="btn btn-primary" onClick={() => void nextRound()}>
                  Play again
                </button>
              </div>
            ) : (
              <p className="hint">Waiting for the host to continue…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
