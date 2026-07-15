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
  // Never yank someone out of a device-local game to rejoin a room; the
  // saved session stays put and reconnects normally once they leave.
  if (session && !useStore.getState().lobby && !useStore.getState().localGame) {
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
  if (v.g === 'bomberman' || v.g === 'tetris' || v.g === 'sumo') return false;
  if (v.g === 'art') {
    // Chime when you become the drawer and must pick a word.
    return (
      v.mode === 'guess' &&
      v.phase === 'choose' &&
      v.guess?.drawerSeat === v.yourSeat &&
      !v.result
    );
  }
  if (v.turnSeat !== v.yourSeat || v.result) return false;
  return v.g === 'mahjong' ? v.phase === 'awaitingDiscard' : true;
}

socket.on('game:state', (v) => {
  const prev = useStore.getState().game;
  const became = myTurn(v) && (!prev || prev.g !== v.g || !myTurn(prev));
  if (became) play('yourTurn');
  useStore.getState().setGame(v);
});

// Team wins emit one 'win' event per member; buffer them for a beat and play
// a single jingle — 'win' if any of them is mine, else one 'lose'.
let pendingWinSeats: number[] | null = null;

function queueWinSound(seat: number, mySeat: number | undefined) {
  if (pendingWinSeats) {
    pendingWinSeats.push(seat);
    return;
  }
  pendingWinSeats = [seat];
  setTimeout(() => {
    const seats = pendingWinSeats ?? [];
    pendingWinSeats = null;
    play(seats.includes(mySeat ?? -1) ? 'win' : 'lose');
  }, 60);
}

socket.on('game:event', (e) => {
  const mySeat = useStore.getState().game?.yourSeat;
  // Art stroke deltas feed the canvas cache and stay out of the event log.
  switch (e.t) {
    case 'stroke':
      useStore
        .getState()
        .artStrokeDelta(
          e.cv,
          { seat: e.seat, id: e.id, color: e.color, size: e.size, erase: e.erase, pts: e.pts },
          e.full ? 'replace' : 'append',
        );
      return;
    case 'strokeUndo':
      useStore.getState().artStrokeUndo(e.cv, e.seat, e.id);
      return;
    case 'strokeClear':
      useStore.getState().artStrokeClear(e.cv, e.seat);
      return;
    case 'artVote':
      useStore.getState().artVoteCast(e.seat);
      play('discard');
      return;
  }
  switch (e.t) {
    case 'ko':
      play(e.seat === mySeat ? 'hurt' : 'boom');
      break;
    case 'clash':
      play('bomb');
      break;
    case 'edge':
      play('discard');
      break;
    case 'box':
      play(e.seat === mySeat ? 'powerup' : 'pong');
      break;
    case 'lines':
      if (e.seat === mySeat) play(e.count >= 4 ? 'kong' : 'pong');
      break;
    case 'garbage':
      if (e.seat === mySeat) play('hurt');
      break;
    case 'artGuess':
      if (e.correct) play(e.seat === mySeat ? 'powerup' : 'pong');
      break;
    case 'artPhase':
      play('draw');
      break;
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
      play(e.fatal ? 'eliminated' : 'hurt');
      break;
    case 'gameOver':
      play('gameOver');
      break;
    case 'win':
      queueWinSound(e.seat, mySeat);
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

export function setTeam(team: number): Promise<Result<null>> {
  return new Promise((resolve) => socket.emit('lobby:team', { team }, resolve));
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
