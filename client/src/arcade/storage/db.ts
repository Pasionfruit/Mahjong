import type { SavedGame, StoredResult } from '../types';

/**
 * A thin, hand-rolled IndexedDB wrapper — two object stores, five
 * operations, not a case for a client-side ORM. Chosen over localStorage
 * (used elsewhere in this app only for two small, ephemeral session keys —
 * see client/src/session.ts) because it's async off the main thread and
 * structured-clones objects natively, which matters once this store holds
 * a growing history of results plus the sync outbox.
 */

const DB_NAME = 'brain-arcade';
const DB_VERSION = 1;
const SAVES_STORE = 'arcade_saves';
const RESULTS_STORE = 'arcade_results';

let dbPromise: Promise<IDBDatabase> | null = null;
let dbInstance: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SAVES_STORE)) db.createObjectStore(SAVES_STORE);
        if (!db.objectStoreNames.contains(RESULTS_STORE)) {
          db.createObjectStore(RESULTS_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => {
        dbInstance = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Test-only: close and drop the cached connection so a fresh openDb() reopens
 *  cleanly and a subsequent deleteDatabase() doesn't block on this handle. */
export function resetDbConnectionForTests(): void {
  dbInstance?.close();
  dbInstance = null;
  dbPromise = null;
}

// ── saves: in-progress state, one row per (gameId, mode, dateKey) ──────────

export function saveKey(gameId: string, mode: 'daily' | 'endless', dateKey: string | null): string {
  return `${gameId}:${mode}:${dateKey ?? 'endless'}`;
}

export function getSave(key: string): Promise<SavedGame | undefined> {
  return request(SAVES_STORE, 'readonly', (s) => s.get(key));
}

export async function putSave(key: string, value: SavedGame): Promise<void> {
  await request(SAVES_STORE, 'readwrite', (s) => s.put(value, key));
}

export async function deleteSave(key: string): Promise<void> {
  await request(SAVES_STORE, 'readwrite', (s) => s.delete(key));
}

// ── results: completed runs; this store doubles as the sync outbox ─────────
// (unsynced rows are just `syncedAt === null` — one store, not a store plus
// a mirrored outbox, which would be its own dual-write bug surface).

export async function putResult(row: StoredResult): Promise<void> {
  await request(RESULTS_STORE, 'readwrite', (s) => s.put(row));
}

export function getAllResults(): Promise<StoredResult[]> {
  return request<StoredResult[]>(RESULTS_STORE, 'readonly', (s) => s.getAll());
}

export async function getUnsyncedResults(): Promise<StoredResult[]> {
  const all = await getAllResults();
  return all.filter((r) => r.syncedAt === null);
}
