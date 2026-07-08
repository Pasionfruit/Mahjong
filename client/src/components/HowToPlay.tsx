import { useState } from 'react';

/** A "How to play" button plus the rules overlay it opens. */
export default function HowToPlay({ label = 'How to play' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn howto-btn" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="overlay-card howto-card" onClick={(e) => e.stopPropagation()}>
            <h2>How to play</h2>
            <div className="howto-body">
              <section>
                <h3>The goal</h3>
                <p>
                  Finish a winning hand before anyone else. A winning hand is{' '}
                  <strong>N triples + 1 double</strong> — a triple is three of a kind or a run of
                  three in one suit; a double is two identical tiles. N is the lobby&apos;s
                  &ldquo;Triples to win&rdquo; setting. There is a second route too:{' '}
                  <strong>(N+2) doubles + 1 triple</strong>.
                </p>
              </section>

              <section>
                <h3>Your turn</h3>
                <ul>
                  <li>A tile is drawn for you automatically at the start of your turn.</li>
                  <li>Tap a tile once to select it, tap it again to discard it.</li>
                  <li>Drag tiles to rearrange your hand, or press Sort.</li>
                  <li>
                    If your drawn tile completes your hand, press <strong>Win</strong>.
                  </li>
                </ul>
              </section>

              <section>
                <h3>Claiming a discard</h3>
                <ul>
                  <li>
                    <strong>Pong</strong> — you hold two matching tiles: take the discard and expose
                    the triple.
                  </li>
                  <li>
                    <strong>Kong</strong> — you hold three matching tiles: expose all four and draw a
                    replacement tile.
                  </li>
                  <li>
                    <strong>Chow</strong> — next player only: the discard completes a run with two of
                    your tiles.
                  </li>
                  <li>
                    <strong>Win</strong> — the discard completes your winning hand.
                  </li>
                </ul>
                <p>
                  Speed matters: if several players want the same discard, the{' '}
                  <strong>first click gets it</strong> — except a Win, which always beats pongs and
                  chows. The timer grants extra seconds when you have more than one way to claim.
                </p>
              </section>

              <section>
                <h3>Kongs &amp; flowers</h3>
                <ul>
                  <li>Four of a kind in hand? Declare a concealed kong on your turn.</li>
                  <li>Drew the fourth tile of your exposed pong? Upgrade it to a kong.</li>
                  <li>Kongs always draw a replacement from the back of the wall.</li>
                  <li>Flower tiles are set aside automatically and replaced with a fresh tile.</li>
                </ul>
              </section>

              <section>
                <h3>Timers &amp; the table</h3>
                <ul>
                  <li>If the turn timer runs out, your drawn tile is discarded for you.</li>
                  <li>
                    The wall counter (top right) shows tiles remaining — an empty wall ends the round
                    in a draw.
                  </li>
                  <li>The host can add easy, medium, or hard bots in the lobby.</li>
                  <li>The first player to claim a round win takes the trophy for that round.</li>
                </ul>
              </section>
            </div>
            <button className="btn btn-primary howto-close" onClick={() => setOpen(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
