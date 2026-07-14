import type { Result } from '@shared/protocol';
import { BOT_DIFFICULTIES, type BotDifficulty } from '@shared/settings';
import { isGameId } from '@shared/games';
import { PLAYER_COLORS } from '@shared/bomberman';
import { RoomManager } from '../rooms/RoomManager';
import { getModule } from '../games/registry';
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

export function registerHandlers(io: IoServer): void {
  const manager = new RoomManager();

  const roomOf = (socket: IoSocket) =>
    socket.data.roomCode ? manager.get(socket.data.roomCode) : undefined;

  io.on('connection', (socket) => {
    socket.on('room:create', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const nickname = cleanNickname(payload?.nickname);
      if (!nickname) return ack(fail('enter a nickname'));
      if (!isGameId(payload?.gameId)) return ack(fail('unknown game'));
      if (roomOf(socket)) return ack(fail('already in a room'));
      const room = manager.create(getModule(payload.gameId));
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

    socket.on('lobby:color', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      const color = payload?.color;
      if (typeof color !== 'string' || !(PLAYER_COLORS as readonly string[]).includes(color)) {
        return ack(fail('invalid color'));
      }
      ack(room.setColor(socket, color));
    });

    socket.on('lobby:team', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      const team = payload?.team;
      if (typeof team !== 'number' || !Number.isInteger(team) || team < 0 || team > 3) {
        return ack(fail('invalid team'));
      }
      ack(room.setTeam(socket, team));
    });

    socket.on('lobby:addBot', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      const difficulty = payload?.difficulty;
      if (
        typeof difficulty !== 'string' ||
        !(BOT_DIFFICULTIES as readonly string[]).includes(difficulty)
      ) {
        return ack(fail('invalid difficulty'));
      }
      ack(room.addBot(socket, difficulty as BotDifficulty));
    });

    socket.on('lobby:removeBot', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOf(socket);
      if (!room) return ack(fail('not in a room'));
      if (typeof payload?.seat !== 'number') return ack(fail('invalid seat'));
      ack(room.removeBot(socket, payload.seat));
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
