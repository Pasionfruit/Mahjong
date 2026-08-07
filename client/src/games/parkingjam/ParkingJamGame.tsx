import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { EXIT_ROW, GRID, RED_ID, parkingJamModule, vehicleCells, type Vehicle } from './engine';
import './styles.css';

const RED_COLOR = '#e25555';
const CAR_COLORS = ['#7fb8e8', '#6bd68a', '#b389e0', '#4fd0d0', '#e8c15a', '#d99a6c'];
const TRUCK_COLORS = ['#5a86ad', '#4e9c68', '#8465a8', '#3b9c9c', '#b0913f', '#a8764e'];
const TAP_SLOP_PX = 8;

function vehicleColor(v: Vehicle): string {
  if (v.id === RED_ID) return RED_COLOR;
  const bank = v.len === 3 ? TRUCK_COLORS : CAR_COLORS;
  return bank[(v.id - 1) % bank.length] ?? bank[0]!;
}

/** How many cells a vehicle can slide each way, given the other vehicles. */
function legalSpan(vehicles: Vehicle[], id: number): { min: number; max: number } {
  const idx = vehicles.findIndex((veh) => veh.id === id);
  const v = vehicles[idx];
  if (!v) return { min: 0, max: 0 };
  const occ = new Array<boolean>(GRID * GRID).fill(false);
  vehicles.forEach((veh, i) => {
    if (i !== idx) for (const [r, c] of vehicleCells(veh)) occ[r * GRID + c] = true;
  });
  const base = v.horizontal ? v.col : v.row;
  const free = (np: number, dir: number): boolean => {
    const lead = dir > 0 ? np + v.len - 1 : np;
    if (np < 0 || lead >= GRID) return false;
    const r = v.horizontal ? v.row : lead;
    const c = v.horizontal ? lead : v.col;
    return !occ[r * GRID + c];
  };
  let min = 0;
  while (free(base + min - 1, -1)) min--;
  let max = 0;
  while (free(base + max + 1, 1)) max++;
  return { min, max };
}

interface DragInfo {
  vehicleId: number;
  horizontal: boolean;
  startClient: number;
  cellPx: number;
  minPx: number;
  maxPx: number;
  offsetPx: number;
  moved: boolean;
}

export default function ParkingJamGame() {
  const { seed, state, status, result, sync, move, start, forceSync } = useSoloGame(
    parkingJamModule,
    () => undefined,
  );
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [selected, setSelected] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Endless-only game: supersede the hook's default daily auto-start.
  // The token guard inside start() makes the later call win.
  useEffect(() => {
    void start('endless', { fresh: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelected(null);
    dragRef.current = null;
    setDrag(null);
  }, [seed]);

  const playing = status === 'playing';

  // Desktop: tap-to-select + arrow keys along the vehicle's axis.
  useEffect(() => {
    if (!playing || selected === null || !state) return;
    const veh = state.vehicles.find((x) => x.id === selected);
    if (!veh) return;
    const vehicleId = veh.id;
    const keys: Record<string, number> = veh.horizontal
      ? { ArrowLeft: -1, ArrowRight: 1 }
      : { ArrowUp: -1, ArrowDown: 1 };
    function onKey(e: KeyboardEvent) {
      const delta = keys[e.key];
      if (!delta) return;
      e.preventDefault();
      void move({ vehicleId, delta });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, selected, state]);

  function updateDrag(next: DragInfo | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function onVehicleDown(e: PointerEvent<HTMLDivElement>, veh: Vehicle) {
    if (!playing || !state || dragRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = boardRef.current?.getBoundingClientRect();
    const cellPx = rect ? rect.width / GRID : 48;
    const span = legalSpan(state.vehicles, veh.id);
    updateDrag({
      vehicleId: veh.id,
      horizontal: veh.horizontal,
      startClient: veh.horizontal ? e.clientX : e.clientY,
      cellPx,
      minPx: span.min * cellPx,
      maxPx: span.max * cellPx,
      offsetPx: 0,
      moved: false,
    });
  }

  function onVehicleMove(e: PointerEvent<HTMLDivElement>, veh: Vehicle) {
    const d = dragRef.current;
    if (!d || d.vehicleId !== veh.id) return;
    const raw = (d.horizontal ? e.clientX : e.clientY) - d.startClient;
    const offsetPx = Math.max(d.minPx, Math.min(d.maxPx, raw));
    updateDrag({ ...d, offsetPx, moved: d.moved || Math.abs(raw) > TAP_SLOP_PX });
  }

  function onVehicleUp(e: PointerEvent<HTMLDivElement>, veh: Vehicle) {
    const d = dragRef.current;
    if (!d || d.vehicleId !== veh.id) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const cells = Math.round(d.offsetPx / d.cellPx);
    updateDrag(null);
    if (cells !== 0) {
      setSelected(null);
      void move({ vehicleId: veh.id, delta: cells });
    } else if (!d.moved) {
      setSelected((cur) => (cur === veh.id ? null : veh.id));
    }
  }

  if (!state) return null;

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🚗 Parking Jam</h1>

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' ? ' active' : ''}`}
            onClick={() => setView('play')}
          >
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
            <h3>All-Time Best (Fewest Moves)</h3>
            <LeaderboardPanel gameId="parkingjam" mode="endless" dateKey={dateKeyUTC()} ascending={true} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="parkingjam-hud">
              <span>Moves: {state.moves}</span>
              <span className="parkingjam-optimal">Optimal: {state.optimalMoves}</span>
            </div>
            <p className="hint parkingjam-hint">
              Drag cars along their lane — free the red car through the exit on the right.
            </p>

            <div className="parkingjam-wrap">
              <div className="parkingjam-board" ref={boardRef}>
                {Array.from({ length: GRID * GRID }).map((_, i) => (
                  <div key={i} className="parkingjam-cell" />
                ))}
                {state.vehicles.map((veh) => {
                  const dragging = drag?.vehicleId === veh.id;
                  const exiting = veh.id === RED_ID && status === 'won';
                  const style: CSSProperties = {
                    left: `calc(${veh.col} * 100% / ${GRID})`,
                    top: `calc(${veh.row} * 100% / ${GRID})`,
                    width: `calc(${veh.horizontal ? veh.len : 1} * 100% / ${GRID})`,
                    height: `calc(${veh.horizontal ? 1 : veh.len} * 100% / ${GRID})`,
                    backgroundColor: vehicleColor(veh),
                  };
                  if (dragging && drag) {
                    style.transform = veh.horizontal
                      ? `translateX(${drag.offsetPx}px)`
                      : `translateY(${drag.offsetPx}px)`;
                  }
                  const cls = [
                    'parkingjam-vehicle',
                    veh.horizontal ? 'parkingjam-h' : 'parkingjam-v',
                    veh.len === 3 ? 'parkingjam-truck' : '',
                    veh.id === RED_ID ? 'parkingjam-red' : '',
                    selected === veh.id ? 'parkingjam-selected' : '',
                    dragging ? 'parkingjam-dragging' : '',
                    exiting ? 'parkingjam-exiting' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <div
                      key={veh.id}
                      className={cls}
                      style={style}
                      onPointerDown={(e) => onVehicleDown(e, veh)}
                      onPointerMove={(e) => onVehicleMove(e, veh)}
                      onPointerUp={(e) => onVehicleUp(e, veh)}
                      onPointerCancel={() => updateDrag(null)}
                    />
                  );
                })}
              </div>
              <div
                className="parkingjam-exit"
                style={{ top: `calc((${EXIT_ROW} + 0.5) * 100% / ${GRID})` }}
                aria-hidden
              >
                ➜
              </div>
            </div>

            <div className="arcade-actions">
              <button className="btn" onClick={() => void start('endless', { fresh: true })}>
                New puzzle
              </button>
            </div>

            {!playing && (
              <div className="parkingjam-result">
                <h2>Escaped in {result?.score} moves!</h2>
                <p className="hint">Optimal was {result?.stats?.optimal} moves.</p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>
                    {sync === 'saving' ? 'saving…' : sync}
                  </span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>All-Time Best (Fewest Moves)</h3>
                <LeaderboardPanel
                  gameId="parkingjam"
                  mode="endless"
                  dateKey={dateKeyUTC()}
                  ascending={true}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
                <div className="arcade-actions">
                  <button className="btn btn-primary" onClick={() => void start('endless', { fresh: true })}>
                    New puzzle
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
