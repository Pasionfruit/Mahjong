import { useCallback, useEffect, useRef, useState } from 'react';
import { ensureSignedIn } from './auth';
import { dailySeed, dateKeyUTC } from './dailySeed';
import { EMPTY_STREAK, nextStreakState, type StreakState } from './stats';
import { getAllResults, getSave, getUnsyncedResults, putSave, deleteSave, saveKey } from './storage/db';
import { flushOutbox, recordResult, startAutoSync } from './storage/outbox';
import type { SoloGameModule, SoloResult, SoloStatus } from './types';

export type SyncBadge = 'idle' | 'saving' | 'synced' | 'queued';
export type SoloMode = 'daily' | 'endless';

function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

async function computeStreak(gameId: string): Promise<{ streak: StreakState; dailyDoneToday: boolean }> {
  const all = await getAllResults();
  const dateKeys = all
    .filter((r) => r.gameId === gameId && r.mode === 'daily' && r.dateKey)
    .map((r) => r.dateKey as string)
    .sort();
  let streak = EMPTY_STREAK;
  for (const key of dateKeys) streak = nextStreakState(streak, key);
  return { streak, dailyDoneToday: dateKeys.includes(dateKeyUTC()) };
}

/**
 * Shared lifecycle for every Brain Arcade solo game: sign-in, resuming
 * today's in-progress daily from IndexedDB, applying moves, saving +
 * syncing completed results, and deriving the daily streak from local
 * history. `resolveSettings` is async because it's the one place a game
 * needs to reach outside pure generate()/applyMove() — e.g. Word Guess
 * fetching the (secret, server-gated) daily answer before it can generate
 * a state at all. Games with no real settings just return a constant.
 *
 * Endless mode always starts fresh (no cross-session resume) — daily is
 * the one worth resuming, since there's only one per day and losing
 * progress on a reload would be a real loss for the daily-ritual persona.
 */
export function useSoloGame<TState, TMove, TSettings>(
  module: SoloGameModule<TState, TMove, TSettings>,
  resolveSettings: (mode: SoloMode, seed: number) => TSettings | Promise<TSettings>,
) {
  const [mode, setMode] = useState<SoloMode>('daily');
  const [seed, setSeed] = useState(0);
  const [settings, setSettings] = useState<TSettings | null>(null);
  const [state, setState] = useState<TState | null>(null);
  const [moveLog, setMoveLog] = useState<TMove[]>([]);
  const [sync, setSync] = useState<SyncBadge>('idle');
  const [signedIn, setSignedIn] = useState(false);
  const [streak, setStreak] = useState<StreakState>(EMPTY_STREAK);
  const [dailyDoneToday, setDailyDoneToday] = useState(false);
  const loadingRef = useRef(0);

  const refreshStreak = useCallback(async () => {
    const { streak: s, dailyDoneToday: d } = await computeStreak(module.id);
    setStreak(s);
    setDailyDoneToday(d);
  }, [module.id]);

  const start = useCallback(
    async (nextMode: SoloMode, opts: { fresh?: boolean } = {}) => {
      const token = ++loadingRef.current;
      const nextSeed = nextMode === 'daily' ? dailySeed(module.id, dateKeyUTC()) : randomSeed();
      const key = saveKey(module.id, nextMode, nextMode === 'daily' ? dateKeyUTC() : null);
      if (opts.fresh) await deleteSave(key);

      const saved = nextMode === 'daily' && !opts.fresh ? await getSave(key) : undefined;
      if (token !== loadingRef.current) return; // a newer start() superseded this one

      if (saved) {
        const s = saved.settings as TSettings;
        setMode(nextMode);
        setSeed(saved.seed);
        setSettings(s);
        setState(module.replay(saved.seed, s, saved.moveLog as TMove[]));
        setMoveLog(saved.moveLog as TMove[]);
      } else {
        const s = await resolveSettings(nextMode, nextSeed);
        if (token !== loadingRef.current) return;
        setMode(nextMode);
        setSeed(nextSeed);
        setSettings(s);
        setState(module.generate(nextSeed, s));
        setMoveLog([]);
      }
      setSync('idle');
    },
    [module, resolveSettings],
  );

  useEffect(() => {
    void ensureSignedIn().then((u) => setSignedIn(!!u));
    void refreshStreak();
    void start('daily');
    return startAutoSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function move(m: TMove) {
    if (!state || settings === null) return;
    const next = module.applyMove(state, m);
    if (!next) return;
    setState(next);
    const newLog = [...moveLog, m];
    setMoveLog(newLog);

    const res: SoloResult | null = module.result(next);
    const key = saveKey(module.id, mode, mode === 'daily' ? dateKeyUTC() : null);
    if (res) {
      await deleteSave(key);
      setSync('saving');
      const row = await recordResult({
        gameId: module.id,
        mode,
        dateKey: mode === 'daily' ? dateKeyUTC() : null,
        score: res.score,
        stats: res.stats ?? {},
        moveLog: newLog,
        completedAt: new Date().toISOString(),
      });
      await flushOutbox();
      const stillQueued = (await getUnsyncedResults()).some((r) => r.id === row.id);
      setSync(stillQueued ? 'queued' : 'synced');
      void refreshStreak();
    } else {
      await putSave(key, { seed, settings, moveLog: newLog, updatedAt: new Date().toISOString() });
    }
  }

  async function forceSync() {
    setSync('saving');
    await flushOutbox();
    const unsynced = await getUnsyncedResults();
    setSync(unsynced.length > 0 ? 'queued' : 'synced');
  }

  const status: SoloStatus = state ? module.status(state) : 'playing';
  const result: SoloResult | null = state ? module.result(state) : null;

  return {
    mode,
    seed,
    state,
    status,
    result,
    signedIn,
    sync,
    streak,
    dailyDoneToday,
    move,
    start,
    forceSync,
  };
}
