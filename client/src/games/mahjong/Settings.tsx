import { useState } from 'react';
import {
  THEMES,
  TURN_TIMER_CHOICES,
  defaultSetsFor,
  type GameSettings,
  type ThemeId,
  type TurnTimerSeconds,
} from '@shared/settings';
import { updateSettings } from '../../socket';
import HowToPlay from '../../components/HowToPlay';
import { useStore } from '../../store';

/** The Mahjong-specific rules panel shown inside the shared lobby shell. */
export default function MahjongSettings() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'mahjong') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as GameSettings;
  const autoSets = defaultSetsFor(lobby.players.length);

  function patch(p: Partial<GameSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Rules</h2>
      <div className="settings">
        <label className="setting-row">
          <span>Flowers</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={settings.includeFlowers}
            onChange={(e) => patch({ includeFlowers: e.target.checked })}
          />
        </label>

        <label className="setting-row">
          <span>Winds &amp; dragons</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={settings.includeHonors}
            onChange={(e) => patch({ includeHonors: e.target.checked })}
          />
        </label>

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
          <span>Open hands (everyone sees all tiles)</span>
          <input
            type="checkbox"
            disabled={!isHost}
            checked={settings.openHands}
            onChange={(e) => patch({ openHands: e.target.checked })}
          />
        </label>

        <label className="setting-row">
          <span>Triples to win</span>
          <select
            disabled={!isHost}
            value={settings.setsToWin ?? 'auto'}
            onChange={(e) =>
              patch({ setsToWin: e.target.value === 'auto' ? null : Number(e.target.value) })
            }
          >
            <option value="auto">
              Auto ({autoSets} for {lobby.players.length}{' '}
              {lobby.players.length === 1 ? 'player' : 'players'})
            </option>
            {[2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} triples + double (or {n + 2} doubles + triple)
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>Tile theme</span>
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

      <h2 className="section-title">Instructions</h2>
      <div className="howto-row">
        <HowToPlay />
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
