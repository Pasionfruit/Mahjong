import { useState } from 'react';
import { THEMES, TURN_TIMER_CHOICES, type ThemeId, type TurnTimerSeconds } from '@shared/settings';
import type { QuoridorSettings } from '@shared/quoridor';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Quoridor rules panel shown inside the shared lobby shell. */
export default function QuoridorSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'quoridor') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as QuoridorSettings;

  function patch(p: Partial<QuoridorSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
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
      <div className="howto-body quor-rules">
        <p>
          Each turn: step your pawn one square, or place one of your 10 walls. Walls block both
          players — but may never seal anyone's last route. Face-to-face pawns can be jumped.
          First to the opposite edge wins. Add a bot from the lobby to play solo.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
