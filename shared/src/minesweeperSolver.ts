/**
 * Shared "is this board solvable without guessing?" check, used by BOTH
 * the solo Brain Arcade Minesweeper and the multiplayer Minefield module —
 * they generate boards independently but must agree on what "no 50/50s"
 * means, so the rule lives here rather than being duplicated per game.
 *
 * Deliberately typed against the minimum a board needs (`mine` + its
 * neighbouring mine count), so each game can keep its own richer cell type
 * (revealed/flagged/owner/…) without a conversion step.
 */

export interface SolverCell {
  mine: boolean;
  /** Neighbouring mine count; meaningless when `mine` is true. */
  adjacent: number;
}

/** The 8 neighbours of a flat row-major index, clipped to the grid. */
export function solverNeighbors(index: number, rows: number, cols: number): number[] {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push(nr * cols + nc);
    }
  }
  return result;
}

/**
 * Whether the board can be fully cleared from `startRevealed` using pure
 * logical deduction — no 50/50s or worse. Three rules run to a fixpoint:
 *
 *  (a) single-cell: a revealed number whose remaining mine count equals its
 *      hidden-neighbour count means all of them are mines; if that count is
 *      0, all of them are safe.
 *  (b) pairwise subset: when one revealed number's hidden neighbours are a
 *      subset of another's, the difference set is fully determined — this
 *      catches the classic "obvious once you compare two clues" deductions
 *      that single-point logic alone misses.
 *  (c) global mine count: once every mine is accounted for, every other
 *      hidden cell is safe (and vice versa).
 *
 * This mirrors what a careful human solver — not a guesser — could always
 * deduce. It can't reproduce true SAT-solver-only deductions, but those are
 * rare enough in practice that this is what real "no-guess" Minesweeper
 * generators actually ship.
 */
export function isNoGuessSolvable(
  cells: readonly SolverCell[],
  rows: number,
  cols: number,
  mineCount: number,
  startRevealed: readonly number[],
): boolean {
  const n = cells.length;
  const revealed = new Set(startRevealed);
  const deducedMine = new Set<number>();

  const hiddenNeighborsOf = (i: number) =>
    solverNeighbors(i, rows, cols).filter((x) => !revealed.has(x) && !deducedMine.has(x));

  let progress = true;
  while (progress) {
    progress = false;

    // (a) single-cell deduction on every revealed numbered cell.
    for (const i of revealed) {
      const nbrs = solverNeighbors(i, rows, cols);
      const hidden = hiddenNeighborsOf(i);
      if (hidden.length === 0) continue;
      const knownMines = nbrs.filter((x) => deducedMine.has(x)).length;
      const remaining = cells[i]!.adjacent - knownMines;
      if (remaining === 0) {
        for (const h of hidden) revealed.add(h);
        progress = true;
      } else if (remaining === hidden.length) {
        for (const h of hidden) deducedMine.add(h);
        progress = true;
      }
    }

    // (b) pairwise subset deduction across the frontier.
    const frontier = [...revealed].filter((i) => hiddenNeighborsOf(i).length > 0);
    for (const a of frontier) {
      const hiddenA = new Set(hiddenNeighborsOf(a));
      if (hiddenA.size === 0) continue;
      const remainA =
        cells[a]!.adjacent - solverNeighbors(a, rows, cols).filter((x) => deducedMine.has(x)).length;
      for (const b of frontier) {
        if (a === b) continue;
        const hiddenB = new Set(hiddenNeighborsOf(b));
        if (hiddenB.size <= hiddenA.size) continue;
        let subset = true;
        for (const h of hiddenA) {
          if (!hiddenB.has(h)) {
            subset = false;
            break;
          }
        }
        if (!subset) continue;
        const remainB =
          cells[b]!.adjacent - solverNeighbors(b, rows, cols).filter((x) => deducedMine.has(x)).length;
        const diff = [...hiddenB].filter((h) => !hiddenA.has(h));
        const diffMines = remainB - remainA;
        if (diffMines === 0) {
          for (const d of diff) revealed.add(d);
          progress = true;
        } else if (diffMines === diff.length) {
          for (const d of diff) deducedMine.add(d);
          progress = true;
        }
      }
    }

    // (c) global mine-count deduction.
    const hiddenAll: number[] = [];
    for (let i = 0; i < n; i++) if (!revealed.has(i) && !deducedMine.has(i)) hiddenAll.push(i);
    const remainingMines = mineCount - deducedMine.size;
    if (hiddenAll.length > 0) {
      if (remainingMines === 0) {
        for (const h of hiddenAll) revealed.add(h);
        progress = true;
      } else if (remainingMines === hiddenAll.length) {
        for (const h of hiddenAll) deducedMine.add(h);
        progress = true;
      }
    }
  }

  for (let i = 0; i < n; i++) if (!cells[i]!.mine && !revealed.has(i)) return false;
  return true;
}
