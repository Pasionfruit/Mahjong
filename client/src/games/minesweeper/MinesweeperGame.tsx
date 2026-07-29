import { useEffect, useState, type MouseEvent } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { COLS, ROWS, minesweeperModule } from './engine';

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export default function MinesweeperGame() {
  const { mode, state, status, result, signedIn, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(minesweeperModule, () => undefined);
  const [flagMode, setFlagMode] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const playing = status === 'playing';

  useEffect(() => {
    if (!playing || !state?.firstMoveAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [playing, state?.firstMoveAt]);

  if (!state) return null;

  const elapsedMs = state.firstMoveAt === null ? 0 : (state.lastMoveAt && !playing ? state.lastMoveAt : now) - state.firstMoveAt;
  const flaggedCount = state.cells.filter((c) => c.flagged).length;

  function onCellClick(index: number) {
    if (!playing) return;
    void move({ type: flagMode ? 'flag' : 'reveal', index, at: Date.now() });
  }

  function onCellContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    if (!playing) return;
    void move({ type: 'flag', index, at: Date.now() });
  }

  return (
    <div className="arcade-screen">
      <div className="arcade-card arcade-card-wide">
        <h1>💣 Minesweeper</h1>
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

        <div className="minesweeper-status">
          <span>💣 {state.mineCount - flaggedCount}</span>
          <span>⏱ {formatTime(elapsedMs)}</span>
          {playing && (
            <button
              className={`btn minesweeper-flag-toggle${flagMode ? ' active' : ''}`}
              onClick={() => setFlagMode((f) => !f)}
            >
              {flagMode ? '🚩 Flagging' : '👆 Revealing'}
            </button>
          )}
        </div>

        <div
          className="minesweeper-grid"
          style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
        >
          {state.cells.map((cell, i) => {
            const showMine = cell.revealed && cell.mine;
            const exploded = state.exploded === i;
            let label = '';
            if (cell.flagged && !cell.revealed) label = '🚩';
            else if (showMine) label = exploded ? '💥' : '💣';
            else if (cell.revealed && cell.adjacent > 0) label = String(cell.adjacent);
            return (
              <button
                key={i}
                className={`minesweeper-cell${cell.revealed ? ' revealed' : ''}${cell.revealed && cell.adjacent > 0 ? ` n${cell.adjacent}` : ''}${exploded ? ' exploded' : ''}`}
                onClick={() => onCellClick(i)}
                onContextMenu={(e) => onCellContextMenu(e, i)}
                disabled={!playing && !cell.revealed}
              >
                {label}
              </button>
            );
          })}
        </div>

        {!playing && (
          <div className="minesweeper-result">
            <h2>{result?.status === 'won' ? `Cleared in ${formatTime(elapsedMs)}! 🎉` : 'Boom. 💥'}</h2>
            <p>
              Sync:{' '}
              <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
              <button className="btn" onClick={() => void forceSync()}>
                Force sync
              </button>
            </p>
            <h3>{mode === 'daily' ? "Today's Fastest" : 'All-Time Fastest'}</h3>
            <LeaderboardPanel
              gameId="minesweeper"
              mode={mode}
              dateKey={dateKeyUTC()}
              ascending
              formatScore={(s) => (s >= 999_999_999 ? 'DNF' : formatTime(s))}
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
