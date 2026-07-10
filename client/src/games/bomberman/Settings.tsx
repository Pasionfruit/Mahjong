import { useState } from 'react';
import {
  BOMBER_MAPS,
  BOMBER_MAP_NAMES,
  ITEM_FREQUENCIES,
  LIVES_CHOICES,
  PLAYER_COLORS,
  SUDDEN_DEATH_CHOICES,
  type BomberMapId,
  type BombermanSettings,
  type ItemFrequency,
  type LivesCount,
  type SuddenDeathSeconds,
} from '@shared/bomberman';
import { setColor, updateSettings } from '../../socket';
import { useStore } from '../../store';

/** Bomberman rules panel: map, sudden-death timer, and your color. */
export default function BombermanSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'bomberman') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as BombermanSettings;
  const takenBy = (color: string) => lobby.players.find((p) => p.color === color);

  function patch(p: Partial<BombermanSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  function pickColor(color: string) {
    void setColor(color).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>Map</span>
          <select
            disabled={!isHost}
            value={settings.map}
            onChange={(e) => patch({ map: e.target.value as BomberMapId })}
          >
            {BOMBER_MAPS.map((m) => (
              <option key={m} value={m}>
                {BOMBER_MAP_NAMES[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>Sudden death (walls close in)</span>
          <select
            disabled={!isHost}
            value={settings.suddenDeathSeconds}
            onChange={(e) =>
              patch({ suddenDeathSeconds: Number(e.target.value) as SuddenDeathSeconds })
            }
          >
            {SUDDEN_DEATH_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? 'Off' : `After ${s / 60} min`}
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>Lives</span>
          <select
            disabled={!isHost}
            value={settings.lives}
            onChange={(e) => patch({ lives: Number(e.target.value) as LivesCount })}
          >
            {LIVES_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '1 — no second chances' : `${n} — shrug off hits`}
              </option>
            ))}
          </select>
        </label>

        <label className="setting-row">
          <span>Item drop rate</span>
          <select
            disabled={!isHost}
            value={settings.itemFrequency}
            onChange={(e) => patch({ itemFrequency: e.target.value as ItemFrequency })}
          >
            {ITEM_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h2 className="section-title">Your color</h2>
      <div className="color-row">
        {PLAYER_COLORS.map((c) => {
          const owner = takenBy(c);
          const mine = me?.color === c;
          return (
            <button
              key={c}
              type="button"
              className={`color-swatch${mine ? ' mine' : ''}`}
              style={{ background: c }}
              disabled={!!owner && !mine}
              title={owner ? owner.nickname : 'Pick this color'}
              onClick={() => pickColor(c)}
            />
          );
        })}
      </div>

      <h2 className="section-title">How to play</h2>
      <div className="howto-body uttt-rules">
        <p>
          <strong>Desktop only.</strong> Move with WASD or arrow keys, drop bombs with{' '}
          <strong>Space</strong>, and pick up / throw a bomb with <strong>E</strong> (needs the
          glove powerup). Last player standing wins.
        </p>
        <p>
          Blast bricks to reveal powerups: bigger blasts, brick-piercing blasts, speed boots, a
          glove to throw bombs, and a hex that briefly slows everyone else. Powerups reset every
          game. With extra lives, a hit makes you blink — briefly untouchable — instead of taking
          you out. If sudden death is on, the walls close in toward the center when the timer runs
          out (and they are always lethal).
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
