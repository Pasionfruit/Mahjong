import type { Move, QuoridorState } from '../engine';
import { easyMove } from './easy';
import type { AiDifficulty } from './chooser';
import type { AiRequest, AiResponse } from './worker';

/**
 * Main-thread facade over the AI worker. Guarantees an answer: if the worker
 * dies or stalls, a fast main-thread fallback move is produced so the game
 * can never hang on the AI.
 */

const SAFETY_TIMEOUT_MS = 5_000;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: { move: Move; thinkMs: number }) => void; fallback: QuoridorState }>();

function settleAll(): void {
  for (const [, p] of pending) {
    p.resolve({ move: easyMove(p.fallback), thinkMs: 0 });
  }
  pending.clear();
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return null; // worker unavailable (odd embedder) — fall back inline
  }
  worker.onmessage = (e: MessageEvent<AiResponse>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    p.resolve({ move: e.data.move, thinkMs: e.data.thinkMs });
  };
  worker.onerror = () => {
    worker?.terminate();
    worker = null;
    settleAll();
  };
  return worker;
}

export function requestAiMove(
  state: QuoridorState,
  difficulty: AiDifficulty,
  recentKeys: number[],
): Promise<{ move: Move; thinkMs: number }> {
  const w = ensureWorker();
  if (!w) {
    return Promise.resolve({ move: easyMove(state), thinkMs: 0 });
  }
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, { resolve, fallback: state });
    const timer = setTimeout(() => {
      if (pending.delete(id)) resolve({ move: easyMove(state), thinkMs: 0 });
    }, SAFETY_TIMEOUT_MS);
    const wrapped = pending.get(id)!;
    wrapped.resolve = (r) => {
      clearTimeout(timer);
      resolve(r);
    };
    const req: AiRequest = {
      id,
      difficulty,
      pawns: [{ ...state.pawns[0] }, { ...state.pawns[1] }],
      hWalls: state.hWalls.slice(),
      vWalls: state.vWalls.slice(),
      wallsLeft: [state.wallsLeft[0], state.wallsLeft[1]],
      turn: state.turn,
      recentKeys,
    };
    w.postMessage(req);
  });
}

/** Tear the worker down when leaving the Quoridor screen. */
export function disposeAiWorker(): void {
  worker?.terminate();
  worker = null;
  settleAll();
}
