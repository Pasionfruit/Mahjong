import { useState, type ReactNode } from 'react';
import { IconClose } from '../../components/icons';

/**
 * Shell for every game's finished-run modal: an X in the corner tucks the
 * panel away so the player can study the final board, and a floating
 * "View result" pill brings it back. Mounting a fresh run unmounts this
 * (the game's `finished`/`dead` flag resets), so the hidden state never
 * leaks across games.
 */
export default function ResultPanel({ className, children }: { className: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);

  if (hidden) {
    return (
      <button className="btn result-peek" onClick={() => setHidden(false)}>
        🏁 View result
      </button>
    );
  }

  return (
    <div className={className}>
      <button className="result-close" aria-label="Hide result" onClick={() => setHidden(true)}>
        <IconClose />
      </button>
      {children}
    </div>
  );
}
