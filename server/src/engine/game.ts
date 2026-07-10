import type { GameSettings } from '@shared/settings';
import { handSize, resolveSetsToWin } from '@shared/settings';
import { isFlower, sortTiles, type Tile, type TileKind } from '@shared/tiles';
import type { GameEvent, Meld, RoundResult } from '@shared/view';
import type { PlayerAction } from '@shared/protocol';
import { drawBack, drawFront, shuffledWall } from './wall';
import {
  computeClaimOptions,
  decideClaims,
  type ClaimOptions,
  type ClaimResponse,
} from './claims';
import { tilesOfKind } from './melds';
import { isWinningHand } from './win';

export interface EnginePlayer {
  seat: number;
  hand: Tile[];
  melds: Meld[];
  flowers: Tile[];
  discards: Tile[];
}

export type Phase =
  | { t: 'awaitingDiscard'; seat: number; drawnTileId: number | null }
  | {
      t: 'claimWindow';
      discarderSeat: number;
      tile: Tile;
      eligible: Map<number, ClaimOptions>;
      responses: Map<number, ClaimResponse>;
    }
  | { t: 'roundOver'; result: RoundResult };

export interface GameState {
  settings: GameSettings;
  setsToWin: number;
  playerCount: number;
  players: EnginePlayer[];
  wall: Tile[];
  dealerSeat: number;
  round: number;
  turnSeat: number;
  phase: Phase;
  lastDiscard: { seat: number; tile: Tile } | null;
  discardPile: { seat: number; tile: Tile }[];
}

export type ApplyResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export function startRound(
  settings: GameSettings,
  playerCount: number,
  dealerSeat: number,
  round: number,
  seed: number,
): { state: GameState; events: GameEvent[] } {
  return startRoundWithWall(
    settings,
    playerCount,
    dealerSeat,
    round,
    shuffledWall(settings.includeFlowers, seed, settings.includeHonors),
  );
}

/**
 * Deal from an explicit wall (front of the array is the front of the wall).
 * Each seat, in order from the dealer, takes a consecutive block of 3N+1 tiles.
 */
export function startRoundWithWall(
  settings: GameSettings,
  playerCount: number,
  dealerSeat: number,
  round: number,
  wall: Tile[],
): { state: GameState; events: GameEvent[] } {
  const setsToWin = resolveSetsToWin(settings, playerCount);
  const events: GameEvent[] = [{ t: 'roundStart', round, dealerSeat }];
  const players: EnginePlayer[] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    players.push({ seat, hand: [], melds: [], flowers: [], discards: [] });
  }
  const state: GameState = {
    settings,
    setsToWin,
    playerCount,
    players,
    wall,
    dealerSeat,
    round,
    turnSeat: dealerSeat,
    phase: { t: 'awaitingDiscard', seat: dealerSeat, drawnTileId: null },
    lastDiscard: null,
    discardPile: [],
  };

  const perHand = handSize(setsToWin);
  for (let i = 0; i < playerCount; i++) {
    const p = state.players[(dealerSeat + i) % playerCount]!;
    for (let j = 0; j < perHand; j++) {
      const t = drawFront(wall);
      if (!t) throw new Error('wall too small for deal');
      p.hand.push(t);
    }
  }
  for (let i = 0; i < playerCount; i++) {
    const p = state.players[(dealerSeat + i) % playerCount]!;
    if (!replaceFlowers(state, p, events)) return { state, events };
  }
  beginTurn(state, dealerSeat, events);
  return { state, events };
}

/** Move any flowers out of the hand, drawing replacements from the back. */
function replaceFlowers(state: GameState, p: EnginePlayer, events: GameEvent[]): boolean {
  for (let i = 0; i < p.hand.length; ) {
    const t = p.hand[i]!;
    if (!isFlower(t.kind)) {
      i++;
      continue;
    }
    p.hand.splice(i, 1);
    p.flowers.push(t);
    events.push({ t: 'flower', seat: p.seat, tile: t });
    const replacement = drawBack(state.wall);
    if (!replacement) {
      endRoundDrawn(state, events);
      return false;
    }
    p.hand.push(replacement);
  }
  return true;
}

function beginTurn(state: GameState, seat: number, events: GameEvent[]): void {
  drawInto(state, seat, 'front', events);
}

function drawReplacement(state: GameState, seat: number, events: GameEvent[]): void {
  drawInto(state, seat, 'back', events);
}

function drawInto(state: GameState, seat: number, from: 'front' | 'back', events: GameEvent[]): void {
  const p = state.players[seat]!;
  let drawn = from === 'front' ? drawFront(state.wall) : drawBack(state.wall);
  if (!drawn) return endRoundDrawn(state, events);
  while (isFlower(drawn.kind)) {
    p.flowers.push(drawn);
    events.push({ t: 'flower', seat, tile: drawn });
    drawn = drawBack(state.wall);
    if (!drawn) return endRoundDrawn(state, events);
  }
  p.hand.push(drawn);
  state.turnSeat = seat;
  state.phase = { t: 'awaitingDiscard', seat, drawnTileId: drawn.id };
  events.push({ t: 'draw', seat });
}

function endRoundDrawn(state: GameState, events: GameEvent[]): void {
  state.phase = { t: 'roundOver', result: { type: 'wallExhausted' } };
  events.push({ t: 'wallExhausted' });
}

function endRoundWin(
  state: GameState,
  seat: number,
  by: 'discard' | 'selfDraw',
  winningTile: Tile | undefined,
  fromSeat: number | undefined,
  events: GameEvent[],
): void {
  const winner = state.players[seat]!;
  state.phase = {
    t: 'roundOver',
    result: {
      type: 'win',
      winnerSeat: seat,
      winningHand: sortTiles(winner.hand),
      winningTile,
      by,
      fromSeat,
    },
  };
  events.push({ t: 'win', seat, by });
}

export function applyPlayerAction(state: GameState, seat: number, action: PlayerAction): ApplyResult {
  const phase = state.phase;
  const events: GameEvent[] = [];

  if (phase.t === 'roundOver') return { ok: false, error: 'round is over' };

  if (phase.t === 'awaitingDiscard') {
    if (seat !== phase.seat) return { ok: false, error: 'not your turn' };
    const p = state.players[seat]!;

    switch (action.t) {
      case 'discard': {
        const idx = p.hand.findIndex((t) => t.id === action.tileId);
        if (idx === -1) return { ok: false, error: 'tile not in hand' };
        doDiscard(state, seat, idx, events);
        return { ok: true, events };
      }
      case 'concealedKong': {
        const matching = tilesOfKind(p.hand, action.kind);
        if (matching.length < 4) return { ok: false, error: 'need all four tiles' };
        if (state.wall.length === 0) return { ok: false, error: 'wall is empty' };
        const tiles = matching.slice(0, 4);
        p.hand = p.hand.filter((t) => !tiles.includes(t));
        p.melds.push({ type: 'kongConcealed', tiles });
        events.push({ t: 'concealedKong', seat });
        drawReplacement(state, seat, events);
        return { ok: true, events };
      }
      case 'addedKong': {
        const idx = p.hand.findIndex((t) => t.id === action.tileId);
        if (idx === -1) return { ok: false, error: 'tile not in hand' };
        const tile = p.hand[idx]!;
        const pong = p.melds.find((m) => m.type === 'pong' && m.tiles[0]!.kind === tile.kind);
        if (!pong) return { ok: false, error: 'no matching pong' };
        if (state.wall.length === 0) return { ok: false, error: 'wall is empty' };
        p.hand.splice(idx, 1);
        pong.type = 'kongAdded';
        pong.tiles.push(tile);
        events.push({ t: 'addedKong', seat, tile });
        drawReplacement(state, seat, events);
        return { ok: true, events };
      }
      case 'winSelfDraw': {
        const kinds = p.hand.map((t) => t.kind);
        if (!isWinningHand(kinds, p.melds.length, state.setsToWin)) {
          return { ok: false, error: 'not a winning hand' };
        }
        const winningTile = p.hand.find((t) => t.id === phase.drawnTileId);
        endRoundWin(state, seat, 'selfDraw', winningTile, undefined, events);
        return { ok: true, events };
      }
      default:
        return { ok: false, error: 'invalid action for this phase' };
    }
  }

  // claimWindow
  if (action.t !== 'claim' && action.t !== 'pass') {
    return { ok: false, error: 'invalid action for this phase' };
  }
  const opts = phase.eligible.get(seat);
  if (!opts) return { ok: false, error: 'no claim available' };
  const prior = phase.responses.get(seat);
  // A reserved chow may still be finalized (or abandoned); any other response
  // is locked in.
  if (prior && prior.r !== 'chowPending') return { ok: false, error: 'already responded' };

  let response: ClaimResponse;
  if (action.t === 'pass') {
    response = { r: 'pass' };
  } else if (action.claim === 'chowIntent') {
    if (opts.chows.length === 0) return { ok: false, error: 'cannot chow' };
    if (prior) return { ok: false, error: 'already responded' };
    response = { r: 'chowPending' };
  } else if (action.claim === 'chow') {
    const wanted = new Set(action.tileIds);
    const match = opts.chows.find((pair) => pair.every((t) => wanted.has(t.id)));
    if (!match) return { ok: false, error: 'invalid chow' };
    response = { r: 'chow', tileIds: action.tileIds };
  } else if (action.claim === 'win') {
    if (!opts.win) return { ok: false, error: 'cannot win on this tile' };
    response = { r: 'win' };
  } else if (action.claim === 'pong') {
    if (!opts.pong) return { ok: false, error: 'cannot pong' };
    response = { r: 'pong' };
  } else {
    if (!opts.kong) return { ok: false, error: 'cannot kong' };
    if (state.wall.length === 0) return { ok: false, error: 'wall is empty' };
    response = { r: 'kong' };
  }
  phase.responses.set(seat, response);
  maybeResolveClaims(state, events);
  return { ok: true, events };
}

/** Injected by the room when a deadline lapses. */
export function applyTimeout(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const phase = state.phase;

  if (phase.t === 'awaitingDiscard') {
    const p = state.players[phase.seat]!;
    events.push({ t: 'timeout', seat: phase.seat });
    const autoId = phase.drawnTileId ?? p.hand[p.hand.length - 1]!.id;
    const idx = p.hand.findIndex((t) => t.id === autoId);
    doDiscard(state, phase.seat, idx, events);
    return events;
  }

  if (phase.t === 'claimWindow') {
    for (const seat of phase.eligible.keys()) {
      // A reserved-but-unchosen chow forfeits when the window lapses.
      const r = phase.responses.get(seat);
      if (!r || r.r === 'chowPending') phase.responses.set(seat, { r: 'pass' });
    }
    maybeResolveClaims(state, events);
    return events;
  }

  return events;
}

function doDiscard(state: GameState, seat: number, handIndex: number, events: GameEvent[]): void {
  const p = state.players[seat]!;
  const [tile] = p.hand.splice(handIndex, 1);
  p.discards.push(tile!);
  state.lastDiscard = { seat, tile: tile! };
  state.discardPile.push({ seat, tile: tile! });
  events.push({ t: 'discard', seat, tile: tile! });

  const eligible = computeClaimOptions(state.players, seat, tile!, state.setsToWin);
  if (eligible.size === 0) {
    beginTurn(state, (seat + 1) % state.playerCount, events);
  } else {
    state.phase = {
      t: 'claimWindow',
      discarderSeat: seat,
      tile: tile!,
      eligible,
      responses: new Map(),
    };
  }
}

function maybeResolveClaims(state: GameState, events: GameEvent[]): void {
  const phase = state.phase;
  if (phase.t !== 'claimWindow') return;
  const decision = decideClaims(phase.eligible, phase.responses);
  if (!decision.decided) return;

  if (!decision.claim) {
    beginTurn(state, (phase.discarderSeat + 1) % state.playerCount, events);
    return;
  }

  const { seat, response } = decision.claim;
  const claimant = state.players[seat]!;
  const discarder = state.players[phase.discarderSeat]!;
  const tile = phase.tile;
  discarder.discards.pop();
  state.discardPile.pop();
  state.lastDiscard = null;

  switch (response.r) {
    case 'win': {
      claimant.hand.push(tile);
      endRoundWin(state, seat, 'discard', tile, phase.discarderSeat, events);
      return;
    }
    case 'pong': {
      const used = tilesOfKind(claimant.hand, tile.kind).slice(0, 2);
      claimant.hand = claimant.hand.filter((t) => !used.includes(t));
      claimant.melds.push({
        type: 'pong',
        tiles: [...used, tile],
        claimedFromSeat: phase.discarderSeat,
      });
      events.push({ t: 'claim', seat, claim: 'pong', tiles: [...used, tile] });
      state.turnSeat = seat;
      state.phase = { t: 'awaitingDiscard', seat, drawnTileId: null };
      return;
    }
    case 'kong': {
      const used = tilesOfKind(claimant.hand, tile.kind).slice(0, 3);
      claimant.hand = claimant.hand.filter((t) => !used.includes(t));
      claimant.melds.push({
        type: 'kongExposed',
        tiles: [...used, tile],
        claimedFromSeat: phase.discarderSeat,
      });
      events.push({ t: 'claim', seat, claim: 'kong', tiles: [...used, tile] });
      drawReplacement(state, seat, events);
      return;
    }
    case 'chow': {
      const wanted = new Set(response.tileIds);
      const used = claimant.hand.filter((t) => wanted.has(t.id));
      claimant.hand = claimant.hand.filter((t) => !wanted.has(t.id));
      const meldTiles = sortTiles([...used, tile]);
      claimant.melds.push({
        type: 'chow',
        tiles: meldTiles,
        claimedFromSeat: phase.discarderSeat,
      });
      events.push({ t: 'claim', seat, claim: 'chow', tiles: meldTiles });
      state.turnSeat = seat;
      state.phase = { t: 'awaitingDiscard', seat, drawnTileId: null };
      return;
    }
    case 'pass':
      return; // unreachable: decideClaims never returns a pass as the claim
  }
}

/** Kinds the given seat may declare a concealed kong with right now. */
export function concealedKongOptions(state: GameState, seat: number): TileKind[] {
  if (state.phase.t !== 'awaitingDiscard' || state.phase.seat !== seat) return [];
  if (state.wall.length === 0) return [];
  const p = state.players[seat]!;
  const counts = new Map<TileKind, number>();
  for (const t of p.hand) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 4).map(([kind]) => kind);
}

/** Hand tile ids the given seat may extend one of its pongs with right now. */
export function addedKongOptions(state: GameState, seat: number): number[] {
  if (state.phase.t !== 'awaitingDiscard' || state.phase.seat !== seat) return [];
  if (state.wall.length === 0) return [];
  const p = state.players[seat]!;
  const pongKinds = new Set(
    p.melds.filter((m) => m.type === 'pong').map((m) => m.tiles[0]!.kind),
  );
  return p.hand.filter((t) => pongKinds.has(t.kind)).map((t) => t.id);
}
