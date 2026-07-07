import type { Tile as TileT } from '@shared/tiles';
import type { YourOptions } from '@shared/view';
import { sendAction } from '../socket';
import Tile from './Tile';

export default function SelfActions({
  options,
  hand,
}: {
  options: YourOptions;
  hand: TileT[];
}) {
  const { canWinSelfDraw, concealedKongKinds, addedKongTileIds } = options;
  if (!canWinSelfDraw && concealedKongKinds.length === 0 && addedKongTileIds.length === 0) {
    return null;
  }
  return (
    <div className="self-actions">
      {canWinSelfDraw && (
        <button
          className="btn btn-primary claim-btn"
          onClick={() => void sendAction({ t: 'winSelfDraw' })}
        >
          Win!
        </button>
      )}
      {concealedKongKinds.map((kind) => (
        <button
          key={kind}
          className="btn kong-btn"
          onClick={() => void sendAction({ t: 'concealedKong', kind })}
        >
          Kong <Tile kind={kind} size="xs" />
        </button>
      ))}
      {addedKongTileIds.map((tileId) => {
        const tile = hand.find((t) => t.id === tileId);
        return (
          <button
            key={tileId}
            className="btn kong-btn"
            onClick={() => void sendAction({ t: 'addedKong', tileId })}
          >
            Kong+ {tile && <Tile kind={tile.kind} size="xs" />}
          </button>
        );
      })}
    </div>
  );
}
