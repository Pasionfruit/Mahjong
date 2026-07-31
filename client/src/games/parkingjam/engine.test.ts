import { describe, expect, it } from 'vitest';
import {
  EXIT_ROW,
  GRID,
  RED_ID,
  parkingJamModule,
  solveBoard,
  vehicleCells,
  type ParkingJamState,
  type Vehicle,
} from './engine';

function v(id: number, row: number, col: number, len: number, horizontal: boolean): Vehicle {
  return { id, row, col, len, horizontal };
}

function state(vehicles: Vehicle[], moves = 0, optimalMoves = 1): ParkingJamState {
  return { vehicles, moves, optimalMoves };
}

describe('solveBoard', () => {
  it('solves an unobstructed board in one move', () => {
    expect(solveBoard([v(RED_ID, EXIT_ROW, 0, 2, true)])).toBe(1);
  });

  it('finds the known optimum on a tiny hand-built board', () => {
    // Blocker (col 3, rows 1-2) can only clear downward (its up-slide is
    // capped by the car on row 0), then red slides out: exactly 2 moves.
    const board = [
      v(RED_ID, EXIT_ROW, 0, 2, true),
      v(1, 1, 3, 2, false),
      v(2, 0, 3, 2, true),
    ];
    expect(solveBoard(board)).toBe(2);
  });

  it('reports -1 for an unsolvable board', () => {
    // A horizontal car on the exit row can never leave it — permanent wall.
    const board = [v(RED_ID, EXIT_ROW, 0, 2, true), v(1, EXIT_ROW, 4, 2, true)];
    expect(solveBoard(board)).toBe(-1);
  });

  it('returns 0 when the red car already sits at the exit', () => {
    expect(solveBoard([v(RED_ID, EXIT_ROW, 4, 2, true)])).toBe(0);
  });
});

describe('generate', () => {
  it('is deterministic per seed', () => {
    expect(parkingJamModule.generate(42, undefined)).toEqual(parkingJamModule.generate(42, undefined));
  });

  it('always returns a solvable, well-formed board', () => {
    for (const seed of [1, 77, 20260731]) {
      const s = parkingJamModule.generate(seed, undefined);
      const red = s.vehicles.find((veh) => veh.id === RED_ID);
      expect(red).toBeDefined();
      expect(red).toMatchObject({ row: EXIT_ROW, len: 2, horizontal: true });
      expect(parkingJamModule.status(s)).toBe('playing');
      // solver agrees with the stored optimum, and the board is solvable
      expect(s.optimalMoves).toBeGreaterThan(0);
      expect(s.optimalMoves).toBeLessThanOrEqual(24);
      expect(solveBoard(s.vehicles)).toBe(s.optimalMoves);
      // no overlaps, everything in bounds
      const occ = new Set<number>();
      for (const veh of s.vehicles) {
        for (const [r, c] of vehicleCells(veh)) {
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThan(GRID);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThan(GRID);
          const cell = r * GRID + c;
          expect(occ.has(cell)).toBe(false);
          occ.add(cell);
        }
        expect([2, 3]).toContain(veh.len);
        // horizontal non-red vehicles never sit on the exit row
        if (veh.id !== RED_ID && veh.horizontal) expect(veh.row).not.toBe(EXIT_ROW);
      }
      // red + a sensible crowd (9-13 others generated; authored fallback has ≥6)
      expect(s.vehicles.length - 1).toBeGreaterThanOrEqual(6);
      expect(s.vehicles.length - 1).toBeLessThanOrEqual(13);
      expect(s.moves).toBe(0);
    }
  });
});

describe('applyMove (slide legality)', () => {
  const board = [
    v(RED_ID, EXIT_ROW, 0, 2, true),
    v(1, 1, 4, 2, false), // occupies (1,4) and (2,4)
    v(2, 0, 3, 2, true), // occupies (0,3) and (0,4)
  ];

  it('slides any number of free cells as a single move', () => {
    const next = parkingJamModule.applyMove(state(board), { vehicleId: RED_ID, delta: 2 });
    expect(next?.vehicles.find((veh) => veh.id === RED_ID)?.col).toBe(2);
    expect(next?.moves).toBe(1);
  });

  it('rejects slides through an occupied cell', () => {
    // red would sweep (2,4), which the vertical blocker occupies
    expect(parkingJamModule.applyMove(state(board), { vehicleId: RED_ID, delta: 3 })).toBeNull();
  });

  it('rejects slides out of bounds', () => {
    expect(parkingJamModule.applyMove(state(board), { vehicleId: RED_ID, delta: -1 })).toBeNull();
    expect(parkingJamModule.applyMove(state(board), { vehicleId: 1, delta: -2 })).toBeNull(); // (0,4) is occupied anyway, but -2 also exits the top
  });

  it('rejects blocked single steps for the crossing blocker', () => {
    // blocker up 1 → needs (0,4), occupied by the horizontal car
    expect(parkingJamModule.applyMove(state(board), { vehicleId: 1, delta: -1 })).toBeNull();
    // blocker down 2 → rows 3-4, both free
    const next = parkingJamModule.applyMove(state(board), { vehicleId: 1, delta: 2 });
    expect(next?.vehicles.find((veh) => veh.id === 1)?.row).toBe(3);
  });

  it('rejects zero deltas, unknown vehicles, and non-integer deltas', () => {
    expect(parkingJamModule.applyMove(state(board), { vehicleId: RED_ID, delta: 0 })).toBeNull();
    expect(parkingJamModule.applyMove(state(board), { vehicleId: 99, delta: 1 })).toBeNull();
    expect(parkingJamModule.applyMove(state(board), { vehicleId: RED_ID, delta: 1.5 })).toBeNull();
  });

  it('does not mutate the input state', () => {
    const s = state(board);
    const before = JSON.stringify(s);
    parkingJamModule.applyMove(s, { vehicleId: RED_ID, delta: 2 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('win detection', () => {
  it('wins when the red car reaches the right edge, and locks further moves', () => {
    const s = state([v(RED_ID, EXIT_ROW, 3, 2, true)], 7, 3);
    expect(parkingJamModule.status(s)).toBe('playing');
    const next = parkingJamModule.applyMove(s, { vehicleId: RED_ID, delta: 1 });
    expect(next).not.toBeNull();
    expect(parkingJamModule.status(next!)).toBe('won');
    expect(parkingJamModule.result(next!)).toEqual({
      status: 'won',
      score: 8,
      stats: { optimal: 3, moves: 8 },
    });
    expect(parkingJamModule.applyMove(next!, { vehicleId: RED_ID, delta: -1 })).toBeNull();
  });

  it('result is null while still playing', () => {
    expect(parkingJamModule.result(state([v(RED_ID, EXIT_ROW, 0, 2, true)]))).toBeNull();
  });
});

describe('replay', () => {
  it('reproduces the exact state from a move log on a generated board', () => {
    const seed = 77;
    let s = parkingJamModule.generate(seed, undefined);
    const log: { vehicleId: number; delta: number }[] = [];
    // Take the first few legal single-cell slides found by scanning.
    outer: for (let step = 0; step < 4; step++) {
      for (const veh of s.vehicles) {
        for (const delta of [1, -1]) {
          const next = parkingJamModule.applyMove(s, { vehicleId: veh.id, delta });
          if (next) {
            s = next;
            log.push({ vehicleId: veh.id, delta });
            continue outer;
          }
        }
      }
      break;
    }
    expect(log.length).toBeGreaterThan(0);
    expect(parkingJamModule.replay(seed, undefined, log)).toEqual(s);
  });

  it('skips illegal moves in the log without derailing', () => {
    const fresh = parkingJamModule.generate(5, undefined);
    expect(parkingJamModule.replay(5, undefined, [{ vehicleId: 999, delta: 1 }])).toEqual(fresh);
  });
});

describe('module metadata', () => {
  it('scores ascending under the right id', () => {
    expect(parkingJamModule.id).toBe('parkingjam');
    expect(parkingJamModule.scoreDirection).toBe('asc');
  });
});
