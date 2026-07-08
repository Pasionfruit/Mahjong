import type { Tile } from '@shared/tiles';
import { canKongFromHand, canPong, chowOptions } from './melds';
import { isWinningHand } from './win';
import type { EnginePlayer } from './game';

export interface ClaimOptions {
  win: boolean;
  pong: boolean;
  kong: boolean;
  chows: [Tile, Tile][];
}

export type ClaimResponse =
  | { r: 'pass' }
  | { r: 'win' }
  | { r: 'pong' }
  | { r: 'kong' }
  | { r: 'chow'; tileIds: [number, number] };

/** Which seats can claim the discard, and how. Chow is only for the next seat. */
export function computeClaimOptions(
  players: EnginePlayer[],
  discarderSeat: number,
  tile: Tile,
  setsToWin: number,
): Map<number, ClaimOptions> {
  const n = players.length;
  const out = new Map<number, ClaimOptions>();
  for (const p of players) {
    if (p.seat === discarderSeat) continue;
    const isNext = p.seat === (discarderSeat + 1) % n;
    const kinds = p.hand.map((t) => t.kind);
    const opts: ClaimOptions = {
      win: isWinningHand([...kinds, tile.kind], p.melds.length, setsToWin),
      pong: canPong(p.hand, tile.kind),
      kong: canKongFromHand(p.hand, tile.kind),
      chows: isNext ? chowOptions(p.hand, tile.kind) : [],
    };
    if (opts.win || opts.pong || opts.kong || opts.chows.length > 0) {
      out.set(p.seat, opts);
    }
  }
  return out;
}

/**
 * Resolve the claim window: a win always takes the tile (first win response on
 * a tie), otherwise the first pong/kong/chow response wins the race — clicking
 * speed decides between competing claims. A non-win claim is only granted once
 * no win-eligible seat is still pending, so a slow "Win!" is never stolen.
 */
export function decideClaims(
  eligible: Map<number, ClaimOptions>,
  responses: Map<number, ClaimResponse>,
): { decided: false } | { decided: true; claim: { seat: number; response: ClaimResponse } | null } {
  // Map iteration preserves insertion order, i.e. the order the clicks arrived.
  for (const [seat, response] of responses) {
    if (response.r === 'win') return { decided: true, claim: { seat, response } };
  }

  let first: { seat: number; response: ClaimResponse } | null = null;
  for (const [seat, response] of responses) {
    if (response.r !== 'pass') {
      first = { seat, response };
      break;
    }
  }

  for (const [seat, opts] of eligible) {
    if (responses.has(seat)) continue;
    if (opts.win) return { decided: false };
    if (!first) return { decided: false };
  }

  return { decided: true, claim: first };
}
