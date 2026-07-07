import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import {
  DEFAULT_SETTINGS,
  DISCONNECT_TURN_GRACE_MS,
  MAX_PLAYERS,
  MAX_SETS_TO_WIN,
  MIN_PLAYERS,
  MIN_SETS_TO_WIN,
  THEMES,
  TURN_TIMER_CHOICES,
  type GameSettings,
} from '@shared/settings';
import type { GameEvent, LobbyState } from '@shared/view';
import type {
  ClientToServerEvents,
  JoinInfo,
  PlayerAction,
  Result,
  ServerToClientEvents,
} from '@shared/protocol';
import {
  applyPlayerAction,
  applyTimeout,
  startRound,
  type GameState,
} from '../engine/game';
import { deadlineHintMs, redactFor, type SeatMeta } from '../engine/redact';

export interface SocketData {
  roomCode?: string;
  token?: string;
}

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type IoSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

interface RoomPlayer {
  token: string;
  nickname: string;
  seat: number;
  socket: IoSocket | null;
  connected: boolean;
  disconnectedAt: number | null;
  wins: number;
}

const LOBBY_DISCONNECT_DROP_MS = 60_000;
const ROOM_ABANDON_MS = 5 * 60_000;

function err<T>(error: string): Result<T> {
  return { ok: false, error };
}

function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export class Room {
  readonly code: string;
  private players: RoomPlayer[] = [];
  private hostToken: string | null = null;
  private settings: GameSettings = { ...DEFAULT_SETTINGS };
  private phase: 'lobby' | 'playing' = 'lobby';
  private game: GameState | null = null;
  private round = 0;
  private deadline: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private paused = false;
  private pausedRemainingMs: number | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ── membership ────────────────────────────────────────────────────────────

  join(nickname: string, socket: IoSocket): Result<JoinInfo> {
    if (this.phase !== 'lobby') return err('game already in progress');
    if (this.players.length >= MAX_PLAYERS) return err('party is full');
    const player: RoomPlayer = {
      token: randomUUID(),
      nickname,
      seat: this.players.length,
      socket,
      connected: true,
      disconnectedAt: null,
      wins: 0,
    };
    this.players.push(player);
    if (!this.hostToken) this.hostToken = player.token;
    this.bind(socket, player);
    this.broadcastLobby();
    return ok(this.joinInfo(player));
  }

  rejoin(token: string, socket: IoSocket): Result<JoinInfo> {
    const player = this.players.find((p) => p.token === token);
    if (!player) return err('unknown session');
    if (player.socket && player.socket.id !== socket.id) {
      player.socket.emit('room:closed', 'session opened elsewhere');
      player.socket.disconnect(true);
    }
    player.socket = socket;
    player.connected = true;
    player.disconnectedAt = null;
    this.bind(socket, player);
    this.broadcastLobby();
    if (this.game) {
      socket.emit(
        'game:state',
        redactFor(this.game, player.seat, this.seatMeta(), this.deadline, this.paused),
      );
      this.broadcastGame([]);
    }
    return ok(this.joinInfo(player));
  }

  leave(socket: IoSocket): void {
    const player = this.bySocket(socket);
    if (!player) return;
    socket.data.roomCode = undefined;
    socket.data.token = undefined;
    if (this.phase === 'playing') {
      this.markDisconnected(player);
      return;
    }
    this.players = this.players.filter((p) => p !== player);
    this.players.forEach((p, i) => (p.seat = i));
    if (this.hostToken === player.token) this.hostToken = this.players[0]?.token ?? null;
    this.broadcastLobby();
  }

  handleDisconnect(socket: IoSocket): void {
    const player = this.bySocket(socket);
    if (!player || player.socket !== socket) return;
    this.markDisconnected(player);
  }

  private markDisconnected(player: RoomPlayer): void {
    player.socket = null;
    player.connected = false;
    player.disconnectedAt = Date.now();
    this.broadcastLobby();
    if (this.game && this.game.phase.t !== 'roundOver') {
      const events: GameEvent[] = [];
      this.settleDisconnectedClaims(events);
      this.armDeadline();
      this.broadcastGame(events);
    }
  }

  // ── lobby ─────────────────────────────────────────────────────────────────

  updateSettings(socket: IoSocket, patch: Partial<GameSettings>): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (player.token !== this.hostToken) return err('only the host can change settings');
    if (this.phase !== 'lobby') return err('settings are locked during a game');
    const next = sanitizeSettings(this.settings, patch);
    if (!next) return err('invalid settings');
    this.settings = next;
    this.broadcastLobby();
    return ok(null);
  }

  start(socket: IoSocket): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (player.token !== this.hostToken) return err('only the host can start');
    if (this.phase !== 'lobby') return err('game already started');
    this.players = this.players.filter((p) => p.connected);
    this.players.forEach((p, i) => (p.seat = i));
    if (!this.players.some((p) => p.token === this.hostToken)) {
      this.hostToken = this.players[0]?.token ?? null;
    }
    if (this.players.length < MIN_PLAYERS || this.players.length > MAX_PLAYERS) {
      return err(`need ${MIN_PLAYERS}-${MAX_PLAYERS} connected players`);
    }
    this.phase = 'playing';
    this.round = 0;
    this.beginRound();
    return ok(null);
  }

  nextRound(socket: IoSocket): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (!this.canDirect(player)) return err('only the host can continue');
    if (this.phase !== 'playing' || !this.game) return err('no game in progress');
    if (this.game.phase.t !== 'roundOver') return err('round still in progress');
    this.beginRound();
    return ok(null);
  }

  toLobby(socket: IoSocket): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (!this.canDirect(player)) return err('only the host can end the game');
    if (this.phase !== 'playing') return err('not in a game');
    this.phase = 'lobby';
    this.game = null;
    this.paused = false;
    this.pausedRemainingMs = null;
    this.clearTimer();
    this.broadcastLobby();
    return ok(null);
  }

  pause(socket: IoSocket): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (!this.canDirect(player)) return err('only the host can pause');
    if (this.phase !== 'playing' || !this.game) return err('no game in progress');
    if (this.game.phase.t === 'roundOver') return err('round is over');
    if (this.paused) return ok(null);
    this.paused = true;
    if (this.deadline !== null) this.pausedRemainingMs = Math.max(this.deadline - Date.now(), 0);
    this.clearTimer();
    this.broadcastGame([]);
    return ok(null);
  }

  resume(socket: IoSocket): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (!this.canDirect(player)) return err('only the host can resume');
    if (!this.paused) return ok(null);
    this.paused = false;
    if (this.pausedRemainingMs !== null) {
      const remaining = this.pausedRemainingMs;
      this.pausedRemainingMs = null;
      this.deadline = Date.now() + remaining;
      this.timer = setTimeout(() => this.onDeadline(), remaining);
    } else {
      this.armDeadline();
    }
    this.broadcastGame([]);
    return ok(null);
  }

  /** The host, or anyone if the host is disconnected (so a party is never stuck). */
  private canDirect(player: RoomPlayer): boolean {
    if (player.token === this.hostToken) return true;
    const host = this.players.find((p) => p.token === this.hostToken);
    return !host || !host.connected;
  }

  private beginRound(): void {
    this.paused = false;
    this.pausedRemainingMs = null;
    this.round += 1;
    const dealerSeat = (this.round - 1) % this.players.length;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const { state, events } = startRound(
      this.settings,
      this.players.length,
      dealerSeat,
      this.round,
      seed,
    );
    this.game = state;
    this.broadcastLobby();
    this.afterEngineStep(events);
  }

  // ── game actions ──────────────────────────────────────────────────────────

  action(socket: IoSocket, action: PlayerAction): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (this.phase !== 'playing' || !this.game) return err('no game in progress');
    if (this.paused) return err('game is paused');
    const res = applyPlayerAction(this.game, player.seat, action);
    if (!res.ok) return err(res.error);
    this.afterEngineStep(res.events);
    return ok(null);
  }

  private onDeadline(): void {
    this.timer = null;
    if (!this.game || this.game.phase.t === 'roundOver') return;
    const events = applyTimeout(this.game);
    this.afterEngineStep(events);
  }

  private afterEngineStep(events: GameEvent[]): void {
    this.settleDisconnectedClaims(events);
    for (const e of events) {
      if (e.t === 'win') {
        const winner = this.players[e.seat];
        if (winner) winner.wins += 1;
      }
    }
    this.armDeadline();
    this.broadcastGame(events);
    if (this.game?.phase.t === 'roundOver') this.broadcastLobby();
  }

  /** Disconnected players never hold up a claim window. */
  private settleDisconnectedClaims(events: GameEvent[]): void {
    const game = this.game;
    if (!game) return;
    while (game.phase.t === 'claimWindow') {
      const phase = game.phase;
      const pending = [...phase.eligible.keys()].find(
        (seat) => !phase.responses.has(seat) && !this.players[seat]?.connected,
      );
      if (pending === undefined) break;
      const res = applyPlayerAction(game, pending, { t: 'pass' });
      if (!res.ok) break;
      events.push(...res.events);
    }
  }

  private armDeadline(): void {
    this.clearTimer();
    const game = this.game;
    if (!game || game.phase.t === 'roundOver' || this.paused) return;
    let hint = deadlineHintMs(game);
    if (game.phase.t === 'awaitingDiscard' && !this.players[game.phase.seat]?.connected) {
      hint = hint === null ? DISCONNECT_TURN_GRACE_MS : Math.min(hint, DISCONNECT_TURN_GRACE_MS);
    }
    if (hint === null) return;
    this.deadline = Date.now() + hint;
    this.timer = setTimeout(() => this.onDeadline(), hint);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.deadline = null;
  }

  // ── broadcast ─────────────────────────────────────────────────────────────

  private broadcastLobby(): void {
    for (const p of this.players) p.socket?.emit('lobby:state', this.lobbyState(p.seat));
  }

  private broadcastGame(events: GameEvent[]): void {
    const game = this.game;
    if (!game) return;
    const meta = this.seatMeta();
    for (const p of this.players) {
      if (!p.socket) continue;
      for (const e of events) p.socket.emit('game:event', e);
      p.socket.emit('game:state', redactFor(game, p.seat, meta, this.deadline, this.paused));
    }
  }

  private seatMeta(): SeatMeta[] {
    return this.players.map((p) => ({
      nickname: p.nickname,
      connected: p.connected,
      isHost: p.token === this.hostToken,
      wins: p.wins,
    }));
  }

  lobbyState(yourSeat: number): LobbyState {
    return {
      roomCode: this.code,
      phase: this.phase,
      players: this.players.map((p) => ({
        seat: p.seat,
        nickname: p.nickname,
        connected: p.connected,
        isHost: p.token === this.hostToken,
        wins: p.wins,
      })),
      settings: this.settings,
      round: this.round,
      yourSeat,
    };
  }

  private joinInfo(player: RoomPlayer): JoinInfo {
    return {
      roomCode: this.code,
      token: player.token,
      seat: player.seat,
      lobby: this.lobbyState(player.seat),
    };
  }

  private bySocket(socket: IoSocket): RoomPlayer | undefined {
    return this.players.find((p) => p.token === socket.data.token);
  }

  private bind(socket: IoSocket, player: RoomPlayer): void {
    socket.data.roomCode = this.code;
    socket.data.token = player.token;
  }

  // ── lifecycle (called by RoomManager sweep) ───────────────────────────────

  sweep(now: number): void {
    if (this.phase !== 'lobby') return;
    const before = this.players.length;
    this.players = this.players.filter(
      (p) => p.connected || now - (p.disconnectedAt ?? now) < LOBBY_DISCONNECT_DROP_MS,
    );
    if (this.players.length !== before) {
      this.players.forEach((p, i) => (p.seat = i));
      if (!this.players.some((p) => p.token === this.hostToken)) {
        this.hostToken = this.players[0]?.token ?? null;
      }
      this.broadcastLobby();
    }
  }

  isAbandoned(now: number): boolean {
    if (this.players.length === 0) return true;
    return this.players.every(
      (p) => !p.connected && now - (p.disconnectedAt ?? now) > ROOM_ABANDON_MS,
    );
  }

  close(reason: string): void {
    this.clearTimer();
    for (const p of this.players) p.socket?.emit('room:closed', reason);
    this.players = [];
  }
}

function sanitizeSettings(current: GameSettings, patch: Partial<GameSettings>): GameSettings | null {
  const next = { ...current };
  if (patch.includeFlowers !== undefined) {
    if (typeof patch.includeFlowers !== 'boolean') return null;
    next.includeFlowers = patch.includeFlowers;
  }
  if (patch.includeHonors !== undefined) {
    if (typeof patch.includeHonors !== 'boolean') return null;
    next.includeHonors = patch.includeHonors;
  }
  if (patch.openHands !== undefined) {
    if (typeof patch.openHands !== 'boolean') return null;
    next.openHands = patch.openHands;
  }
  if (patch.turnTimerSeconds !== undefined) {
    if (!TURN_TIMER_CHOICES.includes(patch.turnTimerSeconds)) return null;
    next.turnTimerSeconds = patch.turnTimerSeconds;
  }
  if (patch.setsToWin !== undefined) {
    if (patch.setsToWin !== null) {
      if (
        typeof patch.setsToWin !== 'number' ||
        !Number.isInteger(patch.setsToWin) ||
        patch.setsToWin < MIN_SETS_TO_WIN ||
        patch.setsToWin > MAX_SETS_TO_WIN
      ) {
        return null;
      }
    }
    next.setsToWin = patch.setsToWin;
  }
  if (patch.theme !== undefined) {
    if (!THEMES.includes(patch.theme)) return null;
    next.theme = patch.theme;
  }
  return next;
}
