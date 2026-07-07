import type { PublicPlayer } from '@shared/view';

export default function Leaderboard({
  players,
  turnSeat,
}: {
  players: PublicPlayer[];
  turnSeat: number;
}) {
  const sorted = [...players].sort((a, b) => b.wins - a.wins || a.seat - b.seat);
  return (
    <div className="leaderboard">
      <div className="leaderboard-title">🏆 Wins</div>
      {sorted.map((p) => (
        <div key={p.seat} className={`leader-row${p.seat === turnSeat ? ' current' : ''}`}>
          <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
          <span className="leader-name">{p.nickname}</span>
          <span className="leader-wins">{p.wins}</span>
        </div>
      ))}
    </div>
  );
}
