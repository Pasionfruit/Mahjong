import { useEffect, useRef, useState } from 'react';
import { play } from '../../audio';
import ResultPanel from '../../arcade/ui/ResultPanel';
import { ensureSignedIn } from '../../arcade/auth';
import { dailySeed, dateKeyUTC } from '../../arcade/dailySeed';
import { getUnsyncedResults } from '../../arcade/storage/db';
import { flushOutbox, recordResult, startAutoSync } from '../../arcade/storage/outbox';
import AuthWidget from '../../arcade/ui/AuthWidget';
import Countdown from '../../components/Countdown';
import { useStore } from '../../store';
import {
  PENALTY_MS,
  createRun,
  finalMs,
  pickEntry,
  typeChar,
  typedChars,
  wpm,
  type RunState,
} from './engine';
import './styles.css';

const GAME_ID = 'wordtype';

type Mode = 'daily' | 'endless';
type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';

const SECTION_TITLES = { word: 'The word', definition: 'Definition', story: 'Story' } as const;

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

function formatTime(ms: number): string {
  return (ms / 1000).toFixed(1) + 's';
}

export default function WordTypeGame() {
  const [mode, setMode] = useState<Mode>('daily');
  const [seed, setSeed] = useState(() => dailySeed(GAME_ID, dateKeyUTC()));
  const entry = pickEntry(seed);

  const [run, setRun] = useState<RunState>(() => createRun(entry));
  const [started, setStarted] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);
  const [finished, setFinished] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  const [sync, setSync] = useState<SyncBadge>('idle');

  const startedRef = useRef(false);
  const startTimeRef = useRef(0);
  const runRef = useRef(run);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef(0);

  useEffect(() => {
    void ensureSignedIn();
    return startAutoSync();
  }, []);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  // The visible clock, ~10fps while a run is live.
  useEffect(() => {
    if (!started || finished) return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startTimeRef.current), 100);
    return () => window.clearInterval(id);
  }, [started, finished]);

  function beginPlay() {
    startedRef.current = true;
    startTimeRef.current = Date.now();
    setStarted(true);
    inputRef.current?.focus();
  }

  /** One keystroke from the hidden input (works for phones and desktops). */
  function onKey(ch: string) {
    if (!startedRef.current || runRef.current.done) return;
    const { state, correct } = typeChar(runRef.current, ch);
    runRef.current = state;
    setRun(state);
    if (correct) {
      play('letter');
    } else {
      play('error');
      setWrongFlash(true);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setWrongFlash(false), 160);
    }
    if (state.done) void finish(state);
  }

  async function finish(state: RunState) {
    const elapsed = Date.now() - startTimeRef.current;
    const total = finalMs(elapsed, state.mistakes);
    setFinalScore(total);
    setFinished(true);
    play('win');
    setSync('saving');
    const row = await recordResult({
      gameId: GAME_ID,
      mode,
      dateKey: mode === 'daily' ? dateKeyUTC() : null,
      score: total,
      stats: {
        rawMs: elapsed,
        mistakes: state.mistakes,
        wpm: wpm(typedChars(state), elapsed),
      },
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

  function startMode(next: Mode) {
    const s = next === 'daily' ? dailySeed(GAME_ID, dateKeyUTC()) : randomSeed();
    setMode(next);
    setSeed(s);
    const fresh = createRun(pickEntry(s));
    runRef.current = fresh;
    setRun(fresh);
    startedRef.current = false;
    setStarted(false);
    setFinished(false);
    setElapsedMs(0);
    setFinalScore(0);
    setSync('idle');
  }

  const liveMs = finished ? finalScore : elapsedMs + run.mistakes * PENALTY_MS;

  return (
    <div className="arcade-screen">
      <AuthWidget />
      <div className="arcade-card arcade-card-wide wordtype-card">
        <h1>⌨️ Word Type</h1>
        <p className="hint arcade-head">
          Type today's word, its definition, and a tiny story — every typo costs {PENALTY_MS / 1000}s.
        </p>

        <div className="arcade-tabs">
          <button
            className={`arcade-tab${mode === 'daily' ? ' active' : ''}`}
            onClick={() => startMode('daily')}
          >
            Today's Word
          </button>
          <button
            className={`arcade-tab${mode === 'endless' ? ' active' : ''}`}
            onClick={() => startMode('endless')}
          >
            Practice
          </button>
        </div>

        <p className="sandsort-timer">
          ⏱ {formatTime(liveMs)}
          {run.mistakes > 0 && (
            <span className="wordtype-mistakes">
              {' '}
              · {run.mistakes} typo{run.mistakes === 1 ? '' : 's'} (+{formatTime(run.mistakes * PENALTY_MS)})
            </span>
          )}
        </p>

        {/* Tapping anywhere in the passage focuses the hidden input, which
            summons the keyboard on phones. */}
        <div
          className={`wordtype-board${wrongFlash ? ' wrong' : ''}`}
          onClick={() => inputRef.current?.focus()}
        >
          {run.sections.map((s, si) => (
            <section key={s.label} className="wordtype-section">
              <h3 className="wordtype-section-title">{SECTION_TITLES[s.label]}</h3>
              <p className={`wordtype-text${si === 0 ? ' wordtype-the-word' : ''}`}>
                {[...s.text].map((c, ci) => {
                  const typed = si < run.section || (si === run.section && ci < run.pos) || run.done;
                  const current = !run.done && si === run.section && ci === run.pos;
                  return (
                    <span
                      key={ci}
                      className={`wt-char${typed ? ' typed' : ''}${current ? ' current' : ''}`}
                    >
                      {c}
                    </span>
                  );
                })}
              </p>
            </section>
          ))}
        </div>

        <input
          ref={inputRef}
          className="wordtype-input"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Type here"
          value=""
          onChange={() => {}}
          // Physical keyboards land here; preventDefault also stops the
          // insertion, so onBeforeInput below can't double-count the key.
          onKeyDown={(e) => {
            if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              onKey(e.key);
            }
          }}
          // Virtual keyboards report keydown as "Unidentified" and deliver
          // the real character only through beforeinput.
          onBeforeInput={(e) => {
            const ev = e.nativeEvent as InputEvent;
            e.preventDefault();
            if (ev.data) for (const ch of ev.data) onKey(ch);
          }}
        />

        {!started && <Countdown onDone={beginPlay} />}

        {finished && (
          <ResultPanel className="wordtype-result">
            <h2>Typed in {formatTime(finalScore)}! ⌨️</h2>
            <p className="hint">
              Raw {formatTime(finalScore - run.mistakes * PENALTY_MS)} · {run.mistakes} typo
              {run.mistakes === 1 ? '' : 's'} · {wpm(typedChars(run), finalScore - run.mistakes * PENALTY_MS)} wpm
            </p>
            <p>
              Sync:{' '}
              <span className={`arcade-badge arcade-badge-${sync}`}>{sync === 'saving' ? 'saving…' : sync}</span>{' '}
              <button className="btn" onClick={() => void forceSync()}>
                Force sync
              </button>
            </p>
            <div className="arcade-actions">
              {mode === 'daily' ? (
                <>
                  <p className="hint">Beat your time — retries keep your best score.</p>
                  <button className="btn btn-primary" onClick={() => startMode('daily')}>
                    Retry today's
                  </button>
                  <button className="btn" onClick={() => startMode('endless')}>
                    Practice more
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={() => startMode('endless')}>
                  New word
                </button>
              )}
            </div>
          </ResultPanel>
        )}

        <button className="btn arcade-leave" onClick={() => useStore.getState().setLocalGame(null)}>
          Back
        </button>
      </div>
    </div>
  );
}
