import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { type BotDifficulty, type GameSettings } from '@shared/settings';
import type { GameId } from '@shared/games';
import type { GameEvent, LobbyState } from '@shared/view';
import type {
  ClientToServerEvents,
  JoinInfo,
  PlayerAction,
  Result,
  ServerToClientEvents,
} from '@shared/protocol';
import type { GameModule, SeatMeta } from '../games/GameModule';

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
  isBot: boolean;
  botDifficulty?: BotDifficulty;
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
  private readonly module: GameModule;
  private players: RoomPlayer[] = [];
  private hostToken: string | null = null;
  private settings: GameSettings;
  private phase: 'lobby' | 'playing' = 'lobby';
  /** Opaque game state owned by the module; the room never inspects it. */
  private game: unknown = null;
  private round = 0;
  private deadline: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private paused = false;
  private pausedRemainingMs: number | null = null;
  private botTimers = new Map<string, NodeJS.Timeout>();

  constructor(code: string, module: GameModule) {
    this.code = code;
    this.module = module;
    this.settings = module.defaultSettings() as GameSettings;
  }

  // ── membership ────────────────────────────────────────────────────────────

  join(nickname: string, socket: IoSocket): Result<JoinInfo> {
    if (this.phase !== 'lobby') return err('game already in progress');
    if (this.players.length >= this.module.maxPlayers) return err('party is full');
    const player: RoomPlayer = {
      token: randomUUID(),
      nickname,
      seat: this.players.length,
      socket,
      connected: true,
      disconnectedAt: null,
      wins: 0,
      isBot: false,
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
        this.module.redactFor(this.game, player.seat, this.seatMeta(), this.deadline, this.paused),
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
    if (this.hostToken === player.token) {
      this.hostToken = this.players.find((p) => !p.isBot)?.token ?? null;
    }
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
    if (this.game && !this.module.isRoundOver(this.game)) {
      const events: GameEvent[] = [];
      this.settleDisconnectedClaims(events);
      this.armDeadline();
      this.broadcastGame(events);
      this.scheduleBotMoves();
    }
  }

  // ── lobby ─────────────────────────────────────────────────────────────────

  addBot(socket: IoSocket, difficulty: BotDifficulty): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (player.token !== this.hostToken) return err('only the host can add bots');
    if (this.phase !== 'lobby') return err('game already in progress');
    if (this.players.length >= this.module.maxPlayers) return err('party is full');
    const base = `${difficulty[0]!.toUpperCase()}${difficulty.slice(1)} Bot`;
    let nickname = base;
    for (let n = 2; this.players.some((p) => p.nickname === nickname); n++) {
      nickname = `${base} ${n}`;
    }
    this.players.push({
      token: randomUUID(),
      nickname,
      seat: this.players.length,
      socket: null,
      connected: true,
      disconnectedAt: null,
      wins: 0,
      isBot: true,
      botDifficulty: difficulty,
    });
    this.broadcastLobby();
    return ok(null);
  }

  removeBot(socket: IoSocket, seat: number): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (player.token !== this.hostToken) return err('only the host can remove bots');
    if (this.phase !== 'lobby') return err('game already in progress');
    const bot = this.players.find((p) => p.seat === seat && p.isBot);
    if (!bot) return err('no bot at that seat');
    this.players = this.players.filter((p) => p !== bot);
    this.players.forEach((p, i) => (p.seat = i));
    this.broadcastLobby();
    return ok(null);
  }

  updateSettings(socket: IoSocket, patch: Partial<GameSettings>): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (player.token !== this.hostToken) return err('only the host can change settings');
    if (this.phase !== 'lobby') return err('settings are locked during a game');
    const next = this.module.sanitizeSettings(this.settings, patch) as GameSettings | null;
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
      this.hostToken = this.players.find((p) => !p.isBot)?.token ?? null;
    }
    if (this.players.length < this.module.minPlayers || this.players.length > this.module.maxPlayers) {
      return err(`need ${this.module.minPlayers}-${this.module.maxPlayers} connected players`);
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
    if (!this.module.isRoundOver(this.game)) return err('round still in progress');
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
    this.clearBotTimers();
    this.broadcastLobby();
    return ok(null);
  }

  pause(socket: IoSocket): Result<null> {
    const player = this.bySocket(socket);
    if (!player) return err('not in this room');
    if (!this.canDirect(player)) return err('only the host can pause');
    if (this.phase !== 'playing' || !this.game) return err('no game in progress');
    if (this.module.isRoundOver(this.game)) return err('round is over');
    if (this.paused) return ok(null);
    this.paused = true;
    if (this.deadline !== null) this.pausedRemainingMs = Math.max(this.deadline - Date.now(), 0);
    this.clearTimer();
    this.clearBotTimers();
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
    this.scheduleBotMoves();
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
    const { state, events } = this.module.startRound(
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
    if (!this.module.validateAction(action)) return err('invalid action');
    const res = this.module.applyAction(this.game, player.seat, action);
    if (!res.ok) return err(res.error);
    this.afterEngineStep(res.events);
    return ok(null);
  }

  private onDeadline(): void {
    this.timer = null;
    if (!this.game || this.module.isRoundOver(this.game)) return;
    const events = this.module.applyTimeout(this.game);
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
    this.scheduleBotMoves();
    if (this.game && this.module.isRoundOver(this.game)) this.broadcastLobby();
  }

  // ── bots ──────────────────────────────────────────────────────────────────

  /** (Re)arm think timers for every bot that currently owes a move. */
  private scheduleBotMoves(): void {
    const game = this.game;
    const due = new Map<string, { bot: RoomPlayer; kind: string; fast: boolean }>();
    if (game && this.phase === 'playing' && !this.paused && !this.module.isRoundOver(game)) {
      for (const { seat, kind, fast } of this.module.pendingSeats(game)) {
        const bot = this.players[seat];
        if (bot?.isBot) due.set(`${kind}:${seat}`, { bot, kind, fast });
      }
    }
    for (const [key, timer] of this.botTimers) {
      if (!due.has(key)) {
        clearTimeout(timer);
        this.botTimers.delete(key);
      }
    }
    for (const [key, { bot, kind, fast }] of due) {
      if (this.botTimers.has(key)) continue;
      const timer = setTimeout(() => {
        this.botTimers.delete(key);
        this.runBotMove(bot);
      }, this.module.botDelayMs(bot.botDifficulty!, kind, fast));
      this.botTimers.set(key, timer);
    }
  }

  private runBotMove(bot: RoomPlayer): void {
    const game = this.game;
    if (!game || this.phase !== 'playing' || this.paused) return;
    // Re-check the bot still owes a move — the state may have changed.
    if (!this.module.pendingSeats(game).some((p) => p.seat === bot.seat)) return;

    let action: unknown;
    try {
      action = this.module.chooseAction(game, bot.seat, bot.botDifficulty!);
    } catch {
      action = this.module.fallbackAction(game, bot.seat);
    }
    let res = this.module.applyAction(game, bot.seat, action);
    if (!res.ok) res = this.module.applyAction(game, bot.seat, this.module.fallbackAction(game, bot.seat));
    if (!res.ok) return; // the deadline timer will unstick the game
    this.afterEngineStep(res.events);
  }

  private clearBotTimers(): void {
    for (const timer of this.botTimers.values()) clearTimeout(timer);
    this.botTimers.clear();
  }

  /** Disconnected players never hold up a claim window. */
  private settleDisconnectedClaims(events: GameEvent[]): void {
    const game = this.game;
    if (!game) return;
    events.push(...this.module.settleDisconnected(game, (seat) => !!this.players[seat]?.connected));
  }

  private armDeadline(): void {
    this.clearTimer();
    const game = this.game;
    if (!game || this.module.isRoundOver(game) || this.paused) return;
    let hint = this.module.deadlineHintMs(game);
    const awaiting = this.module.awaitingSeat(game);
    if (awaiting !== null && !this.players[awaiting]?.connected) {
      hint = hint === null ? this.module.turnGraceMs : Math.min(hint, this.module.turnGraceMs);
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
      p.socket.emit('game:state', this.module.redactFor(game, p.seat, meta, this.deadline, this.paused));
    }
  }

  private seatMeta(): SeatMeta[] {
    return this.players.map((p) => ({
      nickname: p.nickname,
      connected: p.connected,
      isHost: p.token === this.hostToken,
      isBot: p.isBot,
      wins: p.wins,
    }));
  }

  lobbyState(yourSeat: number): LobbyState {
    return {
      roomCode: this.code,
      gameId: this.module.id as GameId,
      phase: this.phase,
      players: this.players.map((p) => ({
        seat: p.seat,
        nickname: p.nickname,
        connected: p.connected,
        isHost: p.token === this.hostToken,
        isBot: p.isBot,
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
        this.hostToken = this.players.find((p) => !p.isBot)?.token ?? null;
      }
      this.broadcastLobby();
    }
  }

  /** Bots don't keep a room alive: only human presence counts. */
  isAbandoned(now: number): boolean {
    const humans = this.players.filter((p) => !p.isBot);
    if (humans.length === 0) return true;
    return humans.every(
      (p) => !p.connected && now - (p.disconnectedAt ?? now) > ROOM_ABANDON_MS,
    );
  }

  close(reason: string): void {
    this.clearTimer();
    this.clearBotTimers();
    for (const p of this.players) p.socket?.emit('room:closed', reason);
    this.players = [];
  }
}
