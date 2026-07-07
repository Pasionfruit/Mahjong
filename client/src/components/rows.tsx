import type { Tile as TileT } from '@shared/tiles';
import type { MeldView } from '@shared/view';
import Tile, { type TileSize } from './Tile';

export function MeldRow({ melds, size = 'sm' }: { melds: MeldView[]; size?: TileSize }) {
  if (melds.length === 0) return null;
  return (
    <div className="meld-row">
      {melds.map((m, i) => (
        <div key={i} className="meld">
          {m.tiles.map((t, j) => (
            <Tile key={t ? t.id : `x${j}`} kind={t ? t.kind : null} size={size} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FlowerRow({ flowers, size = 'xs' }: { flowers: TileT[]; size?: TileSize }) {
  if (flowers.length === 0) return null;
  return (
    <div className="flower-row">
      {flowers.map((t) => (
        <Tile key={t.id} kind={t.kind} size={size} />
      ))}
    </div>
  );
}

export function DiscardRow({
  discards,
  size = 'xs',
  highlightId,
}: {
  discards: TileT[];
  size?: TileSize;
  highlightId?: number | null;
}) {
  if (discards.length === 0) return null;
  return (
    <div className="discard-row">
      {discards.map((t) => (
        <Tile key={t.id} kind={t.kind} size={size} highlight={t.id === highlightId} />
      ))}
    </div>
  );
}
