import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({ getSupabase: vi.fn() }));
vi.mock('../auth', () => ({ currentUser: vi.fn(), getDisplayName: vi.fn() }));

import { currentUser, getDisplayName } from '../auth';
import { getSupabase } from '../supabase';
import { getAllResults, resetDbConnectionForTests } from './db';
import { flushOutbox, recordResult } from './outbox';

const mockedGetSupabase = vi.mocked(getSupabase);
const mockedCurrentUser = vi.mocked(currentUser);
const mockedGetDisplayName = vi.mocked(getDisplayName);

const FAKE_USER = { id: 'user-1' } as unknown as NonNullable<Awaited<ReturnType<typeof currentUser>>>;

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase('brain-arcade');
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

type OpResult = { error: { code?: string; message?: string } | null };

function fakeClient(opts: {
  upsert?: (row: unknown) => Promise<OpResult>;
  insert?: (row: unknown) => Promise<OpResult>;
}) {
  const upsert = opts.upsert ?? (async () => ({ error: null }));
  const insert = opts.insert ?? (async () => ({ error: null }));
  return { from: () => ({ upsert, insert }) } as unknown as ReturnType<typeof getSupabase>;
}

beforeEach(async () => {
  resetDbConnectionForTests();
  await deleteDatabase();
  vi.stubGlobal('navigator', { onLine: true });
  mockedGetSupabase.mockReset();
  mockedCurrentUser.mockReset().mockResolvedValue(FAKE_USER);
  mockedGetDisplayName.mockReset().mockResolvedValue('Puzzler#test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const baseResult = {
  gameId: 'minesweeper',
  mode: 'daily' as const,
  dateKey: '2026-07-29',
  score: 99,
  stats: { time: 42 },
  moveLog: [],
  completedAt: '2026-07-29T00:00:00.000Z',
};

describe('recordResult', () => {
  it('saves locally immediately, even with no configured backend', async () => {
    mockedGetSupabase.mockReturnValue(null);
    const row = await recordResult(baseResult);
    expect(row.syncedAt).toBeNull();
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    const all = await getAllResults();
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(row.id);
  });
});

describe('flushOutbox', () => {
  it('does nothing when Brain Arcade is not configured', async () => {
    mockedGetSupabase.mockReturnValue(null);
    await recordResult(baseResult);
    await flushOutbox();
    const [row] = await getAllResults();
    expect(row!.syncedAt).toBeNull();
  });

  it('does nothing while offline, leaving results queued', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const upsert = vi.fn();
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));
    await recordResult(baseResult); // recordResult's own flush call also sees offline
    upsert.mockClear();
    await flushOutbox();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('does nothing when not signed in yet, leaving results queued', async () => {
    mockedGetSupabase.mockReturnValue(null); // block recordResult's own auto-flush
    await recordResult(baseResult);
    const upsert = vi.fn();
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));
    mockedCurrentUser.mockResolvedValue(null);

    await flushOutbox();

    expect(upsert).not.toHaveBeenCalled();
    const [stored] = await getAllResults();
    expect(stored!.syncedAt).toBeNull();
  });

  it('marks a result synced on a successful upsert, attributed to the signed-in user', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(null); // block recordResult's own auto-flush
    const row = await recordResult(baseResult);
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));

    await flushOutbox();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: row.id,
        user_id: 'user-1',
        display_name: 'Puzzler#test',
        game_id: 'minesweeper',
        date_key: '2026-07-29',
      }),
      { onConflict: 'id' },
    );
    const [stored] = await getAllResults();
    expect(stored!.syncedAt).not.toBeNull();
  });

  it('treats a daily-uniqueness conflict (23505) as synced — first write wins', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    mockedGetSupabase.mockReturnValue(null);
    await recordResult(baseResult);
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));

    await flushOutbox();

    const [stored] = await getAllResults();
    expect(stored!.syncedAt).not.toBeNull(); // not left queued for endless retry
  });

  it('leaves a result unsynced on a genuine error, to retry later', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { code: '500', message: 'server error' } });
    mockedGetSupabase.mockReturnValue(null);
    await recordResult(baseResult);
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));

    await flushOutbox();

    const [stored] = await getAllResults();
    expect(stored!.syncedAt).toBeNull();
  });

  it('is idempotent: flushing an already-synced result does not re-upsert it', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(null); // block recordResult's own fire-and-forget flush
    await recordResult(baseResult);
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));

    await flushOutbox(); // first explicit flush: syncs it, upsert called once
    expect(upsert).toHaveBeenCalledTimes(1);
    upsert.mockClear();

    await flushOutbox(); // second flush: nothing left unsynced

    expect(upsert).not.toHaveBeenCalled();
  });

  it('falls back to a generic display name if the profile lookup fails', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(null);
    await recordResult(baseResult);
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert }));
    mockedGetDisplayName.mockResolvedValue(null);

    await flushOutbox();

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ display_name: 'Puzzler' }),
      { onConflict: 'id' },
    );
  });

  it('awards xp on a genuine first sync', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(null);
    await recordResult(baseResult); // score: 99, mode: daily
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert, insert }));

    await flushOutbox();

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', delta: 35, reason: 'minesweeper:daily', game_id: 'minesweeper' }),
    );
  });

  it('does not award xp on a daily-uniqueness conflict — another device already claimed it', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const insert = vi.fn().mockResolvedValue({ error: null });
    mockedGetSupabase.mockReturnValue(null);
    await recordResult(baseResult);
    mockedGetSupabase.mockReturnValue(fakeClient({ upsert, insert }));

    await flushOutbox();

    expect(insert).not.toHaveBeenCalled();
  });
});
