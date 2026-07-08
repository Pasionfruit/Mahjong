import { useState } from 'react';
import {
  BOT_DIFFICULTIES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  THEMES,
  TURN_TIMER_CHOICES,
  defaultSetsFor,
  type GameSettings,
  type ThemeId,
  type TurnTimerSeconds,
} from '@shared/settings';
import { addBot, leaveParty, removeBot, startGame, updateSettings } from '../socket';
import { IconBot, IconClose, IconTrophy } from '../components/icons';
import { useStore } from '../store';

export default function Lobby() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!lobby) return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const canStart = lobby.players.length >= MIN_PLAYERS && lobby.players.length <= MAX_PLAYERS;
  const autoSets = defaultSetsFor(lobby.players.length);

  function patch(p: Partial<GameSettings>) {
    void updateSettings(p).then((r) => setError(r.ok ? null : r.error));
  }

  async function handleStart() {
    const r = await startGame();
    if (!r.ok) setError(r.error);
  }

  function copyCode() {
    void navigator.clipboard?.writeText(lobby!.roomCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const anyWins = lobby.players.some((p) => p.wins > 0);

  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="room-code-row">
          <div>
            <div className="room-code-label">Room code</div>
            <div className="room-code">{lobby.roomCode}</div>
          </div>
          <button className="btn" onClick={copyCode}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <h2 className="section-title">
          Players ({lobby.players.length}/{MAX_PLAYERS})
        </h2>
        <ul className="player-list">
          {lobby.players.map((p) => (
            <li key={p.seat} className="player-row">
              <span className={`conn-dot ${p.connected ? 'on' : 'off'}`} />
              <span className="player-name">
                {p.isBot && (
                  <span className="bot-glyph">
                    <IconBot />
                  </span>
                )}
                {p.nickname}
                {p.seat === lobby.yourSeat && <span className="you-tag"> (you)</span>}
              </span>
              {p.isHost && <span className="host-badge">host</span>}
              {anyWins && (
                <span className="win-count">
                  {p.wins} <IconTrophy />
                </span>
              )}
              {isHost && p.isBot && (
                <button
                  className="btn bot-remove-btn"
                  title="Remove bot"
                  onClick={() =>
                    void removeBot(p.seat).then((r) => setError(r.ok ? null : r.error))
                  }
                >
                  <IconClose />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost && lobby.players.length < MAX_PLAYERS && (
          <div className="add-bot-row">
            <span className="hint">Add a bot:</span>
            {BOT_DIFFICULTIES.map((d) => (
              <button
                key={d}
                className="btn bot-add-btn"
                onClick={() => void addBot(d).then((r) => setError(r.ok ? null : r.error))}
              >
                + {d}
              </button>
            ))}
          </div>
        )}

        <h2 className="section-title">Rules</h2>
        <div className="settings">
          <label className="setting-row">
            <span>Flowers</span>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={lobby.settings.includeFlowers}
              onChange={(e) => patch({ includeFlowers: e.target.checked })}
            />
          </label>

          <label className="setting-row">
            <span>Winds &amp; dragons</span>
            <input
              type="checkbox"
              disabled={!isHost}
              checked={lobby.settings.includeHonors}
              onChange={(e) => patch({ includeHonors: e.target.checked })}
            />
          </label>

          <label className="setting-row">
            <span>Turn timer</span>
            <select
              disabled={!isHost}
              value={lobby.settings.turnTimerSeconds}
              onChange={(e) =>
                patch({ turnTimerSeconds: Number(e.target.value) as TurnTimerSeconds })
              }
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
              checked={lobby.settings.openHands}
              onChange={(e) => patch({ openHands: e.target.checked })}
            />
          </label>

          <label className="setting-row">
            <span>Triples to win</span>
            <select
              disabled={!isHost}
              value={lobby.settings.setsToWin ?? 'auto'}
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
              value={lobby.settings.theme}
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

        {!isHost && <p className="hint">Waiting for the host to start the game…</p>}
        {error && <div className="error">{error}</div>}

        <div className="lobby-actions">
          <button className="btn" onClick={leaveParty}>
            Leave
          </button>
          {isHost && (
            <button className="btn btn-primary" disabled={!canStart} onClick={handleStart}>
              {canStart
                ? lobby.round > 0
                  ? 'Start new game'
                  : 'Start game'
                : `Need ${MIN_PLAYERS}+ players`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
