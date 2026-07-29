import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { SavedGame, StoredResult } from '../types';
import {
  deleteSave,
  getAllResults,
  getSave,
  getUnsyncedResults,
  putResult,
  putSave,
  resetDbConnectionForTests,
  saveKey,
} from './db';

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('brain-arcade');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // no open connections should exist between tests
  });
}

beforeEach(async () => {
  resetDbConnectionForTests();
  await deleteDatabase();
});

const save = (over: Partial<SavedGame> = {}): SavedGame => ({
  seed: 42,
  settings: {},
  moveLog: [],
  updatedAt: '2026-07-29T00:00:00.000Z',
  ...over,
});

const result = (over: Partial<StoredResult> = {}): StoredResult => ({
  id: crypto.randomUUID(),
  gameId: 'minesweeper',
  mode: 'daily',
  dateKey: '2026-07-29',
  score: 123,
  stats: {},
  moveLog: [],
  completedAt: '2026-07-29T00:00:00.000Z',
  syncedAt: null,
  ...over,
});

describe('saveKey', () => {
  it('is stable and distinguishes mode/date', () => {
    expect(saveKey('wordle', 'daily', '2026-07-29')).toBe('wordle:daily:2026-07-29');
    expect(saveKey('2048', 'endless', null)).toBe('2048:endless:endless');
  });
});

describe('arcade_saves store', () => {
  it('round-trips a save through put/get', async () => {
    const key = saveKey('minesweeper', 'daily', '2026-07-29');
    await putSave(key, save());
    const got = await getSave(key);
    expect(got).toEqual(save());
  });

  it('returns undefined for a key that was never saved', async () => {
    expect(await getSave(saveKey('wordle', 'daily', '2026-07-29'))).toBeUndefined();
  });

  it('put overwrites the previous value for the same key', async () => {
    const key = saveKey('2048', 'endless', null);
    await putSave(key, save({ moveLog: [1] }));
    await putSave(key, save({ moveLog: [1, 2, 3] }));
    expect((await getSave(key))?.moveLog).toEqual([1, 2, 3]);
  });

  it('delete removes the save', async () => {
    const key = saveKey('wordle', 'daily', '2026-07-29');
    await putSave(key, save());
    await deleteSave(key);
    expect(await getSave(key)).toBeUndefined();
  });
});

describe('arcade_results store', () => {
  it('round-trips a result and lists it via getAllResults', async () => {
    const r = result();
    await putResult(r);
    expect(await getAllResults()).toEqual([r]);
  });

  it('getUnsyncedResults returns only rows with syncedAt === null', async () => {
    const synced = result({ id: 'a', syncedAt: '2026-07-29T01:00:00.000Z' });
    const unsynced1 = result({ id: 'b', syncedAt: null });
    const unsynced2 = result({ id: 'c', syncedAt: null });
    await putResult(synced);
    await putResult(unsynced1);
    await putResult(unsynced2);

    const unsynced = await getUnsyncedResults();
    expect(unsynced.map((r) => r.id).sort()).toEqual(['b', 'c']);
  });

  it('put is idempotent on id — replays never duplicate a row', async () => {
    const r = result({ id: 'same-id', score: 1 });
    await putResult(r);
    await putResult({ ...r, score: 2 }); // simulates a retried sync marking it synced
    const all = await getAllResults();
    expect(all).toHaveLength(1);
    expect(all[0]!.score).toBe(2);
  });
});
