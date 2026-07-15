import { useState } from 'react';
import { THEMES, TURN_TIMER_CHOICES, type ThemeId, type TurnTimerSeconds } from '@shared/settings';
import { DOTS_SIZE_CHOICES, type DotsSettings, type DotsSize } from '@shared/dots';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Dots and Boxes rules panel shown inside the shared lobby shell. */
export default function DotsSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'dots') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as DotsSettings;

  function patch(p: Partial<DotsSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>▦ Board size</span>
          <select
            disabled={!isHost}
            value={settings.size}
            onChange={(e) => patch({ size: Number(e.target.value) as DotsSize })}
          >
            {DOTS_SIZE_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s}×{s} boxes
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>⏱️ Turn timer</span>
          <select
            disabled={!isHost}
            value={settings.turnTimerSeconds}
            onChange={(e) => patch({ turnTimerSeconds: Number(e.target.value) as TurnTimerSeconds })}
          >
            {TURN_TIMER_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Off' : `${s} seconds`}
              </option>
            ))}
          </select>
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
      <div className="howto-body dots-rules">
        <p>
          Take turns drawing one line between two dots. Close the fourth side of a box to claim
          it — and move again. Most boxes when the grid fills wins. Play a friend, a table of
          six, or add bots from the lobby.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
