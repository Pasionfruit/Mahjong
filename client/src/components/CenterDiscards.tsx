import type { Tile as TileT } from '@shared/tiles';
import Tile from './Tile';
import TurnArrow from './TurnArrow';

/**
 * The table felt: older discards lie scattered around the board (stable,
 * deterministic positions so every client sees the same table), the most
 * recent discard sits large in the middle, with the turn compass below it.
 */
export default function CenterDiscards({
  pile,
  activeClaimable,
  arrowAngle,
}: {
  pile: { seat: number; tile: TileT }[];
  activeClaimable: boolean;
  arrowAngle: number;
}) {
  const older = pile.slice(0, -1);
  const active = pile.length > 0 ? pile[pile.length - 1]! : null;

  return (
    <div className="discard-board">
      {older.map((d, i) => {
        const h = hash(d.tile.id);
        // golden-angle spiral outward from the center + per-tile jitter
        const angleDeg = i * 137.508 + (h % 24) - 12;
        const radius = Math.min(26 + 3 * Math.sqrt(i), 47);
        const rad = (angleDeg * Math.PI) / 180;
        const x = 50 + radius * Math.cos(rad);
        const y = 50 + radius * Math.sin(rad);
        const rot = ((h >>> 8) % 36) - 18;
        return (
          <div
            key={d.tile.id}
            className="scatter-tile"
            style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
          >
            <Tile kind={d.tile.kind} size="sm" />
          </div>
        );
      })}

      <div className="board-arrow">
        <TurnArrow angle={arrowAngle} />
      </div>

      {active ? (
        <div className="discard-active">
          <Tile kind={active.tile.kind} size="lg" highlight={activeClaimable} />
        </div>
      ) : (
        <span className="discard-hint">discards appear here</span>
      )}
    </div>
  );
}

function hash(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
