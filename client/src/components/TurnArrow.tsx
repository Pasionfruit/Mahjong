/**
 * Compass in the table center: the gold pointer rotates toward the player
 * whose turn it is (0° = top seat, 90° = right, 180° = you, 270° = left);
 * the dashed ring with the arrowhead shows the direction of play.
 */
export default function TurnArrow({ angle }: { angle: number }) {
  return (
    <div className="turn-arrow" aria-hidden>
      <svg viewBox="0 0 80 80">
        <circle
          cx="40"
          cy="40"
          r="28"
          fill="none"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="2.5"
          strokeDasharray="5 6"
        />
        {/* play flows bottom → right → top → left: at the top of the ring that is leftward */}
        <polygon points="34,12 47,5 47,19" fill="rgba(255,255,255,0.45)" />
        <g
          style={{
            transform: `rotate(${angle}deg)`,
            transformOrigin: '40px 40px',
            transition: 'transform 0.45s ease',
          }}
        >
          <polygon points="40,14 51,40 40,33 29,40" fill="var(--accent)" />
        </g>
        <circle cx="40" cy="40" r="4" fill="rgba(255,255,255,0.5)" />
      </svg>
    </div>
  );
}
