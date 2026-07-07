import { sortTiles } from '@shared/tiles';
import { CLAIM_WINDOW_MS } from '@shared/settings';
import type { ClientGameView, Meld, MeldView, PublicPlayer, YourOptions } from '@shared/view';
import { addedKongOptions, concealedKongOptions, type GameState } from './game';
import { isWinningHand } from './win';

export interface SeatMeta {
  nickname: string;
  connected: boolean;
  isHost: boolean;
  wins: number;
}

const NO_OPTIONS: YourOptions = {
  canDiscard: false,
  canWinSelfDraw: false,
  concealedKongKinds: [],
  addedKongTileIds: [],
  claim: null,
};

function meldView(meld: Meld, revealed: boolean): MeldView {
  const hidden = meld.type === 'kongConcealed' && !revealed;
  return {
    type: meld.type,
    tiles: hidden ? meld.tiles.map(() => null) : [...meld.tiles],
    claimedFromSeat: meld.claimedFromSeat,
  };
}

/** Build the game snapshot one seat is allowed to see. */
export function redactFor(
  state: GameState,
  viewerSeat: number,
  seats: SeatMeta[],
  deadline: number | null,
  paused = false,
): ClientGameView {
  const roundOver = state.phase.t === 'roundOver';
  const revealAll = state.settings.openHands || roundOver;
  const viewer = state.players[viewerSeat]!;

  const players: PublicPlayer[] = state.players.map((p) => {
    const meta = seats[p.seat]!;
    const revealed = revealAll || p.seat === viewerSeat;
    return {
      seat: p.seat,
      nickname: meta.nickname,
      connected: meta.connected,
      isHost: meta.isHost,
      isDealer: p.seat === state.dealerSeat,
      handCount: p.hand.length,
      hand: revealAll ? sortTiles(p.hand) : undefined,
      melds: p.melds.map((m) => meldView(m, revealed)),
      flowers: [...p.flowers],
      discards: [...p.discards],
      wins: meta.wins,
    };
  });

  let yourOptions: YourOptions = NO_OPTIONS;
  const phase = state.phase;
  if (phase.t === 'awaitingDiscard' && phase.seat === viewerSeat) {
    yourOptions = {
      canDiscard: true,
      canWinSelfDraw: isWinningHand(
        viewer.hand.map((t) => t.kind),
        viewer.melds.length,
        state.setsToWin,
      ),
      concealedKongKinds: concealedKongOptions(state, viewerSeat),
      addedKongTileIds: addedKongOptions(state, viewerSeat),
      claim: null,
    };
  } else if (
    phase.t === 'claimWindow' &&
    phase.eligible.has(viewerSeat) &&
    !phase.responses.has(viewerSeat)
  ) {
    const opts = phase.eligible.get(viewerSeat)!;
    yourOptions = {
      ...NO_OPTIONS,
      claim: {
        win: opts.win,
        pong: opts.pong,
        kong: opts.kong && state.wall.length > 0,
        chows: opts.chows.map((pair) => [...pair] as [typeof pair[0], typeof pair[1]]),
      },
    };
  }

  return {
    yourSeat: viewerSeat,
    hand: sortTiles(viewer.hand),
    drawnTileId:
      phase.t === 'awaitingDiscard' && phase.seat === viewerSeat ? phase.drawnTileId : null,
    players,
    wallCount: state.wall.length,
    turnSeat: state.turnSeat,
    phase: phase.t,
    deadline,
    lastDiscard: state.lastDiscard,
    discardPile: state.discardPile.map((d) => ({ seat: d.seat, tile: d.tile })),
    paused,
    yourOptions,
    settings: state.settings,
    setsToWin: state.setsToWin,
    round: state.round,
    result: phase.t === 'roundOver' ? phase.result : null,
  };
}

/** How long the room should arm its deadline for the current phase (ms), or null. */
export function deadlineHintMs(state: GameState): number | null {
  switch (state.phase.t) {
    case 'awaitingDiscard':
      return state.settings.turnTimerSeconds > 0 ? state.settings.turnTimerSeconds * 1000 : null;
    case 'claimWindow':
      return CLAIM_WINDOW_MS;
    case 'roundOver':
      return null;
  }
}
