import { useState } from 'react';
import { THEMES, type ThemeId } from '@shared/settings';
import {
  SUMO_LIVES_CHOICES,
  SUMO_MAP_NAMES,
  SUMO_MAPS,
  SUMO_MATCH_SECONDS_CHOICES,
  SUMO_PLAYER_CHOICES,
  SUMO_SHRINK_AFTER_CHOICES,
  type SumoMapId,
  type SumoSettings,
} from '@shared/sumo';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Spin Sumo rules panel shown inside the shared lobby shell. */
export default function SumoSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'sumo') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as SumoSettings;

  function patch(p: Partial<SumoSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>🗺️ Arena</span>
          <select
            disabled={!isHost}
            value={settings.map}
            onChange={(e) => patch({ map: e.target.value as SumoMapId })}
          >
            {SUMO_MAPS.map((m) => (
              <option key={m} value={m}>
                {SUMO_MAP_NAMES[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>🏁 Mode</span>
          <select
            disabled={!isHost}
            value={settings.mode}
            onChange={(e) => patch({ mode: e.target.value as SumoSettings['mode'] })}
          >
            <option value="lives">Lives — last top standing</option>
            <option value="countdown">Countdown — most knockouts</option>
          </select>
        </label>

        {settings.mode === 'lives' && (
          <>
            <label className="setting-row">
              <span>❤️ Lives</span>
              <select
                disabled={!isHost}
                value={settings.lives}
                onChange={(e) => patch({ lives: Number(e.target.value) })}
              >
                {SUMO_LIVES_CHOICES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="setting-row">
              <span>⏳ Arena shrinks after</span>
              <select
                disabled={!isHost}
                value={settings.shrinkAfterSeconds}
                onChange={(e) => patch({ shrinkAfterSeconds: Number(e.target.value) })}
              >
                {SUMO_SHRINK_AFTER_CHOICES.map((s) => (
                  <option key={s} value={s}>
                    {s} seconds
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {settings.mode === 'countdown' && (
          <label className="setting-row">
            <span>⏱️ Match length</span>
            <select
              disabled={!isHost}
              value={settings.matchSeconds}
              onChange={(e) => patch({ matchSeconds: Number(e.target.value) })}
            >
              {SUMO_MATCH_SECONDS_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="setting-row">
          <span>👥 Max players</span>
          <select
            disabled={!isHost}
            value={settings.maxPlayers}
            onChange={(e) => patch({ maxPlayers: Number(e.target.value) })}
          >
            {SUMO_PLAYER_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n}
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
      <div className="howto-body sumo-rules">
        <p>
          Ram the other tops off the arena. Every impact grinds away rotation — defenders more
          than attackers — and a drained top hits softer, steers worse, and flies farther, so
          pick your collisions. In <strong>Lives</strong> mode you're out when your lives run
          dry, and after the countdown the ring itself starts closing in. In{' '}
          <strong>Countdown</strong> mode everyone respawns and the most knockouts on the clock
          wins. Add bots from the lobby to fill the ring.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
