import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { play } from '../../audio';
import { ensureSignedIn } from '../../arcade/auth';
import { dailySeed, dateKeyUTC } from '../../arcade/dailySeed';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import { useStore } from '../../store';
import { countCrossings, edgesCross, generateLevel, type Point, type UntangleLevel } from './engine';
import './styles.css';

const GAME_ID = 'untangle';
/** The daily puzzle is always the easiest tier (same node count as endless
 *  level 1) — a shared, low-friction ritual, not the escalating challenge. */
const DAILY_NODE_COUNT = 8;

type Mode = 'daily' | 'endless';
type View = 'play' | 'leaderboard';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

/** Level N (endless only): 8 pins, growing by 2 per level up to 24. */
function nodeCountFor(level: number): number {
  return 8 + 2 * Math.min(level - 1, 8);
}

/**
 * Direct-record game (same pattern as Sand Play/Peggle): no discrete move
 * log — dragging pins is continuous — so on solve it records the elapsed
 * time straight through recordResult()/flushOutbox(). Daily mode is a
 * single fixed-difficulty puzzle shared by seed; endless keeps its own
 * escalating level chain, untouched.
 */
export default function UntangleGame() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<Mode>('daily');
  const [view, setView] = useState<View>('play');
  const [levelNum, setLevelNum] = useState(1);
  const [level, setLevel] = useState<UntangleLevel>(() =>
    generateLevel(dailySeed(GAME_ID, dateKeyUTC()), DAILY_NODE_COUNT),
  );
  const [positions, setPositions] = useState<Point[]>(level.nodes);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [sync, setSync] = useState<SyncBadge>('idle');

  const positionsRef = useRef(positions);
  const draggedRef = useRef(false);
  const solvedRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  useEffect(() => {
    if (solved) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 100);
    return () => window.clearInterval(id);
  }, [solved, level]);

  const crossings = useMemo(() => {
    const crossed = new Set<number>();
    let count = 0;
    for (let i = 0; i < level.edges.length; i++) {
      for (let j = i + 1; j < level.edges.length; j++) {
        if (edgesCross(positions, level.edges[i]!, level.edges[j]!)) {
          crossed.add(i);
          crossed.add(j);
          count++;
        }
      }
    }
    return { crossed, count };
  }, [positions, level]);

  /** Paint order = stacking order (SVG). Ropes tied to the pin being
   *  dragged render last, so the rope you're moving always reads as the
   *  one lying on top of the pile. */
  const edgeOrder = useMemo(() => {
    const order = level.edges.map((_, i) => i);
    if (dragIdx === null) return order;
    const touches = (i: number) => level.edges[i]!.a === dragIdx || level.edges[i]!.b === dragIdx;
    return order.sort((x, y) => Number(touches(x)) - Number(touches(y)));
  }, [level, dragIdx]);

  function applyLevel(next: UntangleLevel) {
    setLevel(next);
    setPositions(next.nodes);
    positionsRef.current = next.nodes;
    setDragIdx(null);
    setSolved(false);
    solvedRef.current = false;
    draggedRef.current = false;
    startTimeRef.current = Date.now();
    setElapsedMs(0);
    setSync('idle');
    setView('play');
  }

  function startDaily() {
    setMode('daily');
    setLevelNum(1);
    applyLevel(generateLevel(dailySeed(GAME_ID, dateKeyUTC()), DAILY_NODE_COUNT));
  }

  /** Endless level chain: "Next level" keeps counting; restarting from the
   *  Endless tab starts the run over at level 1. */
  function startLevel(n: number) {
    setMode('endless');
    setLevelNum(n);
    applyLevel(generateLevel(randomSeed(), nodeCountFor(n)));
  }

  async function finishLevel(elapsed: number) {
    play('win');
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode,
      dateKey: mode === 'daily' ? dateKeyUTC() : null,
      score: elapsed,
      stats: { level: levelNum, nodes: level.nodes.length },
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

  function svgPoint(e: PointerEvent): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return { x: Math.min(0.97, Math.max(0.03, x)), y: Math.min(0.97, Math.max(0.03, y)) };
  }

  function onPinDown(e: PointerEvent<SVGCircleElement>, i: number) {
    if (solved) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIdx(i);
  }

  function onPinMove(e: PointerEvent<SVGCircleElement>, i: number) {
    if (dragIdx !== i || solved) return;
    draggedRef.current = true;
    const point = svgPoint(e);
    const next = positionsRef.current.map((q, k) => (k === i ? point : q));
    positionsRef.current = next;
    setPositions(next);
  }

  function onPinUp(e: PointerEvent<SVGCircleElement>, i: number) {
    if (dragIdx !== i) return;
    setDragIdx(null);
    // Win check on release only — a trivially-uncrossed start can't happen
    // (the generator guarantees ≥1 crossing), and at least one drag must
    // have moved a pin.
    if (
      !solvedRef.current &&
      draggedRef.current &&
      countCrossings(positionsRef.current, level.edges) === 0
    ) {
      solvedRef.current = true;
      const elapsed = Date.now() - startTimeRef.current;
      setElapsedMs(elapsed);
      setSolved(true);
      void finishLevel(elapsed);
    }
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🪢 Rope Untangle</h1>
        <p className="hint arcade-head">
          Drag the pins until no two ropes cross.
        </p>

        <div className="arcade-tabs">
          <button className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`} onClick={startDaily}>
            Today's Puzzle
          </button>
          <button className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`} onClick={() => startLevel(1)}>
            Endless
          </button>
        </div>

        {(
          <>
            <div className="untangle-hud">
              <span>{mode === 'daily' ? "Today's Puzzle" : `Level ${levelNum}`}</span>
              <span>
                {crossings.count} crossing{crossings.count === 1 ? '' : 's'}
              </span>
              <span>⏱ {formatTime(elapsedMs)}</span>
            </div>

            <div className="untangle-board-wrap">
              <svg ref={svgRef} className="untangle-board" viewBox="0 0 100 100">
                {edgeOrder.map((i) => {
                  const e = level.edges[i]!;
                  const a = positions[e.a]!;
                  const b = positions[e.b]!;
                  const x1 = a.x * 100;
                  const y1 = a.y * 100;
                  const x2 = b.x * 100;
                  const y2 = b.y * 100;
                  // Perpendicular offset for the highlight sheen — a thin
                  // bright line riding just off-center makes the rope read
                  // as a rounded cord instead of a flat stroke.
                  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
                  const ox = (-(y2 - y1) / len) * 0.38;
                  const oy = ((x2 - x1) / len) * 0.38;
                  const active =
                    dragIdx !== null && (e.a === dragIdx || e.b === dragIdx);
                  return (
                    <g
                      key={i}
                      className={`untangle-rope ${
                        crossings.crossed.has(i) ? 'untangle-rope-crossed' : 'untangle-rope-clear'
                      }${active ? ' untangle-rope-active' : ''}`}
                    >
                      {/* Dark casing: at a crossing, the top rope's casing
                          visibly severs the rope beneath — the over/under
                          cue. Core and sheen stack inside it. */}
                      <line className="untangle-rope-casing" x1={x1} y1={y1} x2={x2} y2={y2} />
                      <line className="untangle-rope-core" x1={x1} y1={y1} x2={x2} y2={y2} />
                      <line
                        className="untangle-rope-sheen"
                        x1={x1 + ox}
                        y1={y1 + oy}
                        x2={x2 + ox}
                        y2={y2 + oy}
                      />
                    </g>
                  );
                })}
                {positions.map((pt, i) => (
                  <g key={i}>
                    <circle
                      className={`untangle-pin${dragIdx === i ? ' untangle-pin-drag' : ''}`}
                      cx={pt.x * 100}
                      cy={pt.y * 100}
                      r={dragIdx === i ? 4.6 : 3.1}
                    />
                    <circle
                      className="untangle-hit"
                      cx={pt.x * 100}
                      cy={pt.y * 100}
                      r={7}
                      onPointerDown={(e) => onPinDown(e, i)}
                      onPointerMove={(e) => onPinMove(e, i)}
                      onPointerUp={(e) => onPinUp(e, i)}
                      onPointerCancel={(e) => onPinUp(e, i)}
                    />
                  </g>
                ))}
              </svg>

              {solved && (
                <div className="untangle-overlay">
                  <span>Untangled! 🎉</span>
                </div>
              )}
            </div>

            {solved && (
              <div className="untangle-result">
                <h2>{mode === 'daily' ? 'Untangled' : `Level ${levelNum} solved`} in {formatTime(elapsedMs)}</h2>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">Come back tomorrow for a new puzzle!</p>
                  ) : (
                    <button className="btn btn-primary" onClick={() => startLevel(levelNum + 1)}>
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
