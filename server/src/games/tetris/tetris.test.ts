import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TETRIS_SETTINGS,
  PIECE_CELLS,
  PIECE_KINDS,
  TETRIS_H,
  TETRIS_W,
  gravityMs,
  gravityTicks,
  levelForLines,
  type TetrisSettings,
} from '@shared/tetris';
import { applyTetrisInput, newTetrisGame, tetrisTick, type TetrisState } from './engine';
import { tetrisModule as m } from './index';

function settings(patch: Partial<TetrisSettings> = {}): TetrisSettings {
  return { ...DEFAULT_TETRIS_SETTINGS, ...patch };
}

function newGame(players = 1, patch: Partial<TetrisSettings> = {}, seed = 7): TetrisState {
  return newTetrisGame(settings(patch), players, 1, seed);
}

/** Run ticks until the player's current piece has locked (active id changes). */
function tickUntilLock(s: TetrisState, seat = 0, cap = 2000): void {
  const before = s.players[seat]!.bagIndex;
  for (let i = 0; i < cap; i++) {
    tetrisTick(s);
    if (s.players[seat]!.bagIndex !== before || !s.players[seat]!.alive) return;
  }
  throw new Error('piece never locked');
}

/** Fill a full row except the given holes (row index from the top). */
function fillRow(s: TetrisState, seat: number, row: number, holes: number[] = []): void {
  for (let c = 0; c < TETRIS_W; c++) {
    s.players[seat]!.grid[row * TETRIS_W + c] = holes.includes(c) ? 0 : 8;
  }
}

describe('piece definitions', () => {
  it('all 7 classic shapes: 4 cells per rotation, inside the 4×4 box', () => {
    for (const kind of PIECE_KINDS) {
      for (const rot of PIECE_CELLS[kind]) {
        expect(rot).toHaveLength(4);
        for (const [x, y] of rot) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(4);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(4);
        }
        // no duplicate cells
        expect(new Set(rot.map(([x, y]) => x * 4 + y)).size).toBe(4);
      }
    }
  });
});

describe('speed curve', () => {
  it('ramps proportionally from level 1 to 20', () => {
    expect(gravityMs(1)).toBe(800);
    expect(gravityMs(20)).toBe(50);
    // halfway-ish level sits halfway-ish in speed
    const mid = gravityMs(10);
    expect(mid).toBeLessThan(800);
    expect(mid).toBeGreaterThan(50);
    for (let l = 2; l <= 20; l++) {
      expect(gravityMs(l)).toBeLessThan(gravityMs(l - 1));
    }
  });

  it('every level past 20 keeps the level-20 speed', () => {
    for (const l of [21, 25, 30, 99]) {
      expect(gravityMs(l)).toBe(gravityMs(20));
      expect(gravityTicks(l)).toBe(gravityTicks(20));
    }
  });

  it('level rises every 10 lines from the starting level', () => {
    expect(levelForLines(0, 1)).toBe(1);
    expect(levelForLines(9, 1)).toBe(1);
    expect(levelForLines(10, 1)).toBe(2);
    expect(levelForLines(35, 5)).toBe(8);
  });
});

describe('movement & gravity', () => {
  it('spawns everyone with the same first piece (shared bag)', () => {
    const s = newGame(4);
    const kinds = s.players.map((p) => p.active!.kind);
    expect(new Set(kinds).size).toBe(1);
  });

  it('gravity pulls the piece down on schedule', () => {
    const s = newGame(1, { startLevel: 1 });
    const y0 = s.players[0]!.active!.y;
    for (let i = 0; i < gravityTicks(1); i++) tetrisTick(s);
    expect(s.players[0]!.active!.y).toBe(y0 + 1);
  });

  it('left/right respect the walls', () => {
    const s = newGame(1);
    const p = s.players[0]!;
    for (let i = 0; i < 20; i++) applyTetrisInput(s, 0, 'left');
    const leftmost = Math.min(...PIECE_CELLS[PIECE_KINDS[p.active!.kind]!][p.active!.rot]!.map(([x]) => x));
    expect(p.active!.x + leftmost).toBe(0);
    for (let i = 0; i < 20; i++) applyTetrisInput(s, 0, 'right');
    const cells = PIECE_CELLS[PIECE_KINDS[p.active!.kind]!][p.active!.rot]!;
    const rightmost = Math.max(...cells.map(([x]) => x));
    expect(p.active!.x + rightmost).toBe(TETRIS_W - 1);
  });

  it('rotation cycles through 4 states with wall kicks near edges', () => {
    const s = newGame(1);
    const p = s.players[0]!;
    const rot0 = p.active!.rot;
    applyTetrisInput(s, 0, 'cw');
    expect(p.active!.rot).toBe((rot0 + 1) & 3);
    // Shove against the left wall, rotation must still succeed via a kick.
    for (let i = 0; i < 20; i++) applyTetrisInput(s, 0, 'left');
    const rotBefore = p.active!.rot;
    applyTetrisInput(s, 0, 'cw');
    expect(p.active!.rot).toBe((rotBefore + 1) & 3);
  });

  it('hard drop locks instantly and scores 2 per cell', () => {
    const s = newGame(1);
    const p = s.players[0]!;
    const bagBefore = p.bagIndex;
    const yBefore = p.active!.y;
    applyTetrisInput(s, 0, 'hard');
    expect(p.bagIndex).toBe(bagBefore + 1); // next piece spawned
    expect(p.score).toBeGreaterThanOrEqual((TETRIS_H - 4 - yBefore) * 2 - 8);
  });

  it('soft drop moves one row and scores 1', () => {
    const s = newGame(1);
    const p = s.players[0]!;
    const y = p.active!.y;
    applyTetrisInput(s, 0, 'soft');
    expect(p.active!.y).toBe(y + 1);
    expect(p.score).toBe(1);
  });

  it('a grounded piece locks after the lock delay', () => {
    const s = newGame(1);
    tickUntilLock(s);
    const settled = [...s.players[0]!.grid].filter((v) => v !== 0).length;
    expect(settled).toBe(4);
  });
});

describe('store / trade (hold)', () => {
  it('stores the current piece, then trades it back, once per drop', () => {
    const s = newGame(1);
    const p = s.players[0]!;
    const first = p.active!.kind;
    applyTetrisInput(s, 0, 'hold'); // store
    expect(p.hold).toBe(first);
    const second = p.active!.kind;
    expect(p.holdUsed).toBe(true);
    // A second hold before locking is ignored.
    applyTetrisInput(s, 0, 'hold');
    expect(p.hold).toBe(first);
    expect(p.active!.kind).toBe(second);
    // After locking, trading swaps current with stored.
    applyTetrisInput(s, 0, 'hard');
    const current = p.active!.kind;
    applyTetrisInput(s, 0, 'hold'); // trade
    expect(p.active!.kind).toBe(first);
    expect(p.hold).toBe(current);
  });
});

describe('line clears, scoring, garbage', () => {
  it('clears a completed row and scores by level', () => {
    const s = newGame(1, { startLevel: 5 });
    const p = s.players[0]!;
    // Bottom row missing only the column where a vertical I will land.
    fillRow(s, 0, TETRIS_H - 1, [0]);
    p.active = { kind: 0, rot: 1, x: -2, y: 0 }; // vertical I in column 0
    applyTetrisInput(s, 0, 'hard');
    expect(p.lines).toBe(1);
    expect(p.score).toBeGreaterThanOrEqual(100 * 5);
    // The row is gone; only the I remnants remain.
    const bottom = [...p.grid.slice((TETRIS_H - 1) * TETRIS_W)];
    expect(bottom.filter((v) => v !== 0)).toHaveLength(1);
  });

  it('multi-line clears send garbage to every living opponent', () => {
    const s = newGame(3);
    const p = s.players[0]!;
    // Four bottom rows complete except column 0 → vertical I = tetris.
    for (let r = TETRIS_H - 4; r < TETRIS_H; r++) fillRow(s, 0, r, [0]);
    p.active = { kind: 0, rot: 1, x: -2, y: 0 };
    const events = applyTetrisInput(s, 0, 'hard');
    expect(events.some((e) => e.t === 'lines' && e.count === 4)).toBe(true);
    expect(s.players[1]!.pendingGarbage).toBe(4);
    expect(s.players[2]!.pendingGarbage).toBe(4);
    expect(p.pendingGarbage).toBe(0);
  });

  it('queued garbage arrives when the victim locks, with one hole', () => {
    const s = newGame(2);
    const victim = s.players[1]!;
    victim.pendingGarbage = 2;
    applyTetrisInput(s, 1, 'hard');
    let garbageCells = 0;
    for (let r = TETRIS_H - 2; r < TETRIS_H; r++) {
      for (let c = 0; c < TETRIS_W; c++) {
        if (victim.grid[r * TETRIS_W + c] === 8) garbageCells++;
      }
    }
    expect(garbageCells).toBe(2 * (TETRIS_W - 1));
    expect(victim.pendingGarbage).toBe(0);
  });

  it('garbage can be disabled by the host', () => {
    const s = newGame(2, { garbage: false });
    const p = s.players[0]!;
    for (let r = TETRIS_H - 2; r < TETRIS_H; r++) fillRow(s, 0, r, [0]);
    p.active = { kind: 0, rot: 1, x: -2, y: 0 };
    applyTetrisInput(s, 0, 'hard');
    expect(s.players[1]!.pendingGarbage).toBe(0);
  });
});

describe('top-out & versus flow', () => {
  function topOut(s: TetrisState, seat: number): void {
    const p = s.players[seat]!;
    for (let r = 0; r < 4; r++) fillRow(s, seat, r, [9]);
    applyTetrisInput(s, seat, 'hard');
    if (p.alive) {
      // Whatever spawns next collides with the ceiling stack quickly.
      for (let i = 0; i < 40 && p.alive; i++) applyTetrisInput(s, seat, 'hard');
    }
    expect(p.alive).toBe(false);
  }

  it('solo: game ends on top-out with no winner', () => {
    const s = newGame(1);
    topOut(s, 0);
    expect(s.over).toBe(true);
    expect(s.winnerSeat).toBeNull();
    expect(m.isRoundOver(s)).toBe(true);
  });

  it('versus: last player standing wins', () => {
    const s = newGame(3);
    topOut(s, 1);
    expect(s.over).toBe(false);
    topOut(s, 2);
    expect(s.over).toBe(true);
    expect(s.winnerSeat).toBe(0);
  });

  it('dead players stop ticking; the survivors keep playing', () => {
    const s = newGame(3); // with 2 players a single top-out ends the game
    topOut(s, 1);
    expect(s.over).toBe(false);
    const p0 = s.players[0]!;
    expect(p0.alive).toBe(true);
    const y = p0.active!.y;
    for (let i = 0; i < gravityTicks(p0.level); i++) tetrisTick(s);
    expect(p0.active!.y).toBe(y + 1);
    expect(s.players[1]!.active).toBeNull(); // the dead board stays frozen
  });
});

describe('module wiring', () => {
  it('validates actions structurally', () => {
    expect(m.validateAction({ t: 'tetris', op: 'left' })).toBe(true);
    expect(m.validateAction({ t: 'tetris', op: 'hold' })).toBe(true);
    expect(m.validateAction({ t: 'tetris', op: 'up' })).toBe(false);
    expect(m.validateAction({ t: 'bomb' })).toBe(false);
    expect(m.validateAction(null)).toBe(false);
  });

  it('movement is silent (tick broadcasts); locks broadcast immediately', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 5);
    const move = m.applyAction(state, 0, { t: 'tetris', op: 'left' });
    expect(move.ok && move.sync).toBe('none');
    const drop = m.applyAction(state, 0, { t: 'tetris', op: 'hard' });
    // A plain lock has no events → also silent until the next tick…
    expect(drop.ok).toBe(true);
    // …but the tick right after reports the change.
    const beat = m.tick!(state);
    expect(beat.changed).toBe(true);
  });

  it('redacts a public per-seat view', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 5);
    const seats = [
      { nickname: 'A', connected: true, isHost: true, wins: 0 },
      { nickname: 'B', connected: true, isHost: false, wins: 0 },
    ];
    const v = m.redactFor(state, 1, seats, null, false);
    expect(v.g).toBe('tetris');
    if (v.g === 'tetris') {
      expect(v.players).toHaveLength(2);
      expect(v.players[0]!.grid).toHaveLength(TETRIS_H);
      expect(v.players[0]!.grid[0]).toHaveLength(TETRIS_W);
      expect(v.players[0]!.next).toHaveLength(3);
      expect(v.players[0]!.active).not.toBeNull();
      expect(v.result).toBeNull();
    }
  });

  it('rejects junk settings and accepts valid ones', () => {
    expect(m.sanitizeSettings(settings(), { startLevel: 3 })).toBeNull();
    expect(m.sanitizeSettings(settings(), { startLevel: 15 })).not.toBeNull();
    expect(m.sanitizeSettings(settings(), { garbage: 'yes' })).toBeNull();
  });
});
