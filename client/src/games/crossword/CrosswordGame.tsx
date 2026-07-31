import { useEffect, useMemo, useState } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { PUZZLES } from './data';
import { SIZE, computeEntries, crosswordModule, isBlack, letterAt, puzzleAt, type CrosswordEntry } from './engine';
import './styles.css';

type Dir = 'across' | 'down';

const KEY_ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export default function CrosswordGame() {
  const { mode, state, status, result, signedIn, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(crosswordModule, () => undefined);
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [sel, setSel] = useState(0);
  const [dir, setDir] = useState<Dir>('across');
  const [now, setNow] = useState(() => Date.now());

  const playing = status === 'playing';
  const puzzleIndex = state?.puzzle ?? -1;

  const derived = useMemo(() => {
    if (puzzleIndex < 0) return null;
    const grid = puzzleAt(puzzleIndex).grid;
    const { across, down } = computeEntries(grid);
    const cellAcross = new Map<number, CrosswordEntry>();
    const cellDown = new Map<number, CrosswordEntry>();
    const numAt = new Map<number, number>();
    for (const e of across) {
      numAt.set(e.cells[0]!, e.num);
      for (const c of e.cells) cellAcross.set(c, e);
    }
    for (const e of down) {
      if (!numAt.has(e.cells[0]!)) numAt.set(e.cells[0]!, e.num);
      for (const c of e.cells) cellDown.set(c, e);
    }
    return { grid, across, down, cellAcross, cellDown, numAt };
  }, [puzzleIndex]);

  // New puzzle (mode switch / fresh round) — reset the cursor to the first
  // white cell, reading across.
  useEffect(() => {
    if (!derived) return;
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (!isBlack(derived.grid, i)) {
        setSel(i);
        break;
      }
    }
    setDir('across');
  }, [derived, mode]);

  useEffect(() => {
    if (!playing || !state?.firstMoveAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [playing, state?.firstMoveAt]);

  const activeEntry: CrosswordEntry | undefined = derived
    ? (dir === 'across' ? derived.cellAcross.get(sel) : derived.cellDown.get(sel)) ??
      derived.cellAcross.get(sel) ??
      derived.cellDown.get(sel)
    : undefined;

  function entryDone(e: CrosswordEntry): boolean {
    if (!state) return false;
    return e.cells.every((c, j) => state.letters[c] === e.answer[j]);
  }

  function typeLetter(letter: string) {
    if (!playing || !state || !activeEntry) return;
    void move({ cell: sel, letter, at: Date.now() });
    const idx = activeEntry.cells.indexOf(sel);
    if (idx >= 0 && idx < activeEntry.cells.length - 1) setSel(activeEntry.cells[idx + 1]!);
  }

  function backspace() {
    if (!playing || !state || !activeEntry) return;
    if (state.letters[sel] !== '') {
      void move({ cell: sel, letter: '', at: Date.now() });
      return;
    }
    const idx = activeEntry.cells.indexOf(sel);
    if (idx > 0) {
      const prev = activeEntry.cells[idx - 1]!;
      setSel(prev);
      void move({ cell: prev, letter: '', at: Date.now() });
    }
  }

  function stepSelection(delta: number, wantDir: Dir) {
    if (!derived) return;
    if (dir !== wantDir) {
      setDir(wantDir);
      return;
    }
    let next = sel + delta;
    while (next >= 0 && next < SIZE * SIZE) {
      if (wantDir === 'across' && Math.floor(next / SIZE) !== Math.floor(sel / SIZE)) break;
      if (!isBlack(derived.grid, next)) {
        setSel(next);
        return;
      }
      next += delta;
    }
  }

  useEffect(() => {
    if (!playing || view !== 'play') return;
    function onKey(e: KeyboardEvent) {
      if (/^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        typeLetter(e.key.toUpperCase());
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        backspace();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepSelection(-1, 'across');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepSelection(1, 'across');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepSelection(-SIZE, 'down');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepSelection(SIZE, 'down');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, view, sel, dir, state, derived]);

  if (!state || !derived) return null;

  const puzzle = puzzleAt(state.puzzle);
  const elapsedMs =
    state.firstMoveAt === null ? 0 : (state.lastMoveAt && !playing ? state.lastMoveAt : now) - state.firstMoveAt;
  const activeClue =
    activeEntry &&
    (activeEntry.dir === 'across' ? puzzle.cluesAcross : puzzle.cluesDown).find((c) => c.num === activeEntry.num);

  function onCellClick(i: number) {
    if (isBlack(derived!.grid, i)) return;
    if (i === sel) setDir((d) => (d === 'across' ? 'down' : 'across'));
    else setSel(i);
  }

  function selectClue(entry: CrosswordEntry) {
    setSel(entry.cells[0]!);
    setDir(entry.dir);
  }

  function clueList(entries: CrosswordEntry[], clues: { num: number; clue: string }[], label: string) {
    return (
      <div className="crossword-clue-group">
        <h4>{label}</h4>
        <ul>
          {entries.map((e) => {
            const clue = clues.find((c) => c.num === e.num);
            const active = activeEntry === e;
            return (
              <li key={`${e.dir}-${e.num}`}>
                <button
                  className={`crossword-clue${active ? ' active' : ''}${entryDone(e) ? ' done' : ''}`}
                  onClick={() => selectClue(e)}
                >
                  <span className="crossword-clue-num">{e.num}</span>
                  <span>{clue?.clue ?? ''}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>📝 Crossword Mini</h1>
        <p className="hint arcade-head">
          {signedIn ? '✓ signed in' : 'signing in…'}
          {mode === 'daily' && streak.streak > 0 ? ` · 🔥 ${streak.streak} day streak` : ''}
        </p>

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('daily'); }}
          >
            Today's Mini
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
              gameId="crossword"
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
            <div className="crossword-status">
              <span>Mini #{state.puzzle + 1} of {PUZZLES.length}</span>
              <span>⏱ {formatTime(elapsedMs)}</span>
            </div>

            {playing && activeEntry && (
              <button
                className="crossword-cluebar"
                onClick={() => setDir((d) => (d === 'across' ? 'down' : 'across'))}
                title="Tap to switch direction"
              >
                <span className="crossword-cluebar-num">
                  {activeEntry.num}
                  {activeEntry.dir === 'across' ? 'A' : 'D'}
                </span>
                <span>{activeClue?.clue ?? ''}</span>
              </button>
            )}

            <div className="crossword-board">
              {Array.from({ length: SIZE * SIZE }).map((_, i) => {
                if (isBlack(derived.grid, i)) return <div key={i} className="crossword-black" />;
                const inWord = playing && activeEntry ? activeEntry.cells.includes(i) : false;
                const num = derived.numAt.get(i);
                return (
                  <button
                    key={i}
                    className={`crossword-cell${i === sel && playing ? ' crossword-sel' : ''}${inWord ? ' crossword-word' : ''}`}
                    onClick={() => onCellClick(i)}
                    disabled={!playing}
                  >
                    {num !== undefined && <span className="crossword-num">{num}</span>}
                    <span className="crossword-letter">
                      {playing ? state.letters[i] : letterAt(derived.grid, i)}
                    </span>
                  </button>
                );
              })}
            </div>

            {playing && (
              <div className="crossword-keyboard">
                {KEY_ROWS.map((row, ri) => (
                  <div key={ri} className="crossword-key-row">
                    {row.split('').map((k) => (
                      <button key={k} className="crossword-key" onClick={() => typeLetter(k)}>
                        {k}
                      </button>
                    ))}
                    {ri === 2 && (
                      <button className="crossword-key crossword-key-wide" onClick={() => backspace()}>
                        ⌫
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {playing && (
              <div className="crossword-clues">
                {clueList(derived.across, puzzle.cluesAcross, 'Across')}
                {clueList(derived.down, puzzle.cluesDown, 'Down')}
              </div>
            )}

            {!playing && (
              <div className="crossword-result">
                <h2>Solved in {formatTime(result?.score ?? elapsedMs)}! 🎉</h2>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <h3>{mode === 'daily' ? "Today's Fastest" : 'All-Time Fastest'}</h3>
                <LeaderboardPanel
                  gameId="crossword"
                  mode={mode}
                  dateKey={dateKeyUTC()}
                  ascending
                  formatScore={formatTime}
                  refreshKey={sync === 'synced' ? 1 : 0}
                />
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">{dailyDoneToday ? 'Come back tomorrow for a new mini!' : ''}</p>
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
