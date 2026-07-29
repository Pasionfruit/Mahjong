import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { SIZE, twenty48Module, type Direction, type Tile } from './engine';

const KEY_TO_DIR: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

const SWIPE_THRESHOLD = 24;
const POP_MS = 160;

function tileClass(value: number): string {
  return `twenty48-tile twenty48-t${value <= 2048 ? value : 'max'}`;
}

export default function Twenty48Game() {
  const { mode, state, status, result, signedIn, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(twenty48Module, () => undefined);
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [poppedIds, setPoppedIds] = useState<Set<number>>(new Set());
  const [spawnedIds, setSpawnedIds] = useState<Set<number>>(new Set());
  const prevGridRef = useRef<(Tile | null)[] | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const playing = status === 'playing';

  // A fresh round (new seed) must not diff against the previous round's
  // tile ids — same id space (1, 2, 3…) restarting could otherwise look
  // like a spurious merge.
  useEffect(() => {
    prevGridRef.current = null;
  }, [mode, state === null]);

  useEffect(() => {
    if (!state) return;
    const prev = prevGridRef.current;
    prevGridRef.current = state.grid;
    if (!prev) return;
    const prevValues = new Map(prev.filter((v): v is Tile => v !== null).map((tl) => [tl.id, tl.value]));
    const merged = new Set<number>();
    const spawned = new Set<number>();
    for (const tile of state.grid) {
      if (!tile) continue;
      if (!prevValues.has(tile.id)) spawned.add(tile.id);
      else if (prevValues.get(tile.id) !== tile.value) merged.add(tile.id);
    }
    if (merged.size || spawned.size) {
      setPoppedIds(merged);
      setSpawnedIds(spawned);
      const timer = setTimeout(() => {
        setPoppedIds(new Set());
        setSpawnedIds(new Set());
      }, POP_MS);
      return () => clearTimeout(timer);
    }
  }, [state]);

  useEffect(() => {
    if (!playing) return;
    function onKey(e: KeyboardEvent) {
      const dir = KEY_TO_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      void move({ dir });
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, state]);

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(e: TouchEvent) {
    if (!touchStart.current || !playing) return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (Math.max(absX, absY) < SWIPE_THRESHOLD) return;
    if (absX > absY) void move({ dir: dx > 0 ? 'right' : 'left' });
    else void move({ dir: dy > 0 ? 'down' : 'up' });
  }

  if (!state) return null;

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🔢 2048</h1>
        <p className="hint arcade-head">
          {signedIn ? '✓ signed in' : 'signing in…'}
          {mode === 'daily' && streak.streak > 0 ? ` · 🔥 ${streak.streak} day streak` : ''}
        </p>

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('daily'); }}
          >
            Today's Board
          </button>
          <button
            className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('endless', { fresh: true }); }}
          >
            Endless
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
            <h3>All-Time Best (Endless)</h3>
            <LeaderboardPanel gameId="twenty48" mode="endless" dateKey={dateKeyUTC()} ascending={false} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="twenty48-score">Score: {state.score}</p>
            <p className="hint twenty48-hint">Use arrow keys (or WASD) — or swipe on mobile.</p>

            <div
              className="twenty48-board"
              style={{ '--t48-size': SIZE } as CSSProperties}
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
              {Array.from({ length: SIZE * SIZE }).map((_, i) => (
                <div key={`bg-${i}`} className="twenty48-bg-cell" />
              ))}
              {state.grid.map((tile, i) => {
                if (!tile) return null;
                const row = Math.floor(i / SIZE);
                const col = i % SIZE;
                const style = {
                  '--t48-tx': `calc(${col} * (var(--t48-cell) + var(--t48-gap)))`,
                  '--t48-ty': `calc(${row} * (var(--t48-cell) + var(--t48-gap)))`,
                } as CSSProperties;
                const cls = [
                  tileClass(tile.value),
                  poppedIds.has(tile.id) ? 'twenty48-pop' : '',
                  spawnedIds.has(tile.id) ? 'twenty48-spawn' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <div key={tile.id} className={cls} style={style}>
                    {tile.value}
                  </div>
                );
              })}
            </div>

            {!playing && (
              <div className="twenty48-result">
                <h2>Game over — final score {result?.score}</h2>
                <p className="hint">Highest tile: {result?.stats?.highestTile}</p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>{mode === 'daily' ? "Today's High Scores" : 'All-Time Best'}</h3>
                <LeaderboardPanel
                  gameId="twenty48"
                  mode={mode}
                  dateKey={dateKeyUTC()}
                  ascending={false}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">{dailyDoneToday ? "Come back tomorrow for a new board!" : ''}</p>
                  ) : (
                    <button className="btn btn-primary" onClick={() => void start('endless', { fresh: true })}>
                      Play again
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
