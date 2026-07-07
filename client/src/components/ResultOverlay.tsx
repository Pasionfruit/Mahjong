import type { ClientGameView } from '@shared/view';
import { backToLobby, nextRound } from '../socket';
import Tile from './Tile';
import { MeldRow, FlowerRow } from './rows';

export default function ResultOverlay({ game, isHost }: { game: ClientGameView; isHost: boolean }) {
  const result = game.result;
  if (!result) return null;

  const winner = result.winnerSeat !== undefined ? game.players[result.winnerSeat] : null;

  return (
    <div className="overlay">
      <div className="overlay-card">
        {result.type === 'wallExhausted' ? (
          <h2>Wall exhausted — the round is a draw</h2>
        ) : (
          <>
            <h2>
              {winner?.nickname} wins
              {result.by === 'selfDraw' ? ' by self-draw!' : ` off ${
                result.fromSeat !== undefined ? game.players[result.fromSeat]?.nickname : ''
              }'s discard!`}
            </h2>
            <div className="winning-hand">
              {result.winningHand?.map((t) => (
                <Tile key={t.id} kind={t.kind} size="md" highlight={t.id === result.winningTile?.id} />
              ))}
            </div>
            {winner && winner.melds.length > 0 && (
              <div className="winning-melds">
                <MeldRow melds={winner.melds} size="sm" />
              </div>
            )}
            {winner && winner.flowers.length > 0 && <FlowerRow flowers={winner.flowers} size="xs" />}
          </>
        )}

        <table className="scoreboard">
          <tbody>
            {[...game.players]
              .sort((a, b) => b.wins - a.wins)
              .map((p) => (
                <tr key={p.seat}>
                  <td>{p.nickname}</td>
                  <td className="score-wins">{p.wins} 🏆</td>
                </tr>
              ))}
          </tbody>
        </table>

        {isHost ? (
          <div className="overlay-actions">
            <button className="btn" onClick={() => void backToLobby()}>
              Back to lobby
            </button>
            <button className="btn btn-primary" onClick={() => void nextRound()}>
              Next round
            </button>
          </div>
        ) : (
          <p className="hint">Waiting for the host to continue…</p>
        )}
      </div>
    </div>
  );
}
