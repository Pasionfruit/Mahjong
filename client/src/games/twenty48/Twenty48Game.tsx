import { useEffect } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { SIZE, twenty48Module, type Direction } from './engine';

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

function tileClass(value: number | null): string {
  if (value === null) return 'twenty48-cell';
  return `twenty48-cell twenty48-t${value <= 2048 ? value : 'max'}`;
}

export default function Twenty48Game() {
  const { mode, state, status, result, signedIn, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(twenty48Module, () => undefined);

  const playing = status === 'playing';

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

  if (!state) return null;

  return (
    <div className="arcade-screen">
      <div className="arcade-card arcade-card-wide">
        <h1>🔢 2048</h1>
        <p className="hint arcade-head">
          {signedIn ? '✓ signed in' : 'signing in…'}
          {mode === 'daily' && streak.streak > 0 ? ` · 🔥 ${streak.streak} day streak` : ''}
        </p>

        <div className="arcade-tabs">
          <button className={`arcade-tab${mode === 'daily' ? ' active' : ''}`} onClick={() => void start('daily')}>
            Today's Board
          </button>
          <button
            className={`arcade-tab${mode === 'endless' ? ' active' : ''}`}
            onClick={() => void start('endless', { fresh: true })}
          >
            Endless
          </button>
        </div>

        <p className="twenty48-score">Score: {state.score}</p>

        <div className="twenty48-grid" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
          {state.grid.map((value, i) => (
            <div key={i} className={tileClass(value)}>
              {value ?? ''}
            </div>
          ))}
        </div>

        {playing && (
          <div className="twenty48-dpad">
            <button className="btn twenty48-dpad-up" onClick={() => void move({ dir: 'up' })}>
              ▲
            </button>
            <button className="btn twenty48-dpad-left" onClick={() => void move({ dir: 'left' })}>
              ◀
            </button>
            <button className="btn twenty48-dpad-right" onClick={() => void move({ dir: 'right' })}>
              ▶
            </button>
            <button className="btn twenty48-dpad-down" onClick={() => void move({ dir: 'down' })}>
              ▼
            </button>
          </div>
        )}

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

        <button className="btn arcade-leave" onClick={() => useStore.getState().setLocalGame(null)}>
          Back
        </button>
      </div>
    </div>
  );
}
