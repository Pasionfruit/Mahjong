import { useState } from 'react';
import { BOT_DIFFICULTIES } from '@shared/settings';
import { addBot, leaveParty, removeBot, startGame } from '../socket';
import { IconBot, IconClose, IconTrophy } from '../components/icons';
import { useStore } from '../store';
import { gameById } from '../games/catalog';

/** Game-agnostic lobby shell: room code, players, bots, and the game's own
 *  settings panel (looked up from the catalog by gameId). */
export default function Lobby() {
  const lobby = useStore((s) => s.lobby);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  if (!lobby) return null;

  const me = lobby.players.find((p) => p.seat === lobby.yourSeat);
  const isHost = me?.isHost ?? false;
  const { minPlayers, maxPlayers } = lobby;
  const canStart = lobby.players.length >= minPlayers && lobby.players.length <= maxPlayers;
  const entry = gameById(lobby.gameId);
  const SettingsPanel = entry?.SettingsPanel;

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
            <div className="room-code-label">{entry?.name ?? 'Room'} · code</div>
            <div className="room-code">{lobby.roomCode}</div>
          </div>
          <button className="btn" onClick={copyCode}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <h2 className="section-title">
          Players ({lobby.players.length}/{maxPlayers})
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
                  onClick={() => void removeBot(p.seat).then((r) => setError(r.ok ? null : r.error))}
                >
                  <IconClose />
                </button>
              )}
            </li>
          ))}
        </ul>

        {isHost && lobby.players.length < maxPlayers && (
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

        {SettingsPanel && <SettingsPanel />}

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
                : `Need ${minPlayers}+ players`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
