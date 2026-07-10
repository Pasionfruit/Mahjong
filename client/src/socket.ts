import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  JoinInfo,
  PlayerAction,
  Result,
  ServerToClientEvents,
} from '@shared/protocol';
import type { ClientGameView } from '@shared/view';
import type { BotDifficulty } from '@shared/settings';
import type { GameId } from '@shared/games';
import { useStore } from './store';
import { clearSession, loadSession, saveSession } from './session';
import { play } from './audio';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

socket.on('connect', () => {
  useStore.getState().setConnected(true);
  const session = loadSession();
  if (session && !useStore.getState().lobby) {
    socket.emit('room:rejoin', { roomCode: session.roomCode, token: session.token }, (r) => {
      if (r.ok) {
        useStore.getState().setLobby(r.value.lobby);
      } else {
        clearSession();
      }
    });
  }
});

socket.on('disconnect', () => useStore.getState().setConnected(false));
socket.on('lobby:state', (s) => useStore.getState().setLobby(s));

/** Is it the viewer's move right now? Real-time games have no turn chime. */
function myTurn(v: ClientGameView): boolean {
  if (v.g === 'bomberman') return false;
  if (v.turnSeat !== v.yourSeat || v.result) return false;
  return v.g === 'mahjong' ? v.phase === 'awaitingDiscard' : true;
}

socket.on('game:state', (v) => {
  const prev = useStore.getState().game;
  const became = myTurn(v) && (!prev || prev.g !== v.g || !myTurn(prev));
  if (became) play('yourTurn');
  useStore.getState().setGame(v);
});

socket.on('game:event', (e) => {
  const mySeat = useStore.getState().game?.yourSeat;
  switch (e.t) {
    case 'draw':
      play('draw');
      break;
    case 'discard':
      play('discard');
      break;
    case 'claim':
      play(e.claim === 'pong' ? 'pong' : e.claim === 'chow' ? 'chow' : 'kong');
      break;
    case 'concealedKong':
    case 'addedKong':
      play('kong');
      break;
    case 'place':
      play('discard');
      break;
    case 'bomb':
      play('bomb');
      break;
    case 'boom':
      play('boom');
      break;
    case 'powerup':
      if (e.seat === mySeat) play('powerup');
      break;
    case 'death':
      if (e.seat === mySeat) play('lose');
      break;
    case 'win':
      play(e.seat === mySeat ? 'win' : 'lose');
      break;
  }
  useStore.getState().pushEvent(e);
});
socket.on('room:closed', (reason) => {
  clearSession();
  useStore.getState().reset();
  useStore.getState().setNotice(reason);
});

function handleJoin(nickname: string) {
  return (r: Result<JoinInfo>) => {
    if (r.ok) {
      saveSession({ roomCode: r.value.roomCode, token: r.value.token, nickname });
      useStore.getState().setNotice(null);
      useStore.getState().setLobby(r.value.lobby);
    }
  };
}

export function createParty(nickname: string, gameId: GameId): Promise<Result<JoinInfo>> {
  return new Promise((resolve) =>
    socket.emit('room:create', { nickname, gameId }, (r) => {
      handleJoin(nickname)(r);
      resolve(r);
    }),
  );
}

export function joinParty(roomCode: string, nickname: string): Promise<Result<JoinInfo>> {
  return new Promise((resolve) =>
    socket.emit('room:join', { roomCode, nickname }, (r) => {
      handleJoin(nickname)(r);
      resolve(r);
    }),
  );
}

export function leaveParty(): void {
  socket.emit('room:leave');
  clearSession();
  useStore.getState().reset();
}

export function updateSettings(patch: Record<string, unknown>): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:settings', patch, resolve));
}

export function setColor(color: string): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:color', { color }, resolve));
}

export function addBot(difficulty: BotDifficulty): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:addBot', { difficulty }, resolve));
}

export function removeBot(seat: number): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:removeBot', { seat }, resolve));
}

export function startGame(): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:start', resolve));
}

export function sendAction(action: PlayerAction): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('game:action', action, resolve));
}

export function nextRound(): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('game:nextRound', resolve));
}

export function backToLobby(): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('game:toLobby', resolve));
}

export function pauseGame(): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('game:pause', resolve));
}

export function resumeGame(): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('game:resume', resolve));
}
