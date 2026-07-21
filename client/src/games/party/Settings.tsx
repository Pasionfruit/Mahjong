import { useState } from 'react';
import { THEMES, type ThemeId } from '@shared/settings';
import { PARTY_ROUNDS_CHOICES, PARTY_STAR_COST, type PartySettings } from '@shared/party';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Party Board rules panel shown inside the shared lobby shell. */
export default function PartySettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'party') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as PartySettings;

  function patch(p: Partial<PartySettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>🔁 Rounds</span>
          <select
            disabled={!isHost}
            value={settings.rounds}
            onChange={(e) => patch({ rounds: Number(e.target.value) })}
          >
            {PARTY_ROUNDS_CHOICES.map((r) => (
              <option key={r} value={r}>
                {r}
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
      <div className="howto-body party-rules">
        <p>
          Roll the die and march around the board: blue spaces pay coins, red ones charge, and
          ? spaces roll the dice of fate. Pass the star with {PARTY_STAR_COST} coins and you may
          buy it — then it hops elsewhere. Every round ends with three chests: two pay, one
          bites. Most stars when the rounds run out wins (coins break ties). Bots welcome.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
