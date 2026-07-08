import { useReducer, useRef, useState } from 'react';
import type { Tile as TileT } from '@shared/tiles';
import { sortTiles } from '@shared/tiles';
import type { PublicPlayer } from '@shared/view';
import { backToLobby, pauseGame, resumeGame, sendAction } from '../socket';
import { useStore } from '../store';
import Tile from '../components/Tile';
import TimerBar from '../components/TimerBar';
import ClaimBar from '../components/ClaimBar';
import SelfActions from '../components/SelfActions';
import OpponentPanel from '../components/OpponentPanel';
import ResultOverlay from '../components/ResultOverlay';
import CenterDiscards from '../components/CenterDiscards';
import Leaderboard from '../components/Leaderboard';
import WallStrip from '../components/WallStrip';
import VolumeControl from '../components/VolumeControl';
import { IconMenu, IconPause, IconWall } from '../components/icons';
import { FlowerRow, MeldRow } from '../components/rows';

export default function GameTable() {
  const game = useStore((s) => s.game);
  const lobby = useStore((s) => s.lobby);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const orderRef = useRef<number[]>([]);
  const dragId = useRef<number | null>(null);
  const [, forceOrder] = useReducer((x: number) => x + 1, 0);
  if (!game || !lobby) return null;

  const n = game.players.length;
  const me = game.players.find((p) => p.seat === game.yourSeat)!;
  const isHost = lobby.players.find((p) => p.seat === lobby.yourSeat)?.isHost ?? false;
  const rel = (r: number): PublicPlayer => game.players[(game.yourSeat + r) % n]!;

  let top: PublicPlayer | null = null;
  let left: PublicPlayer | null = null;
  let right: PublicPlayer | null = null;
  if (n === 2) top = rel(1);
  else if (n === 3) {
    right = rel(1);
    left = rel(2);
  } else {
    right = rel(1);
    top = rel(2);
    left = rel(3);
  }

  const turnPlayer = game.players[game.turnSeat];
  const canDiscard = game.yourOptions.canDiscard && !game.paused;
  const drawnTile = game.hand.find((t) => t.id === game.drawnTileId) ?? null;
  const handTiles = game.hand.filter((t) => t.id !== game.drawnTileId);

  // Reconcile the player's custom order against the current hand: keep known
  // tiles in their chosen order, append newly-drawn/claimed tiles (sorted).
  const handIds = new Set(handTiles.map((t) => t.id));
  let order = orderRef.current.filter((id) => handIds.has(id));
  const known = new Set(order);
  for (const t of handTiles) if (!known.has(t.id)) order.push(t.id);
  orderRef.current = order;
  const byId = new Map(handTiles.map((t) => [t.id, t]));
  const orderedHand = order.map((id) => byId.get(id)!).filter(Boolean);

  function resetSort() {
    orderRef.current = sortTiles(handTiles).map((t) => t.id);
    forceOrder();
  }

  function onDrop(targetId: number) {
    const from = dragId.current;
    dragId.current = null;
    if (from === null || from === targetId) return;
    const arr = orderRef.current.slice();
    const fromIdx = arr.indexOf(from);
    const toIdx = arr.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, from);
    orderRef.current = arr;
    forceOrder();
  }

  function tileClick(tileId: number) {
    if (!canDiscard) return;
    if (selectedId === tileId) {
      setSelectedId(null);
      void sendAction({ t: 'discard', tileId });
    } else {
      setSelectedId(tileId);
    }
  }

  const activeClaimable = game.phase === 'claimWindow';
  const tickAudible =
    (game.turnSeat === game.yourSeat && game.phase === 'awaitingDiscard') ||
    game.yourOptions.claim !== null;

  // Pointer angle toward the acting seat's position on screen.
  const relTurn = (game.turnSeat - game.yourSeat + n) % n;
  const ANGLES: Record<number, number[]> = {
    2: [180, 0],
    3: [180, 90, 270],
    4: [180, 90, 0, 270],
  };
  const arrowAngle = ANGLES[n]?.[relTurn] ?? 0;

  return (
    <div className="game-table">
      <Leaderboard players={game.players} turnSeat={game.turnSeat} />
      <div className="hud">
        <div className="hud-line">
          <span className="hud-round">Round {game.round}</span>
          <span className="hud-wall">
            <IconWall /> {game.wallCount}
          </span>
        </div>
        <div className="hud-goal">
          {game.setsToWin} triples · {game.setsToWin + 2} doubles
        </div>
        <TimerBar deadline={game.paused ? null : game.deadline} tickAudible={tickAudible} />
        <VolumeControl />
        <div className="hud-menu">
          <button className="btn hud-btn" onClick={() => setMenuOpen((o) => !o)}>
            <IconMenu /> Menu
          </button>
          {menuOpen && (
            <div className="hud-dropdown">
              {isHost ? (
                <>
                  {game.paused ? (
                    <button className="btn" onClick={() => void resumeGame().then(() => setMenuOpen(false))}>
                      Resume
                    </button>
                  ) : (
                    <button className="btn" onClick={() => void pauseGame().then(() => setMenuOpen(false))}>
                      Pause
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={() => {
                      if (confirm('End the game and return everyone to the lobby?')) {
                        void backToLobby();
                      }
                      setMenuOpen(false);
                    }}
                  >
                    End game
                  </button>
                </>
              ) : (
                <span className="hint">Only the host can pause or end.</span>
              )}
            </div>
          )}
        </div>
      </div>

      {top && (
        <div className="seat-top">
          <OpponentPanel player={top} isTurn={game.turnSeat === top.seat} />
        </div>
      )}
      {left && (
        <div className="seat-left">
          <OpponentPanel player={left} isTurn={game.turnSeat === left.seat} />
        </div>
      )}
      {right && (
        <div className="seat-right">
          <OpponentPanel player={right} isTurn={game.turnSeat === right.seat} />
        </div>
      )}

      <div className="table-center">
        <WallStrip count={game.wallCount} />
        <div className="center-turn">
          {activeClaimable && game.lastDiscard ? (
            <div className="turn-label">{game.players[game.lastDiscard.seat]?.nickname} discarded</div>
          ) : (
            <div className="turn-label">
              {game.turnSeat === game.yourSeat ? 'Your turn' : `${turnPlayer?.nickname}'s turn`}
            </div>
          )}
        </div>
        <CenterDiscards
          pile={game.discardPile}
          activeClaimable={activeClaimable}
          arrowAngle={arrowAngle}
        />
      </div>

      <div className={`seat-bottom${game.turnSeat === game.yourSeat ? ' active-turn' : ''}`}>
        <div className="my-table-row">
          <MeldRow melds={me.melds} size="sm" />
          <FlowerRow flowers={me.flowers} />
        </div>

        <div className="action-area">
          {game.yourOptions.claim ? (
            <ClaimBar claim={game.yourOptions.claim} />
          ) : (
            <SelfActions options={game.yourOptions} hand={game.hand} />
          )}
        </div>

        <div className="my-hand">
          <div className="panel-header">
            <span className="player-name">
              {me.nickname} {me.isDealer && <span className="dealer-badge">dealer</span>}
            </span>
            <button className="btn sort-btn" onClick={resetSort}>
              Sort
            </button>
            {canDiscard && <span className="hint">drag to reorder · tap twice to discard</span>}
          </div>
          <div className="hand-row">
            {orderedHand.map((t) => (
              <div
                key={t.id}
                className="hand-slot"
                draggable
                onDragStart={() => (dragId.current = t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(t.id)}
              >
                <Tile
                  kind={t.kind}
                  size="md"
                  selected={selectedId === t.id}
                  onClick={canDiscard ? () => tileClick(t.id) : undefined}
                />
              </div>
            ))}
            {drawnTile && (
              <div className="drawn-slot">
                <span className="drawn-label">drawn</span>
                <Tile
                  kind={drawnTile.kind}
                  size="lg"
                  selected={selectedId === drawnTile.id}
                  onClick={canDiscard ? () => tileClick(drawnTile.id) : undefined}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {game.paused && !game.result && (
        <div className="overlay">
          <div className="overlay-card pause-card">
            <h2>
              <IconPause /> Game paused
            </h2>
            {isHost ? (
              <button className="btn btn-primary" onClick={() => void resumeGame()}>
                Resume
              </button>
            ) : (
              <p className="hint">Waiting for the host to resume…</p>
            )}
          </div>
        </div>
      )}

      {game.result && <ResultOverlay game={game} isHost={isHost} />}
    </div>
  );
}
