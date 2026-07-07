import { useEffect, useReducer, useRef } from 'react';
import { play } from '../audio';

export default function TimerBar({
  deadline,
  tickAudible = false,
}: {
  deadline: number | null;
  /** When true, a tick plays each second during the final 10 seconds. */
  tickAudible?: boolean;
}) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const baseline = useRef<{ deadline: number; total: number } | null>(null);
  const lastTickSec = useRef(-1);
  const deadlineRef = useRef(deadline);
  const audibleRef = useRef(tickAudible);
  deadlineRef.current = deadline;
  audibleRef.current = tickAudible;

  useEffect(() => {
    const id = setInterval(() => {
      rerender();
      const d = deadlineRef.current;
      if (d === null || !audibleRef.current) return;
      const remaining = d - Date.now();
      if (remaining > 0 && remaining <= 10_000) {
        const sec = Math.ceil(remaining / 1000);
        if (lastTickSec.current !== sec) {
          lastTickSec.current = sec;
          play('tick');
        }
      }
    }, 200);
    return () => clearInterval(id);
  }, []);

  if (deadline === null) return null;
  if (!baseline.current || baseline.current.deadline !== deadline) {
    baseline.current = { deadline, total: Math.max(deadline - Date.now(), 1) };
    lastTickSec.current = -1;
  }
  const remaining = Math.max(deadline - Date.now(), 0);
  const pct = Math.min(100, (remaining / baseline.current.total) * 100);
  const urgent = remaining < 5000;

  return (
    <div className="timerbar">
      <div className={`timerbar-fill${urgent ? ' urgent' : ''}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
