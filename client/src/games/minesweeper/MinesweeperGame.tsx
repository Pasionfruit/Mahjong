import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import AuthWidget from '../../arcade/ui/AuthWidget';
import type { SoloMode } from '../../arcade/useSoloGame';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { COLS, isChordReady, minesweeperModule, type MinesweeperSettings } from './engine';

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export default function MinesweeperGame() {
  // Endless-only: the daily stays classic so everyone races the same board.
  const [noGuess, setNoGuess] = useState(false);
  // Read through a ref so a toggle-then-restart in the same tick can't race
  // React's batched state update (same pattern as Crossword's difficulty).
  const noGuessRef = useRef(noGuess);
  const resolveSettings = useCallback(
    (m: SoloMode): MinesweeperSettings => ({ noGuess: m === 'endless' && noGuessRef.current }),
    [],
  );
  const { mode, state, status, result, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(minesweeperModule, resolveSettings);
  const [flagMode, setFlagMode] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<'play' | 'leaderboard'>('play');

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
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>💣 Minesweeper</h1>
        {mode === 'daily' && streak.streak > 0 && (
          <p className="hint arcade-head">🔥 {streak.streak} day streak</p>
        )}

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
        </div>

        {view === 'play' && mode === 'endless' && (
          <label className="minesweeper-noguess">
            <input
              type="checkbox"
              checked={noGuess}
              onChange={(e) => {
                noGuessRef.current = e.target.checked; // synchronous — the restart below reads it
                setNoGuess(e.target.checked);
                void start('endless', { fresh: true });
              }}
            />
            <span>🎲 No 50/50s — every board solvable by logic alone</span>
          </label>
        )}

        {(
          <>
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
            {playing && <p className="hint minesweeper-hint">Tip: click a satisfied number to clear around it.</p>}

            <div
              className="minesweeper-grid"
              style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}
            >
              {state.cells.map((cell, i) => {
                const showMine = cell.revealed && cell.mine;
                const exploded = state.exploded === i;
                const chordReady = playing && isChordReady(state, i);
                let label = '';
                if (cell.flagged && !cell.revealed) label = '🚩';
                else if (showMine) label = exploded ? '💥' : '💣';
                else if (cell.revealed && cell.adjacent > 0) label = String(cell.adjacent);
                return (
                  <button
                    key={i}
                    className={`minesweeper-cell${cell.revealed ? ' revealed' : ''}${cell.revealed && cell.adjacent > 0 ? ` n${cell.adjacent}` : ''}${exploded ? ' exploded' : ''}${chordReady ? ' chord-ready' : ''}`}
                    title={chordReady ? 'Click to reveal the rest' : undefined}
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

                {/* Endless second chance: un-reveals the mine that got you
                    (auto-flagged as a marker) and resumes the same board.
                    Daily is one attempt by design — everyone gets the same
                    single shot at the shared board. */}
                {result?.status === 'lost' && mode === 'endless' && (
                  <div className="arcade-actions">
                    <button
                      className="btn btn-primary"
                      onClick={() => void move({ type: 'continue', index: -1, at: Date.now() })}
                    >
                      ♻️ Continue from here
                    </button>
                  </div>
                )}
                {state.continues > 0 && (
                  <p className="hint">
                    Practice run — {state.continues} continue{state.continues === 1 ? '' : 's'} used, so this
                    one won't be ranked.
                  </p>
                )}
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
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
