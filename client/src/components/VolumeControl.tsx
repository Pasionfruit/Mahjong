import { useState } from 'react';
import { getAudioState, setAudio } from '../audio';
import { IconMute, IconVolume } from './icons';

export default function VolumeControl() {
  const [state, setState] = useState(getAudioState());

  function update(patch: Parameters<typeof setAudio>[0]) {
    setAudio(patch);
    setState(getAudioState());
  }

  const silent = state.muted || state.volume === 0;

  return (
    <div className="volume-control" title="Sound volume">
      <button
        type="button"
        className="btn hud-btn vol-btn"
        onClick={() => update({ muted: !state.muted })}
        aria-label={silent ? 'Unmute' : 'Mute'}
      >
        {silent ? <IconMute /> : <IconVolume />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={state.muted ? 0 : Math.round(state.volume * 100)}
        onChange={(e) => update({ volume: Number(e.target.value) / 100, muted: false })}
        aria-label="Volume"
      />
    </div>
  );
}
