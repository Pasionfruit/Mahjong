import { describe, expect, it } from 'vitest';
import { DEFAULT_UTTT_SETTINGS } from '@shared/uttt';
import { autoMove, isLegal, legalMoves, markOf, newGame, place } from './engine';
import { utttModule as m } from './index';
import { chooseUtttMove } from './bot';

const settings = () => ({ ...DEFAULT_UTTT_SETTINGS, turnTimerSeconds: 0 as const });

describe('uttt engine', () => {
  it('starts with X on the move and no forced board', () => {
    const s = newGame(0, settings());
    expect(markOf(s, 0)).toBe('X');
    expect(markOf(s, 1)).toBe('O');
    expect(s.turnSeat).toBe(0);
    expect(s.activeBoard).toBe(null);
    expect(s.over).toBe(false);
  });

  it('a move forces the opponent into the board named by the cell', () => {
    const s = newGame(0, settings());
    expect(place(s, 0, 4, 2).ok).toBe(true);
    expect(s.activeBoard).toBe(2); // cell 2 → board 2
    expect(s.turnSeat).toBe(1);
    expect(s.lastMove).toEqual({ board: 4, cell: 2 });
  });

  it('rejects wrong turn and off-board moves', () => {
    const s = newGame(0, settings());
    place(s, 0, 4, 2); // now O must play board 2
    expect(place(s, 0, 2, 0).ok).toBe(false); // not your turn
    expect(isLegal(s, 3, 0)).toBe(false); // wrong board (forced to 2)
    expect(isLegal(s, 2, 0)).toBe(true);
  });

  it('captures a small board on three in a row', () => {
    const s = newGame(0, settings());
    s.boards[0] = ['X', 'X', null, 'O', 'O', null, null, null, null];
    s.activeBoard = 0;
    expect(place(s, 0, 0, 2).ok).toBe(true);
    expect(s.boardResults[0]).toBe('X');
  });

  it('a decided target board frees the opponent to play anywhere', () => {
    const s = newGame(0, settings());
    s.boardResults[5] = 'X';
    s.activeBoard = null;
    place(s, 0, 1, 5); // sends to board 5, which is already decided
    expect(s.activeBoard).toBe(null);
  });

  it('wins the game on a meta-line of three boards', () => {
    const s = newGame(0, settings());
    s.boardResults[0] = 'X';
    s.boardResults[1] = 'X';
    s.boards[2] = ['X', 'X', null, 'O', 'O', null, null, null, null];
    s.activeBoard = 2;
    const res = place(s, 0, 2, 2);
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.result).toEqual({ winnerSeat: 0, line: [0, 1, 2] });
    if (res.ok) expect(res.events.some((e) => e.t === 'win')).toBe(true);
  });

  it('auto-moves on timeout and passes the turn', () => {
    const s = newGame(0, settings());
    const before = legalMoves(s).length;
    const events = autoMove(s);
    expect(events[0]).toEqual({ t: 'timeout', seat: 0 });
    expect(s.turnSeat).toBe(1);
    expect(legalMoves(s).length).toBeLessThan(before);
  });
});

describe('uttt module', () => {
  it('validates place actions only', () => {
    expect(m.validateAction({ t: 'place', board: 0, cell: 0 })).toBe(true);
    expect(m.validateAction({ t: 'place' })).toBe(false);
    expect(m.validateAction({ t: 'discard', tileId: 1 })).toBe(false);
    expect(m.validateAction(null)).toBe(false);
  });

  it('reports the mover as pending and ends when over', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 0);
    expect(m.isRoundOver(state)).toBe(false);
    expect(m.pendingSeats(state)).toEqual([{ seat: 0, kind: 'turn', fast: false }]);
    expect(m.awaitingSeat(state)).toBe(0);
  });

  it('redacts a per-seat view', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 0);
    const seats = [
      { nickname: 'A', connected: true, isHost: true, wins: 0 },
      { nickname: 'B', connected: true, isHost: false, wins: 0 },
    ];
    const v = m.redactFor(state, 1, seats, null, false);
    expect(v.g).toBe('uttt');
    if (v.g === 'uttt') {
      expect(v.yourMark).toBe('O');
      expect(v.boards).toHaveLength(9);
      expect(v.players[0]!.mark).toBe('X');
    }
  });

  it('the bot always returns a legal move', () => {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      const { state } = m.startRound(settings(), 2, 0, 1, 0);
      const a = chooseUtttMove(state as never, 0, diff);
      expect(isLegal(state as never, a.board, a.cell)).toBe(true);
    }
  });
});
