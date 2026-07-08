import type { PublicPlayer } from '@shared/view';
import Tile from './Tile';
import { IconBot, IconTrophy } from './icons';
import { FlowerRow, MeldRow } from './rows';

export default function OpponentPanel({
  player,
  isTurn,
}: {
  player: PublicPlayer;
  isTurn: boolean;
}) {
  return (
    <div className={`opponent-panel${isTurn ? ' active-turn' : ''}`}>
      <div className="panel-header">
        <span className={`conn-dot ${player.connected ? 'on' : 'off'}`} />
        <span className="player-name">
          {player.isBot && (
            <span className="bot-glyph">
              <IconBot />
            </span>
          )}
          {player.nickname}
        </span>
        {player.isDealer && <span className="dealer-badge">dealer</span>}
        <span className="win-count">
          {player.wins > 0 && (
            <>
              {player.wins} <IconTrophy />
            </>
          )}
        </span>
      </div>
      <div className="opponent-hand">
        {player.hand
          ? player.hand.map((t) => <Tile key={t.id} kind={t.kind} size="xs" />)
          : Array.from({ length: player.handCount }, (_, i) => <Tile key={i} kind={null} size="xs" />)}
      </div>
      <MeldRow melds={player.melds} size="xs" />
      <FlowerRow flowers={player.flowers} />
    </div>
  );
}
