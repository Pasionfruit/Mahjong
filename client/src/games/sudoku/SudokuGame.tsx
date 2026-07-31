import { useEffect, useState } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { CELLS, SIZE, boxOf, colOf, rowOf, sudokuModule } from './engine';
import './styles.css';

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export default function SudokuGame() {
  const { mode, state, status, result, signedIn, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(sudokuModule, () => undefined);
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [selected, setSelected] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const playing = status === 'playing';

  useEffect(() => {
    if (!playing || !state?.firstMoveAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [playing, state?.firstMoveAt]);

  // Keyboard: 1-9 set, Backspace/Delete/0 clear, arrows move the selection.
  useEffect(() => {
    if (!playing || view !== 'play') return;
    function onKey(e: KeyboardEvent) {
      if (selected === null) return;
      if (e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        void move({ type: 'set', cell: selected, value: Number(e.key), at: Date.now() });
        return;
      }
      if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
        e.preventDefault();
        void move({ type: 'clear', cell: selected, at: Date.now() });
        return;
      }
      const deltas: Record<string, number> = { ArrowUp: -SIZE, ArrowDown: SIZE, ArrowLeft: -1, ArrowRight: 1 };
      const d = deltas[e.key];
      if (d !== undefined) {
        e.preventDefault();
        const next = selected + d;
        if (next >= 0 && next < CELLS) {
          if ((e.key === 'ArrowLeft' && colOf(selected) === 0) || (e.key === 'ArrowRight' && colOf(selected) === SIZE - 1)) return;
          setSelected(next);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, view, selected, move]);

  if (!state) return null;

  const elapsedMs =
    state.firstMoveAt === null ? 0 : (state.lastMoveAt && !playing ? state.lastMoveAt : now) - state.firstMoveAt;

  const remaining: number[] = Array.from({ length: 10 }, () => 9);
  for (const v of state.entries) if (v >= 1 && v <= 9) remaining[v] = remaining[v]! - 1;

  const selValue = selected !== null ? state.entries[selected]! : 0;

  function onPad(value: number) {
    if (!playing || selected === null) return;
    if (value === 0) void move({ type: 'clear', cell: selected, at: Date.now() });
    else void move({ type: 'set', cell: selected, value, at: Date.now() });
  }

  function cellClass(i: number): string {
    const cls = ['sudoku-cell'];
    const r = rowOf(i);
    const c = colOf(i);
    if (c % 3 === 2 && c !== SIZE - 1) cls.push('sudoku-bxr');
    if (r % 3 === 2 && r !== SIZE - 1) cls.push('sudoku-bxb');
    const entry = state!.entries[i]!;
    const given = state!.givens[i]! !== 0;
    if (given) cls.push('sudoku-given');
    else if (entry !== 0 && entry !== state!.solution[i]) cls.push('sudoku-wrong');
    else if (entry !== 0) cls.push('sudoku-good');
    if (selected !== null) {
      if (i === selected) cls.push('sudoku-sel');
      else if (r === rowOf(selected) || c === colOf(selected) || boxOf(i) === boxOf(selected)) cls.push('sudoku-peer');
      if (entry !== 0 && selValue !== 0 && entry === selValue && i !== selected) cls.push('sudoku-same');
    }
    return cls.join(' ');
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🔢 Sudoku</h1>
        <p className="hint arcade-head">
          {signedIn ? '✓ signed in' : 'signing in…'}
          {mode === 'daily' && streak.streak > 0 ? ` · 🔥 ${streak.streak} day streak` : ''}
        </p>

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('daily'); }}
          >
            Today's Puzzle
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
            <h3>All-Time Fastest (Endless)</h3>
            <LeaderboardPanel
              gameId="sudoku"
              mode="endless"
              dateKey={dateKeyUTC()}
              ascending
              formatScore={formatTime}
            />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="sudoku-status">
              <span>⏱ {formatTime(elapsedMs)}</span>
              <span className={state.mistakes > 0 ? 'sudoku-mistakes' : ''}>✗ {state.mistakes} mistakes</span>
            </div>

            <div className="sudoku-board">
              {state.entries.map((entry, i) => (
                <button
                  key={i}
                  className={cellClass(i)}
                  onClick={() => setSelected(i)}
                  disabled={!playing}
                >
                  {entry !== 0 ? entry : ''}
                </button>
              ))}
            </div>

            {playing && (
              <div className="sudoku-pad">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                  <button
                    key={d}
                    className={`sudoku-pad-key${remaining[d]! <= 0 ? ' sudoku-pad-done' : ''}`}
                    onClick={() => onPad(d)}
                  >
                    <span className="sudoku-pad-digit">{d}</span>
                    <span className="sudoku-pad-count">{Math.max(0, remaining[d]!)}</span>
                  </button>
                ))}
                <button className="sudoku-pad-key sudoku-pad-erase" onClick={() => onPad(0)}>
                  ⌫
                </button>
              </div>
            )}

            {!playing && (
              <div className="sudoku-result">
                <h2>Solved in {formatTime(result?.score ?? elapsedMs)}! 🎉</h2>
                <p className="hint">Mistakes: {result?.stats?.mistakes ?? state.mistakes}</p>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>{mode === 'daily' ? "Today's Fastest" : 'All-Time Fastest'}</h3>
                <LeaderboardPanel
                  gameId="sudoku"
                  mode={mode}
                  dateKey={dateKeyUTC()}
                  ascending
                  formatScore={formatTime}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">{dailyDoneToday ? 'Come back tomorrow for a new puzzle!' : ''}</p>
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
