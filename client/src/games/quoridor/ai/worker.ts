import { newGame, type Move, type PlayerIndex, type Pos, type QuoridorState } from '../engine';
import { chooseAiMove, type AiDifficulty } from './chooser';
import { searchBestMove } from './search';

/**
 * AI web worker: receives a packed position, thinks within its difficulty
 * budget, and posts the chosen move back. Keeps the UI thread untouched even
 * while Hard crunches its ~0.9s of search.
 */

export interface AiRequest {
  id: number;
  difficulty: AiDifficulty;
  pawns: [Pos, Pos];
  hWalls: Uint8Array;
  vWalls: Uint8Array;
  wallsLeft: [number, number];
  turn: PlayerIndex;
  recentKeys: number[];
}

export interface AiResponse {
  id: number;
  move: Move;
  thinkMs: number;
}

// Typed view of the dedicated-worker global without pulling in the webworker
// lib (which conflicts with the app's DOM lib).
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<AiRequest>) => void) | null;
  postMessage(msg: AiResponse): void;
};

function unpack(d: AiRequest): QuoridorState {
  return {
    pawns: [{ ...d.pawns[0] }, { ...d.pawns[1] }],
    hWalls: new Uint8Array(d.hWalls),
    vWalls: new Uint8Array(d.vWalls),
    wallsLeft: [d.wallsLeft[0], d.wallsLeft[1]],
    turn: d.turn,
    winner: null,
    history: [],
  };
}

ctx.onmessage = (e: MessageEvent<AiRequest>) => {
  const t0 = performance.now();
  const move = chooseAiMove(unpack(e.data), e.data.difficulty, e.data.recentKeys);
  ctx.postMessage({ id: e.data.id, move, thinkMs: performance.now() - t0 });
};

// Warm-up: run one small search so V8 has JIT-compiled the hot paths before
// the first real request lands.
searchBestMove(newGame(), { maxDepth: 3, timeBudgetMs: 40 });
