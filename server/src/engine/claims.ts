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

function priorityOf(r: ClaimResponse): number {
  switch (r.r) {
    case 'win':
      return 3;
    case 'kong':
    case 'pong':
      return 2;
    case 'chow':
      return 1;
    case 'pass':
      return 0;
  }
}

function potentialOf(o: ClaimOptions): number {
  if (o.win) return 3;
  if (o.pong || o.kong) return 2;
  return 1;
}

/**
 * Resolve the claim window as soon as the outcome is decided: the best response
 * so far wins if no still-pending seat could beat it (win > kong/pong > chow;
 * win ties break toward the seat nearest after the discarder).
 */
export function decideClaims(
  eligible: Map<number, ClaimOptions>,
  responses: Map<number, ClaimResponse>,
  discarderSeat: number,
  playerCount: number,
): { decided: false } | { decided: true; claim: { seat: number; response: ClaimResponse } | null } {
  const dist = (seat: number) => (seat - discarderSeat + playerCount) % playerCount;

  let best: { seat: number; response: ClaimResponse; pri: number } | null = null;
  for (const [seat, resp] of responses) {
    const pri = priorityOf(resp);
    if (pri === 0) continue;
    if (!best || pri > best.pri || (pri === best.pri && dist(seat) < dist(best.seat))) {
      best = { seat, response: resp, pri };
    }
  }

  for (const [seat, opts] of eligible) {
    if (responses.has(seat)) continue;
    if (!best) return { decided: false };
    const pot = potentialOf(opts);
    if (pot > best.pri || (pot === best.pri && dist(seat) < dist(best.seat))) {
      return { decided: false };
    }
  }

  return { decided: true, claim: best ? { seat: best.seat, response: best.response } : null };
}
