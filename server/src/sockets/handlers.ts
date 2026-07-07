import type { PlayerAction, Result } from '@shared/protocol';
import { RoomManager } from '../rooms/RoomManager';
import { normalizeCode } from '../rooms/codes';
import type { IoServer, IoSocket } from '../rooms/Room';

export type { IoServer, IoSocket } from '../rooms/Room';

function fail<T>(error: string): Result<T> {
  return { ok: false, error };
}

function cleanNickname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const nickname = input.trim().slice(0, 16);
  return nickname.length > 0 ? nickname : null;
}

const CLAIM_KINDS = new Set(['win', 'pong', 'kong', 'chow']);
const ACTION_KINDS = new Set([
  'discard',
  'claim',
  'pass',
  'concealedKong',
  'addedKong',
  'winSelfDraw',
]);

function isPlayerAction(a: unknown): a is PlayerAction {
  if (typeof a !== 'object' || a === null) return false;
  const action = a as Record<string, unknown>;
  if (typeof action.t !== 'string' || !ACTION_KINDS.has(action.t)) return false;
  switch (action.t) {
    case 'discard':
    case 'addedKong':
      return typeof action.tileId === 'number';
    case 'concealedKong':
      return typeof action.kind === 'string';
    case 'claim':
      if (typeof action.claim !== 'string' || !CLAIM_KINDS.has(action.claim)) return false;
      if (action.claim === 'chow') {
        return (
          Array.isArray(action.tileIds) &&
          action.tileIds.length === 2 &&
          action.tileIds.every((id) => typeof id === 'number')
        );
      }
      return true;
    default:
      return true;
  }
}

export function registerHandlers(io: IoServer): void {
  const manager = new RoomManager();

  const roomOf = (socket: IoSocket) =>
    socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;

  io.on('connection', (socket) => {
    socket.on('room:create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const nickname = cleanNickname(payload?.nickname);
      if (!nickname) return ack(fail('enter a nickname'));
      if (roomOf(socket)) return ack(fail('already in a room'));
      const room = manager.create();
      ack(room.join(nickname, socket));
    });

    socket.on('room:join', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const nickname = cleanNickname(payload?.nickname);
      if (!nickname) return ack(fail('enter a nickname'));
      if (typeof payload?.roomCode !== 'string') return ack(fail('enter a room code'));
      if (roomOf(socket)) return ack(fail('already in a room'));
      const room = manager.get(normalizeCode(payload.roomCode));
      if (!room) return ack(fail('room not found'));
      ack(room.join(nickname, socket));
    });

    socket.on('room:rejoin', (payload, ack) => {
      if (typeof ack !== 'function') return;
      if (typeof payload?.roomCode !== 'string' || typeof payload?.token !== 'string') {
        return ack(fail('invalid session'));
      }
      const room = manager.get(normalizeCode(payload.roomCode));
      if (!room) return ack(fail('room no longer exists'));
      ack(room.rejoin(payload.token, socket));
    });

    socket.on('room:leave', () => {
      roomOf(socket)?.leave(socket);
    });

    socket.on('lobby:settings', (patch, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      ack(room.updateSettings(socket, patch ?? {}));
    });

    socket.on('lobby:start', (ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      ack(room.start(socket));
    });

    socket.on('game:action', (action, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      if (!isPlayerAction(action)) return ack(fail('invalid action'));
      ack(room.action(socket, action));
    });

    socket.on('game:nextRound', (ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      ack(room.nextRound(socket));
    });

    socket.on('game:toLobby', (ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      ack(room.toLobby(socket));
    });

    socket.on('game:pause', (ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      ack(room.pause(socket));
    });

    socket.on('game:resume', (ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      ack(room.resume(socket));
    });

    socket.on('disconnect', () => {
      roomOf(socket)?.handleDisconnect(socket);
    });
  });
}
