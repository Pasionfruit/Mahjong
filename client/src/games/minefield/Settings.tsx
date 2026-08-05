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

/** The Minesweeper (internal id "minefield") rules panel shown inside the
 *  shared lobby shell. */
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

        <label className="setting-row">
          <span>💣 Keep playing after a mine</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={!settings.eliminateOnMine}
            onChange={(e) => patch({ eliminateOnMine: !e.target.checked })}
          />
        </label>
        <p className="hint">
          Checked: a mine just costs you that reveal on your own board, and you're free to keep
          clicking. Unchecked (classic rules): hitting a mine eliminates you for the round.
        </p>
      </div>

      <h2 className="section-title">How to play</h2>
      <div className="howto-body">
        <p>
          Everyone races their own board — laid out identically for every player, so it's a fair
          speedrun, not a luck contest. Tap a hidden cell to reveal it (and whatever safe patch it
          cascades into) on <b>your</b> board only; nobody else can see your progress cell-by-cell.
        </p>
        <p>
          By default, hitting a mine gets you <b>eliminated</b> — out for the rest of the round, but you
          keep watching, and the round ends the instant only one player is still standing. Turn off "keep
          playing after a mine" above and mines instead just cost you that reveal — you stay in the race.
          Either way, the round also ends the moment someone fully clears their own board — first one
          there wins outright, and everyone gets to see the layout they were all racing.
        </p>
        <p className="hint">
          Right-click (or long-press) a hidden cell to flag it for yourself as a reminder — flags are
          personal and never sent anywhere, so they're just for you.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
