import type { GameSettings } from './settings';
import type { ClientGameView, GameEvent, LobbyState } from './view';
import type { TileKind } from './tiles';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type Ack<T = null> = (r: Result<T>) => void;

export type PlayerAction =
  | { t: 'discard'; tileId: number }
  | { t: 'claim'; claim: 'win' | 'pong' | 'kong' }
  | { t: 'claim'; claim: 'chow'; tileIds: [number, number] }
  | { t: 'pass' }
  | { t: 'concealedKong'; kind: TileKind }
  | { t: 'addedKong'; tileId: number }
  | { t: 'winSelfDraw' };

export interface JoinInfo {
  roomCode: string;
  token: string;
  seat: number;
  lobby: LobbyState;
}

export interface ClientToServerEvents {
  'room:create': (p: { nickname: string }, ack: Ack<JoinInfo>) => void;
  'room:join': (p: { roomCode: string; nickname: string }, ack: Ack<JoinInfo>) => void;
  'room:rejoin': (p: { roomCode: string; token: string }, ack: Ack<JoinInfo>) => void;
  'room:leave': () => void;
  'lobby:settings': (p: Partial<GameSettings>, ack: Ack) => void;
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
