import { useEffect, useState } from 'react';
import { dateKeyUTC } from '../../arcade/dailySeed';
import AuthWidget from '../../arcade/ui/AuthWidget';
import LeaderboardPanel from '../../arcade/ui/LeaderboardPanel';
import { useSoloGame } from '../../arcade/useSoloGame';
import { useStore } from '../../store';
import { CAPACITY, PALETTE, magicSortModule } from './engine';
import './styles.css';

export default function MagicSortGame() {
  const { seed, state, status, result, signedIn, sync, move, start, forceSync } = useSoloGame(
    magicSortModule,
    () => undefined,
  );
  const [view, setView] = useState<'play' | 'leaderboard'>('play');
  const [selected, setSelected] = useState<number | null>(null);

  // Endless-only game: supersede the hook's default daily auto-start.
  // The token guard inside start() makes the later call win.
  useEffect(() => {
    void start('endless', { fresh: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new puzzle invalidates any lifted tube.
  useEffect(() => {
    setSelected(null);
  }, [seed]);

  const playing = status === 'playing';

  function onTubeTap(i: number) {
    if (!state || !playing) return;
    const tube = state.tubes[i];
    if (!tube) return;
    if (selected === null) {
      if (tube.length > 0) setSelected(i);
      return;
    }
    if (selected === i) {
      setSelected(null);
      return;
    }
    if (magicSortModule.applyMove(state, { from: selected, to: i })) {
      void move({ from: selected, to: i });
      setSelected(null);
    } else {
      // Illegal pour — treat the tap as picking a new source instead.
      setSelected(tube.length > 0 ? i : null);
    }
  }

  if (!state) return null;

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide">
        <h1>🧪 Magic Sort</h1>
        <p className="hint arcade-head">{signedIn ? '✓ signed in' : 'signing in…'}</p>

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
            <LeaderboardPanel gameId="magicsort" mode="endless" dateKey={dateKeyUTC()} ascending={true} />
            <div className="arcade-actions">
              <button className="btn" onClick={() => setView('play')}>
                Back to game
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="magicsort-hud">
              <span>Colors: {state.colors}</span>
              <span>Moves: {state.moves}</span>
            </div>
            <p className="hint magicsort-hint">
              Tap a flask to lift it, then tap another to pour. Sort every color into its own flask.
            </p>

            <div className="magicsort-board">
              {state.tubes.map((tube, i) => (
                <button
                  key={i}
                  className={`magicsort-tube${selected === i ? ' magicsort-tube-selected' : ''}`}
                  onClick={() => onTubeTap(i)}
                  aria-label={`Flask ${i + 1}`}
                >
                  <span className="magicsort-tube-glass">
                    {tube.map((c, j) => (
                      <span
                        key={j}
                        className="magicsort-seg"
                        style={{ background: PALETTE[c] ?? '#888', height: `${100 / CAPACITY}%` }}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>

            <div className="arcade-actions">
              <button className="btn" onClick={() => void start('endless', { fresh: true })}>
                New puzzle
              </button>
            </div>

            {!playing && (
              <div className="magicsort-result">
                <h2>Solved in {result?.score} moves!</h2>
                <p className="hint">Colors sorted: {result?.stats?.colors}</p>
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
                  gameId="magicsort"
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
