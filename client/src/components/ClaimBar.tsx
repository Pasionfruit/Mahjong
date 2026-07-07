import { useState } from 'react';
import type { YourOptions } from '@shared/view';
import { sendAction } from '../socket';
import Tile from './Tile';

export default function ClaimBar({ claim }: { claim: NonNullable<YourOptions['claim']> }) {
  const [showChows, setShowChows] = useState(false);

  function chow(tileIds: [number, number]) {
    void sendAction({ t: 'claim', claim: 'chow', tileIds });
  }

  return (
    <div className="claim-bar">
      {showChows ? (
        <>
          <span className="claim-label">Chow with:</span>
          {claim.chows.map((pair, i) => (
            <button
              key={i}
              type="button"
              className="chow-option"
              onClick={() => chow([pair[0].id, pair[1].id])}
            >
              <Tile kind={pair[0].kind} size="sm" />
              <Tile kind={pair[1].kind} size="sm" />
            </button>
          ))}
          <button className="btn" onClick={() => setShowChows(false)}>
            Back
          </button>
        </>
      ) : (
        <>
          {claim.win && (
            <button
              className="btn btn-primary claim-btn"
              onClick={() => void sendAction({ t: 'claim', claim: 'win' })}
            >
              Win!
            </button>
          )}
          {claim.kong && (
            <button
              className="btn claim-btn"
              onClick={() => void sendAction({ t: 'claim', claim: 'kong' })}
            >
              Kong
            </button>
          )}
          {claim.pong && (
            <button
              className="btn claim-btn"
              onClick={() => void sendAction({ t: 'claim', claim: 'pong' })}
            >
              Pong
            </button>
          )}
          {claim.chows.length > 0 && (
            <button
              className="btn claim-btn"
              onClick={() =>
                claim.chows.length === 1
                  ? chow([claim.chows[0]![0].id, claim.chows[0]![1].id])
                  : setShowChows(true)
              }
            >
              Chow
            </button>
          )}
          <button className="btn claim-btn" onClick={() => void sendAction({ t: 'pass' })}>
            Pass
          </button>
        </>
      )}
    </div>
  );
}
