import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  JoinInfo,
  PlayerAction,
  Result,
  ServerToClientEvents,
} from '@shared/protocol';
import type { BotDifficulty, GameSettings } from '@shared/settings';
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

socket.on('game:state', (v) => {
  const prev = useStore.getState().game;
  const becameMyTurn =
    v.phase === 'awaitingDiscard' &&
    v.turnSeat === v.yourSeat &&
    (!prev ||
      prev.round !== v.round ||
      prev.turnSeat !== v.turnSeat ||
      prev.phase !== 'awaitingDiscard');
  if (becameMyTurn && !v.result) play('yourTurn');
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

export function createParty(nickname: string): Promise<Result<JoinInfo>> {
  return new Promise((resolve) =>
    socket.emit('room:create', { nickname }, (r) => {
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

export function updateSettings(patch: Partial<GameSettings>): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:settings', patch, resolve));
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
