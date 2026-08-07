import { useEffect, useMemo, useState } from 'react';
import { mulberry32 } from '@shared/rng';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import { useStore } from '../../store';
import { fetchDailyAnswer } from './dailyWord';
import { MAX_GUESSES, WORD_LENGTH, type LetterState, wordGuessModule } from './engine';
import { isValidGuess, pickAnswer } from './words';
import { useSoloGame, type SoloMode } from '../../arcade/useSoloGame';

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/** Best feedback seen so far per letter — upgrades only (absent < present < correct). */
function keyStates(guesses: string[], feedback: LetterState[][]): Record<string, LetterState> {
  const rank: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
  const states: Record<string, LetterState> = {};
  guesses.forEach((guess, i) => {
    guess.split('').forEach((letter, j) => {
      const s = feedback[i]![j]!;
      if (!states[letter] || rank[s] > rank[states[letter]!]) states[letter] = s;
    });
  });
  return states;
}

export default function WordGuessGame() {
  const { mode, state, status, result, sync, streak, dailyDoneToday, move, start, forceSync } =
    useSoloGame(wordGuessModule, async (m: SoloMode, seed: number) =>
      m === 'daily' ? { answer: await fetchDailyAnswer(dateKeyUTC()) } : { answer: pickAnswer(mulberry32(seed)) },
    );
  const [current, setCurrent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'play' | 'leaderboard'>('play');

  const playing = status === 'playing';

  useEffect(() => {
    if (!playing) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Enter') return void submit();
      if (e.key === 'Backspace') return setCurrent((c) => c.slice(0, -1));
      if (/^[a-zA-Z]$/.test(e.key)) setCurrent((c) => (c.length < WORD_LENGTH ? c + e.key.toLowerCase() : c));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, current]);

  function typeLetter(letter: string) {
    setError(null);
    setCurrent((c) => (c.length < WORD_LENGTH ? c + letter : c));
  }

  function backspace() {
    setError(null);
    setCurrent((c) => c.slice(0, -1));
  }

  function submit() {
    if (current.length !== WORD_LENGTH) return setError('Not enough letters');
    if (!isValidGuess(current)) return setError('Not in word list');
    setError(null);
    void move({ guess: current });
    setCurrent('');
  }

  const keyState = useMemo(
    () => (state ? keyStates(state.guesses, state.feedback) : {}),
    [state],
  );

  if (!state) return null;

  const rows = Array.from({ length: MAX_GUESSES }, (_, i) => {
    if (i < state.guesses.length) return { letters: state.guesses[i]!.split(''), feedback: state.feedback[i]! };
    if (i === state.guesses.length && playing) return { letters: current.padEnd(WORD_LENGTH).split(''), feedback: null };
    return { letters: new Array(WORD_LENGTH).fill(''), feedback: null };
  });

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card">
        <h1>🔤 Word Guess</h1>
        {mode === 'daily' && streak.streak > 0 && (
          <p className="hint arcade-head">🔥 {streak.streak} day streak</p>
        )}

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${view === 'play' && mode === 'daily' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('daily'); }}
          >
            Today's Word
          </button>
          <button
            className={`arcade-tab${view === 'play' && mode === 'endless' ? ' active' : ''}`}
            onClick={() => { setView('play'); void start('endless', { fresh: true }); }}
          >
            Endless
          </button>
        </div>

        {(
          <>
            <div className="wordguess-grid">
              {rows.map((row, i) => (
                <div className="wordguess-row" key={i}>
                  {row.letters.map((letter, j) => (
                    <div
                      key={j}
                      className={`wordguess-cell${row.feedback ? ` wordguess-cell-${row.feedback[j]}` : letter.trim() ? ' wordguess-cell-filled' : ''}`}
                    >
                      {letter.trim().toUpperCase()}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {playing ? (
              <>
                {error && <p className="toast" role="alert">{error}</p>}
                <div className="wordguess-keyboard">
                  {KEY_ROWS.map((row, i) => (
                    <div className="wordguess-key-row" key={i}>
                      {i === 2 && (
                        <button className="wordguess-key wordguess-key-wide" onClick={submit}>
                          Enter
                        </button>
                      )}
                      {row.split('').map((letter) => (
                        <button
                          key={letter}
                          className={`wordguess-key${keyState[letter] ? ` wordguess-key-${keyState[letter]}` : ''}`}
                          onClick={() => typeLetter(letter)}
                        >
                          {letter}
                        </button>
                      ))}
                      {i === 2 && (
                        <button className="wordguess-key wordguess-key-wide" onClick={backspace}>
                          ⌫
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="wordguess-result">
                <h2>{result?.status === 'won' ? 'Solved it! 🎉' : `The word was ${state.answer.toUpperCase()}`}</h2>
                <p>
                  Sync:{' '}
                  <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
                  <button className="btn" onClick={() => void forceSync()}>
                    Force sync
                  </button>
                </p>
                <div className="arcade-actions">
                  {mode === 'daily' ? (
                    <p className="hint">{dailyDoneToday ? 'Come back tomorrow for a new word!' : ''}</p>
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
