import { useEffect, useRef, useState } from 'react';
import { BOMBER_H, BOMBER_W, type BomberDir } from '@shared/bomberman';
import { backToLobby, leaveParty, nextRound, pauseGame, resumeGame, sendAction } from '../../socket';
import { useStore } from '../../store';
import VolumeControl from '../../components/VolumeControl';
import { IconMenu, IconPause } from '../../components/icons';

const W = BOMBER_W;
const H = BOMBER_H;

const KEY_DIRS: Record<string, BomberDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

const PU_LABEL: Record<string, string> = { f: '🔥', p: '⚡', s: '🐌', g: '🧤', b: '👢', x: '💣' };

/** A pixel-y stick figure in the player's color; limbs swing while `.walking`. */
function StickFigure({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 32" className="bomber-stick">
      {/* square head reads more 8-bit than a circle */}
      <rect x="7.6" y="2" width="8.8" height="8.8" fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth="1.4" />
      <g stroke={color} strokeWidth="2.8" strokeLinecap="square" fill="none">
        <path d="M12 11.5v10" />
        <g className="bomber-arm-l"><path d="M12 13.5L5.5 18.5" /></g>
        <g className="bomber-arm-r"><path d="M12 13.5L18.5 18.5" /></g>
        <g className="bomber-leg-l"><path d="M12 21.5l-5 8" /></g>
        <g className="bomber-leg-r"><path d="M12 21.5l5 8" /></g>
      </g>
    </svg>
  );
}

export default function BombermanGame() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [menuOpen, setMenuOpen] = useState(false);
  // Keys currently held, oldest→newest; the newest drives the direction.
  const held = useRef<BomberDir[]>([]);
  const lastSent = useRef<BomberDir | null>(null);

  const playing = !!game && game.g === 'bomberman' && !game.result && !game.paused;

  useEffect(() => {
    if (!playing) return;

    function send(dir: BomberDir | null) {
      if (lastSent.current === dir) return;
      lastSent.current = dir;
      void sendAction({ t: 'input', dir });
    }

    function onKeyDown(e: KeyboardEvent) {
      const dir = KEY_DIRS[e.code];
      if (dir) {
        e.preventDefault();
        if (!held.current.includes(dir)) held.current.push(dir);
        send(held.current[held.current.length - 1] ?? null);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) void sendAction({ t: 'bomb' });
      } else if (e.code === 'KeyE') {
        e.preventDefault();
        if (!e.repeat) void sendAction({ t: 'grab' });
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      const dir = KEY_DIRS[e.code];
      if (!dir) return;
      held.current = held.current.filter((d) => d !== dir);
      send(held.current[held.current.length - 1] ?? null);
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      held.current = [];
      if (lastSent.current !== null) {
        lastSent.current = null;
        void sendAction({ t: 'input', dir: null });
      }
    };
  }, [playing]);

  if (!game || game.g !== 'bomberman' || !lobby) return null;

  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const meAlive = game.players.find((p) => p.seat === game.yourSeat)?.alive ?? false;
  const winner =
    game.result && game.result.winnerSeat !== null
      ? game.players.find((p) => p.seat === game.result!.winnerSeat)
      : null;

  const status = game.result
    ? ''
    : game.shrinking
      ? '⚠ The walls are closing in!'
      : game.suddenDeathSecondsLeft !== null
        ? `Sudden death in ${fmt(game.suddenDeathSecondsLeft)}`
        : meAlive
          ? 'Last one standing wins'
          : 'You were eliminated — spectating';

  return (
    <div className="bomber">
      <div className="bomber-hud">
        <div className="bomber-chips">
          {game.players.map((p) => (
            <div key={p.seat} className={`bomber-chip${p.alive ? '' : ' dead'}`}>
              <span className="bomber-chip-dot" style={{ background: p.color }} />
              <span className="bomber-chip-name">
                {p.nickname}
                {p.seat === game.yourSeat && <span className="you-tag"> (you)</span>}
              </span>
              {game.settings.lives > 1 && p.alive && (
                <span className="bomber-lives">{'♥'.repeat(p.lives)}</span>
              )}
              {p.wins > 0 && <span className="uttt-chip-wins">{p.wins}</span>}
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
                (game.paused ? (
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

      <div className={`bomber-status${game.shrinking ? ' urgent' : ''}`}>{status}</div>

      <div className="bomber-board">
        {game.grid.map((row, y) =>
          row.split('').map((ch, x) => {
            if (ch === '.') return null; // plain floor = board background
            const cls = ch === '#' ? 'wall' : ch === 'B' ? 'brick' : 'powerup';
            return (
              <div key={`${x},${y}`} className={`bomber-cell ${cls}`} style={cellPos(x, y)}>
                {PU_LABEL[ch] ?? ''}
              </div>
            );
          }),
        )}

        {game.explosions.map((cell) => (
          <div key={`x${cell}`} className="bomber-flame" style={cellPos(cell % W, Math.floor(cell / W))} />
        ))}

        {game.bombs.map((b) => (
          <div
            key={`b${b.id}`}
            className={`bomber-bomb${b.ticksLeft < 16 ? ' fizzing' : ''}${b.carriedBySeat !== null ? ' carried' : ''}`}
            style={movePos(b.x, b.y, 100)}
          />
        ))}

        {game.players.map(
          (p) =>
            p.alive && (
              <div
                key={`p${p.seat}`}
                className={`bomber-player${p.slowed ? ' slowed' : ''}${p.invulnerable ? ' invulnerable' : ''}${p.moving ? ' walking' : ''}`}
                // The tween duration matches this player's server step so the
                // figure glides continuously; --step paces the limb swing too.
                style={{ ...movePos(p.x, p.y, p.stepMs), '--step': `${p.stepMs}ms` } as React.CSSProperties}
              >
                <StickFigure color={p.color} />
                {p.carrying && <div className="bomber-carry" />}
              </div>
            ),
        )}
      </div>

      <div className="bomber-keys hint">WASD / arrows move · Space bombs · E grab &amp; throw</div>

      {game.paused && !game.result && (
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

      {game.result && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>
              {winner ? (
                <>
                  <span className="bomber-chip-dot big" style={{ background: winner.color }} />{' '}
                  {winner.nickname} wins!
                </>
              ) : (
                'Everyone went out with a bang — draw.'
              )}
            </h2>
            <table className="scoreboard">
              <tbody>
                {[...game.players]
                  .sort((a, b) => b.wins - a.wins)
                  .map((p) => (
                    <tr key={p.seat}>
                      <td>
                        <span className="bomber-chip-dot" style={{ background: p.color }} /> {p.nickname}
                      </td>
                      <td className="score-wins">{p.wins}</td>
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

function cellPos(x: number, y: number) {
  return {
    left: `${(x / W) * 100}%`,
    top: `${(y / H) * 100}%`,
    width: `${100 / W}%`,
    height: `${100 / H}%`,
  };
}

/** GPU-tweened position for moving pieces: translate in own-cell units. */
function movePos(x: number, y: number, ms: number) {
  return {
    left: 0,
    top: 0,
    width: `${100 / W}%`,
    height: `${100 / H}%`,
    transform: `translate(${x * 100}%, ${y * 100}%)`,
    transition: `transform ${ms}ms linear`,
  };
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
