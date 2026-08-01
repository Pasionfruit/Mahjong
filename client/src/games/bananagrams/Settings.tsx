import { useState } from 'react';
import { THEMES, type ThemeId } from '@shared/settings';
import {
  BG_START_TILE_CHOICES,
  startTilesFor,
  type BananagramsSettings,
} from '@shared/bananagrams';
import { updateSettings } from '../../socket';
import { useStore } from '../../store';

/** The Bananagrams rules panel shown inside the shared lobby shell. */
export default function BananagramsSettingsPanel() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  if (!lobby || lobby.gameId !== 'bananagrams') return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const settings = lobby.settings as BananagramsSettings;
  const autoCount = startTilesFor(Math.max(lobby.players.length, 2));

  function patch(p: Partial<BananagramsSettings>) {
    void updateSettings(p as Record<string, unknown>).then((r) => setError(r.ok ? null : r.error));
  }

  return (
    <>
      <h2 className="section-title">Settings</h2>
      <div className="settings">
        <label className="setting-row">
          <span>🎯 Starting tiles</span>
          <select
            disabled={!isHost}
            value={settings.startTiles}
            onChange={(e) =>
              patch({ startTiles: Number(e.target.value) as BananagramsSettings['startTiles'] })
            }
          >
            {BG_START_TILE_CHOICES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? `Auto — official (now ${autoCount})` : `${n} tiles`}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Official deal: 21 tiles for 2–4 players, 15 for 5–6, 11 for 7–8. Oversized deals are
          clamped so the bunch can always cover one peel.
        </p>

        <label className="setting-row">
          <span>📏 Shortest word</span>
          <select
            disabled={!isHost}
            value={settings.minWordLen}
            onChange={(e) => patch({ minWordLen: Number(e.target.value) as 2 | 3 })}
          >
            <option value={2}>2 letters (official)</option>
            <option value={3}>3 letters (house rule)</option>
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
      <div className="howto-body">
        <p>
          Everyone races at once to build their own private crossword: every word must be a real
          word, and all your tiles must connect into one grid. Use your very last tile and you
          trigger a <b>PEEL</b> — every player draws one more tile from the bunch and the race
          goes on.
        </p>
        <p>
          Stuck with an impossible letter? <b>DUMP</b> it: trade 1 tray tile back to the bunch for
          3 fresh ones. When the bunch runs too dry to cover a peel, the first player to finish
          their grid calls <b>BANANAS!</b> and wins the round.
        </p>
        <p className="hint">
          Tap a tray tile, then tap a board square to place it. Tap one of your placed tiles to
          pick it up — then tap a new square to move it, or Recall to take it back into your tray.
        </p>
      </div>

      {error && <div className="error">{error}</div>}
    </>
  );
}
