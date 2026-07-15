import { useState } from 'react';
import { THEMES, type ThemeId } from '@shared/settings';
import { TETRIS_START_LEVELS, gravityMs, type TetrisSettings } from '@shared/tetris';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Tetris rules panel shown inside the shared lobby shell. */
export default function TetrisSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'tetris') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as TetrisSettings;

  function patch(p: Partial<TetrisSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>🚀 Starting level</span>
          <select
            disabled={!isHost}
            value={settings.startLevel}
            onChange={(e) => patch({ startLevel: Number(e.target.value) })}
          >
            {TETRIS_START_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l} ({gravityMs(l)}ms/row)
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>🧱 Garbage attacks</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={settings.garbage}
            onChange={(e) => patch({ garbage: e.target.checked })}
          />
        </label>

        <label className="setting-row">
          <span>🎨 Theme</span>
          <select
            disabled={!isHost}
            value={settings.theme}
            onChange={(e) => patch({ theme: e.target.value as ThemeId })}
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="section-title">How to play</h2>
      <div className="howto-body tet-rules">
        <p>
          Clear lines to score and level up — the fall speed climbs every level up to 20, then
          stays there. Clearing 2+ lines at once dumps garbage on everyone else. Last stack
          standing wins; solo, chase your high score.
        </p>
        <p className="hint">
          ←→ move · ↑/tap rotate · ↓ soft drop · space/drag-down hard drop · C or a quick swipe
          stores your piece (or trades it with the stored one).
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
