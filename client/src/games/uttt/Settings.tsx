import { useState } from 'react';
import { THEMES, TURN_TIMER_CHOICES, type ThemeId, type TurnTimerSeconds } from '@shared/settings';
import type { UtttSettings } from '@shared/uttt';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Ultimate Tic-Tac-Toe rules panel shown inside the shared lobby shell. */
export default function UtttSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'uttt') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as UtttSettings;

  function patch(p: Partial<UtttSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>Turn timer</span>
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
          <span>Theme</span>
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
      <div className="howto-body uttt-rules">
        <p>
          Win three small boards in a row to win the game. Your move sends your opponent to the
          small board matching the <strong>cell</strong> you just played.
        </p>
        <p>
          If that board is already won or full, they may play in <strong>any</strong> open board.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
