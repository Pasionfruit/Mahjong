import { useEffect, useRef, useState } from 'react';

/**
 * A full-screen "3 … 2 … 1 … GO!" countdown overlay, shown before a round
 * becomes playable. Games render it while their own input is gated, then
 * start on `onDone`.
 *
 * `waitFor` exists for games that need the board to reach a ready state
 * before the count is even meaningful — Sand Play holds at "3" until its
 * opening avalanche has settled, so the count never expires into a board
 * that's still moving. Games with nothing to wait on just omit it.
 */
export default function Countdown({
  onDone,
  waitFor = true,
  stepMs = 700,
}: {
  onDone: () => void;
  /** Hold the countdown at its first tick until this turns true. */
  waitFor?: boolean;
  stepMs?: number;
}) {
  // 3 → 2 → 1 → 0 ("GO!") → done.
  const [n, setN] = useState(3);

  // Callers pass an inline closure, so `onDone` is a fresh identity every
  // render. Some hosts re-render on a physics tick (Sand Play: every 40ms),
  // which — if this were an effect dependency — would clear and restart the
  // timer before it could ever fire. Keep it in a ref so the timer only
  // depends on the tick number and the wait gate.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (!waitFor) return; // still settling — hold at 3
    if (n < 0) return;
    const id = window.setTimeout(() => {
      if (n === 0) onDoneRef.current();
      else setN((v) => v - 1);
    }, stepMs);
    return () => window.clearTimeout(id);
  }, [n, waitFor, stepMs]);

  const label = n === 0 ? 'GO!' : String(n);

  return (
    <div className="countdown" role="status" aria-live="assertive">
      <span
        // Keyed so each tick remounts and replays the pop animation.
        key={label}
        className={`countdown-num${n === 0 ? ' countdown-go' : ''}`}
      >
        {label}
      </span>
      {!waitFor && <span className="countdown-wait">settling…</span>}
    </div>
  );
}
