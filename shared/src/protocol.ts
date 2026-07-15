import type { BotDifficulty } from './settings';
import type { ClientGameView, GameEvent, LobbyState } from './view';
import type { TileKind } from './tiles';
import type { GameId } from './games';
import type { ArtAction } from './art';
import type { TetrisAction } from './tetris';
import type { DotsAction } from './dots';

export type { ArtAction } from './art';
export type { TetrisAction } from './tetris';
export type { DotsAction } from './dots';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type Ack<T = null> = (r: Result<T>) => void;

export type MahjongAction =
  | { t: 'discard'; tileId: number }
  | { t: 'claim'; claim: 'win' | 'pong' | 'kong' }
  // Reserve a chow before choosing which run — locks in your place in the race
  // so a rival's pong can't slip in while you pick a variation.
  | { t: 'claim'; claim: 'chowIntent' }
  | { t: 'claim'; claim: 'chow'; tileIds: [number, number] }
  | { t: 'pass' }
  | { t: 'concealedKong'; kind: TileKind }
  | { t: 'addedKong'; tileId: number }
  | { t: 'winSelfDraw' };

/** Ultimate Tic-Tac-Toe: place your mark in board `board`, cell `cell` (0–8). */
export type UtttAction = { t: 'place'; board: number; cell: number };

/** Bomberman: held-direction input, drop a bomb, or grab/throw one (glove). */
export type BombermanAction =
  | { t: 'input'; dir: 'up' | 'down' | 'left' | 'right' | null }
  | { t: 'bomb' }
  | { t: 'grab' };

export type PlayerAction =
  | MahjongAction
  | UtttAction
  | BombermanAction
  | ArtAction
  | TetrisAction
  | DotsAction;

export interface JoinInfo {
  roomCode: string;
  token: string;
  seat: number;
  lobby: LobbyState;
}

export interface ClientToServerEvents {
  'room:create': (p: { nickname: string; gameId: GameId }, ack: Ack<JoinInfo>) => void;
  'room:join': (p: { roomCode: string; nickname: string }, ack: Ack<JoinInfo>) => void;
  'room:rejoin': (p: { roomCode: string; token: string }, ack: Ack<JoinInfo>) => void;
  'room:leave': () => void;
  'lobby:settings': (p: Record<string, unknown>, ack: Ack) => void;
  'lobby:color': (p: { color: string }, ack: Ack) => void;
  'lobby:team': (p: { team: number }, ack: Ack) => void;
  'lobby:addBot': (p: { difficulty: BotDifficulty }, ack: Ack) => void;
  'lobby:removeBot': (p: { seat: number }, ack: Ack) => void;
  'lobby:start': (ack: Ack) => void;
  'game:action': (a: PlayerAction, ack: Ack) => void;
  'game:nextRound': (ack: Ack) => void;
  'game:toLobby': (ack: Ack) => void;
  'game:pause': (ack: Ack) => void;
  'game:resume': (ack: Ack) => void;
}

export interface ServerToClientEvents {
  'lobby:state': (s: LobbyState) => void;
  'game:state': (v: ClientGameView) => void;
  'game:event': (e: GameEvent) => void;
  'room:closed': (reason: string) => void;
}
