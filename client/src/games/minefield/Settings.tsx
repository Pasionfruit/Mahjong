import { useState } from 'react';
import {
  MINEFIELD_PRESET_CHOICES,
  MINEFIELD_PRESETS,
  type MinefieldPreset,
  type MinefieldSettings,
} from '@shared/minefield';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

const PRESET_LABEL: Record<MinefieldPreset, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

/** The Minefield rules panel shown inside the shared lobby shell. */
export default function MinefieldSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'minefield') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as MinefieldSettings;

  function patch(p: Partial<MinefieldSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>📐 Board</span>
          <select
            disabled={!isHost}
            value={settings.preset}
            onChange={(e) => patch({ preset: e.target.value as MinefieldPreset })}
          >
            {MINEFIELD_PRESET_CHOICES.map((p) => {
              const spec = MINEFIELD_PRESETS[p];
              return (
                <option key={p} value={p}>
                  {PRESET_LABEL[p]} — {spec.rows}×{spec.cols}, {spec.mines} mines
                </option>
              );
            })}
          </select>
        </label>

        <label className="setting-row">
          <span>🎲 Remove all 50/50s</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={settings.noGuess}
            onChange={(e) => patch({ noGuess: e.target.checked })}
          />
        </label>
        <p className="hint">
          On: every board is regenerated until it's fully solvable by logic alone — no coin-flip guesses,
          ever. Off: classic Minesweeper odds, 50/50s and all.
        </p>
      </div>

      <h2 className="section-title">How to play</h2>
      <div className="howto-body">
        <p>
          Everyone battles on one shared minefield in real time. Tap a hidden cell to reveal it for the
          whole table — clear a connected patch and every safe cell you uncover (including the ones your
          reveal cascades into) counts toward your score.
        </p>
        <p>
          Hit a mine and you're <b>eliminated</b> — out for the rest of the round, but you keep watching.
          The round ends the instant only one player is still standing, or the moment the whole board is
          safely cleared — whoever lands that final reveal wins outright.
        </p>
        <p className="hint">
          Right-click (or long-press) a hidden cell to flag it for yourself as a reminder — flags are
          personal and never visible to anyone else, so they can't help or hinder an opponent.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
