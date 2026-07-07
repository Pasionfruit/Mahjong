import type { Tile, TileKind } from './tiles';
import type { GameSettings } from './settings';

export type MeldType = 'pong' | 'chow' | 'kongExposed' | 'kongConcealed' | 'kongAdded';

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  /** Seat the claimed tile came from (pong/chow/kongExposed). */
  claimedFromSeat?: number;
}

/** A meld as another player sees it: concealed-kong tiles are masked (null = face-down). */
export interface MeldView {
  type: MeldType;
  tiles: (Tile | null)[];
  claimedFromSeat?: number;
}

export interface PublicPlayer {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isDealer: boolean;
  handCount: number;
  /** Present only in open-hands mode (your own hand is in ClientGameView.hand). */
  hand?: Tile[];
  melds: MeldView[];
  flowers: Tile[];
  discards: Tile[];
  wins: number;
}

export type GamePhase = 'awaitingDiscard' | 'claimWindow' | 'roundOver';

export interface YourOptions {
  canDiscard: boolean;
  canWinSelfDraw: boolean;
  /** Kinds you hold 4 of (concealed kong available on your turn). */
  concealedKongKinds: TileKind[];
  /** Tile ids in your hand that would upgrade one of your pongs to a kong. */
  addedKongTileIds: number[];
  /** Non-null while a claim window is open and you have at least one claim. */
  claim: {
    win: boolean;
    pong: boolean;
    kong: boolean;
    /** Each entry is the two hand tiles that complete a run with the discard. */
    chows: [Tile, Tile][];
  } | null;
}

export interface RoundResult {
  type: 'win' | 'wallExhausted';
  winnerSeat?: number;
  /** Winner's full concealed hand including the winning tile. */
  winningHand?: Tile[];
  winningTile?: Tile;
  by?: 'discard' | 'selfDraw';
  /** Discarder's seat when won by discard. */
  fromSeat?: number;
}

export interface ClientGameView {
  yourSeat: number;
  hand: Tile[];
  drawnTileId: number | null;
  players: PublicPlayer[];
  wallCount: number;
  turnSeat: number;
  phase: GamePhase;
  /** Epoch ms; null when no deadline is armed. */
  deadline: number | null;
  lastDiscard: { seat: number; tile: Tile } | null;
  /** Every live discard this round, oldest first; claimed tiles are removed. */
  discardPile: { seat: number; tile: Tile }[];
  paused: boolean;
  yourOptions: YourOptions;
  settings: GameSettings;
  /** Resolved N for this game (settings.setsToWin may be null = auto). */
  setsToWin: number;
  round: number;
  result: RoundResult | null;
}

export interface LobbyPlayer {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  wins: number;
}

export interface LobbyState {
  roomCode: string;
  phase: 'lobby' | 'playing';
  players: LobbyPlayer[];
  settings: GameSettings;
  round: number;
  /** The seat of the player this state was sent to. */
  yourSeat: number;
}

export type GameEvent =
  | { t: 'roundStart'; round: number; dealerSeat: number }
  | { t: 'draw'; seat: number }
  | { t: 'discard'; seat: number; tile: Tile }
  | { t: 'claim'; seat: number; claim: 'pong' | 'chow' | 'kong'; tiles: Tile[] }
  | { t: 'concealedKong'; seat: number }
  | { t: 'addedKong'; seat: number; tile: Tile }
  | { t: 'flower'; seat: number; tile: Tile }
  | { t: 'win'; seat: number; by: 'discard' | 'selfDraw' }
  | { t: 'timeout'; seat: number }
  | { t: 'wallExhausted' };
