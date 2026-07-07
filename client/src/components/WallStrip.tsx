/**
 * The live wall: each column is two stacked tiles (like a real mahjong wall).
 * Columns disappear as tiles are drawn, so the wall visibly shrinks.
 */
export default function WallStrip({ count }: { count: number }) {
  const columns = Math.ceil(count / 2);
  const hasSingle = count % 2 === 1;
  return (
    <div className="wall-strip" title={`${count} tiles left in the wall`}>
      {Array.from({ length: columns }, (_, i) => (
        <div
          key={columns - i}
          className={`wall-col${hasSingle && i === columns - 1 ? ' single' : ''}`}
        />
      ))}
    </div>
  );
}
