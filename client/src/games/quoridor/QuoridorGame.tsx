import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { play } from '../../audio';
import { useStore } from '../../store';
import VolumeControl from '../../components/VolumeControl';
import { IconMenu, IconTrophy } from '../../components/icons';
import {
  WALLS_PER_PLAYER,
  applyMove,
  cellIndex,
  deserialize,
  goalDistanceField,
  legalMoves,
  moveNotation,
  newGame,
  pawnMoves,
  serialize,
  undoMove,
  type Move,
  type PlayerIndex,
  type Pos,
  type QuoridorState,
} from './engine';
import { AI_NAMES, type AiDifficulty } from './ai/chooser';
import { disposeAiWorker, requestAiMove } from './ai/client';
import { positionKey } from './ai/search';
import QuoridorBoard, { PawnGlyph } from './Board';

type Mode = { kind: 'local' } | { kind: 'ai'; difficulty: AiDifficulty };

const SAVE_KEY = 'quoridor.save';
const SETUP_KEY = 'quoridor.setup';
/** Even an instant AI reply waits this long — instant moves feel broken. */
const MIN_THINK_MS = 450;
/** In vs-AI games the human plays the bottom pawn; the bot opens. */
const AI_SEAT: PlayerIndex = 0;

interface SaveBlob {
  mode: Mode;
  state: string;
}

function loadSave(): { mode: Mode; state: QuoridorState } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as SaveBlob;
    if (blob.mode?.kind !== 'local' && blob.mode?.kind !== 'ai') return null;
    if (
      blob.mode.kind === 'ai' &&
      !['easy', 'medium', 'hard'].includes((blob.mode as { difficulty?: string }).difficulty ?? '')
    ) {
      return null;
    }
    const state = deserialize(blob.state);
    if (!state || state.winner !== null) return null;
    return { mode: blob.mode, state };
  } catch {
    return null;
  }
}

function playerName(mode: Mode, player: PlayerIndex): string {
  if (mode.kind === 'ai') return player === AI_SEAT ? AI_NAMES[mode.difficulty] : 'You';
  return player === 0 ? 'Player 1' : 'Player 2';
}

/** The pawn move that best shortens the current player's path (hints). */
function bestPawnStep(s: QuoridorState): Pos | null {
  const field = goalDistanceField(s, s.turn);
  let best: Pos | null = null;
  let bestD = Infinity;
  for (const to of pawnMoves(s, s.turn)) {
    const d = field[cellIndex(to.r, to.c)]!;
    const dd = d === -1 ? 99 : d;
    if (dd < bestD) {
      best = to;
      bestD = dd;
    }
  }
  return best;
}

// ── setup screen ────────────────────────────────────────────────────────────

function Setup({
  onStart,
  onResume,
  hasSave,
}: {
  onStart: (mode: Mode) => void;
  onResume: () => void;
  hasSave: boolean;
}) {
  const [kind, setKind] = useState<'local' | 'ai'>('ai');
  const [difficulty, setDifficulty] = useState<AiDifficulty>('medium');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETUP_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { kind?: string; difficulty?: string };
      if (saved.kind === 'local' || saved.kind === 'ai') setKind(saved.kind);
      if (saved.difficulty === 'easy' || saved.difficulty === 'medium' || saved.difficulty === 'hard') {
        setDifficulty(saved.difficulty);
      }
    } catch {
      /* defaults */
    }
  }, []);

  function start() {
    localStorage.setItem(SETUP_KEY, JSON.stringify({ kind, difficulty }));
    onStart(kind === 'local' ? { kind: 'local' } : { kind: 'ai', difficulty });
  }

  return (
    <div className="quor-setup">
      <div className="lobby-card">
        <h2 className="quor-setup-title">Quoridor</h2>
        <p className="hint">
          Race your pawn to the far side — or spend a wall to send your rival the long way round.
        </p>

        <h2 className="section-title">Mode</h2>
        <div className="quor-mode-grid">
          <button
            className={`quor-mode-card${kind === 'ai' ? ' selected' : ''}`}
            onClick={() => setKind('ai')}
          >
            <span className="quor-mode-name">vs Computer</span>
            <span className="quor-mode-tag">You take the bottom pawn</span>
          </button>
          <button
            className={`quor-mode-card${kind === 'local' ? ' selected' : ''}`}
            onClick={() => setKind('local')}
          >
            <span className="quor-mode-name">Local 2 players</span>
            <span className="quor-mode-tag">Share this device, take turns</span>
          </button>
        </div>

        {kind === 'ai' && (
          <>
            <h2 className="section-title">Difficulty</h2>
            <div className="quor-mode-grid three">
              {(
                [
                  ['easy', 'Easy', 'Wanders, rarely walls'],
                  ['medium', 'Medium', 'Plans a move or two ahead'],
                  ['hard', 'Hard', 'Searches deep, punishes mistakes'],
                ] as const
              ).map(([d, label, blurb]) => (
                <button
                  key={d}
                  className={`quor-mode-card${difficulty === d ? ' selected' : ''}`}
                  onClick={() => setDifficulty(d)}
                >
                  <span className="quor-mode-name">{label}</span>
                  <span className="quor-mode-tag">{blurb}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="quor-setup-actions">
          {hasSave && (
            <button className="btn" onClick={onResume}>
              Resume game
            </button>
          )}
          <button className="btn btn-primary" onClick={start}>
            Start game
          </button>
        </div>

        <h2 className="section-title">How to play</h2>
        <div className="howto-body quor-rules">
          <p>
            Each turn: step your pawn one square, or place one of your 10 walls. Walls block both
            players — but may never seal anyone's last route. Face-to-face pawns can be jumped.
            First to the opposite edge wins.
          </p>
        </div>

        <div className="lobby-actions">
          <button className="btn" onClick={() => useStore.getState().setLocalGame(null)}>
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── game screen ─────────────────────────────────────────────────────────────

export default function QuoridorGame() {
  const [mode, setMode] = useState<Mode | null>(null);
  const gameRef = useRef<QuoridorState>(newGame());
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<Pos | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showWin, setShowWin] = useState(false);
  const recentKeys = useRef<number[]>([]);
  const hintTimer = useRef(0);
  const winTimer = useRef(0);
  const [hasSave, setHasSave] = useState(() => loadSave() !== null);

  const game = gameRef.current;

  useEffect(
    () => () => {
      disposeAiWorker();
      window.clearTimeout(hintTimer.current);
      window.clearTimeout(winTimer.current);
    },
    [],
  );

  const persist = useCallback(
    (m: Mode) => {
      const s = gameRef.current;
      if (s.winner !== null) {
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
      } else {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ mode: m, state: serialize(s) } satisfies SaveBlob));
        setHasSave(true);
      }
    },
    [],
  );

  const humanTurn =
    mode !== null &&
    game.winner === null &&
    !(mode.kind === 'ai' && game.turn === AI_SEAT) &&
    !thinking;

  /** Apply a validated move with sounds, persistence, and win staging. */
  const commitMove = useCallback(
    (move: Move, m: Mode) => {
      const s = gameRef.current;
      if (!applyMove(s, move)) {
        play('hurt');
        return false;
      }
      recentKeys.current = [...recentKeys.current.slice(-11), positionKey(s)];
      play(move.t === 'pawn' ? 'draw' : 'discard');
      setHint(null);
      persist(m);
      if (s.winner !== null) {
        // Let the final slide land before the overlay + jingle.
        winTimer.current = window.setTimeout(() => {
          setShowWin(true);
          const humanLost = m.kind === 'ai' && s.winner === AI_SEAT;
          play(humanLost ? 'lose' : 'win');
        }, 900);
      }
      bump();
      return true;
    },
    [persist],
  );

  // AI turns: think off-thread, land with a natural delay, chime on handback.
  useEffect(() => {
    if (!mode || mode.kind !== 'ai') return;
    const s = gameRef.current;
    if (s.winner !== null || s.turn !== AI_SEAT) return;
    let cancelled = false;
    setThinking(true);
    const t0 = performance.now();
    void requestAiMove(s, mode.difficulty, recentKeys.current).then(({ move }) => {
      if (cancelled) return;
      const wait = Math.max(0, MIN_THINK_MS - (performance.now() - t0));
      window.setTimeout(() => {
        if (cancelled) return;
        setThinking(false);
        const current = gameRef.current;
        if (current !== s || current.turn !== AI_SEAT || current.winner !== null) return;
        if (!commitMove(move, mode)) {
          // Never happens (AI is validated), but never let the game hang.
          const fallback = legalMoves(current)[0];
          if (fallback) commitMove(fallback, mode);
        }
        if (gameRef.current.winner === null) play('yourTurn');
      }, wait);
    });
    return () => {
      cancelled = true;
      setThinking(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, mode]);

  function startGame(m: Mode, resume = false) {
    window.clearTimeout(winTimer.current);
    setShowWin(false);
    setThinking(false);
    setHint(null);
    if (!resume) {
      gameRef.current = newGame();
      recentKeys.current = [positionKey(gameRef.current)];
      localStorage.removeItem(SAVE_KEY);
      setHasSave(false);
    }
    setMode(m);
    bump();
  }

  function resumeSave() {
    const save = loadSave();
    if (!save) return;
    gameRef.current = save.state;
    recentKeys.current = [positionKey(save.state)];
    startGame(save.mode, true);
  }

  function restart() {
    if (game.history.length > 0 && game.winner === null) {
      if (!confirm('Restart the game?')) return;
    }
    if (mode) startGame(mode);
  }

  /** Undo one decision: in AI games, rewind to the human's previous turn. */
  function undo() {
    if (!mode || thinking) return;
    const s = gameRef.current;
    window.clearTimeout(winTimer.current);
    setShowWin(false);
    if (!undoMove(s)) return;
    if (mode.kind === 'ai') {
      while (s.history.length > 0 && s.turn === AI_SEAT) undoMove(s);
    }
    recentKeys.current = recentKeys.current.slice(0, Math.max(1, recentKeys.current.length - 1));
    setHint(null);
    persist(mode);
    bump();
  }

  function showHint() {
    if (!humanTurn) return;
    const best = bestPawnStep(gameRef.current);
    if (!best) return;
    setHint(best);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 1600);
  }

  function leave() {
    useStore.getState().setLocalGame(null);
  }

  if (!mode) {
    return <Setup onStart={startGame} onResume={resumeSave} hasSave={hasSave} />;
  }

  const winnerName = game.winner !== null ? playerName(mode, game.winner) : null;
  const status =
    game.winner !== null
      ? ''
      : thinking
        ? `${playerName(mode, AI_SEAT)} is thinking…`
        : `${playerName(mode, game.turn)} to move`;

  return (
    <div className="quor">
      <div className="quor-hud">
        <div className="quor-hud-left">
          <span className="quor-hud-title">Quoridor</span>
          <span className="quor-hud-status">{status}</span>
        </div>
        <div className="hud-menu">
          <button className="btn hud-btn" onClick={() => setMenuOpen((o) => !o)}>
            <IconMenu /> Menu
          </button>
          {menuOpen && (
            <div className="hud-dropdown">
              <div className="menu-section">
                <span className="menu-section-title">Sound</span>
                <VolumeControl />
              </div>
              <button
                className="btn"
                onClick={() => {
                  restart();
                  setMenuOpen(false);
                }}
              >
                Restart
              </button>
              <button
                className="btn"
                onClick={() => {
                  setMenuOpen(false);
                  setMode(null);
                }}
              >
                Change mode
              </button>
              <button className="btn" onClick={leave}>
                Leave
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="quor-arena">
        <QuoridorBoard
          game={game}
          version={version}
          interactive={humanTurn}
          onMove={(move) => {
            if (humanTurn) commitMove(move, mode);
          }}
          hint={hint}
          winner={game.winner}
        />

        <div className="quor-side">
          {([0, 1] as const).map((p) => (
            <div
              key={p}
              className={`quor-player-card${game.turn === p && game.winner === null ? ' active' : ''}`}
            >
              <div className="quor-player-row">
                <span className="quor-player-pawn">
                  <PawnGlyph player={p} />
                </span>
                <span className="quor-player-name">{playerName(mode, p)}</span>
                {mode.kind === 'ai' && p === AI_SEAT && thinking && (
                  <span className="quor-thinking" title="AI thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
              <div className="quor-wallstack" title={`${game.wallsLeft[p]} walls left`}>
                {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
                  <i key={i} className={i < game.wallsLeft[p]! ? '' : 'spent'} />
                ))}
              </div>
            </div>
          ))}

          <div className="quor-actions">
            <button className="btn" disabled={game.history.length === 0 || thinking} onClick={undo}>
              Undo
            </button>
            <button className="btn" disabled={!humanTurn} onClick={showHint}>
              Hint
            </button>
            <button className="btn" onClick={restart}>
              Restart
            </button>
          </div>

          {game.history.length > 0 && (
            <div className="quor-history">
              {game.history.map((h, i) => (
                <span key={i} className={`quor-move p${h.player}`}>
                  {i + 1}. {moveNotation(h.move)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {showWin && game.winner !== null && (
        <div className="overlay">
          <div className="overlay-card">
            <h2>
              <IconTrophy /> {winnerName} wins!
            </h2>
            <p className="hint">
              {game.history.length} moves ·{' '}
              {20 - game.wallsLeft[0]! - game.wallsLeft[1]!} walls placed
            </p>
            <div className="overlay-actions">
              <button className="btn" onClick={() => setMode(null)}>
                Change mode
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowWin(false);
                  undo();
                }}
              >
                Undo last move
              </button>
              <button className="btn btn-primary" onClick={() => startGame(mode)}>
                Play again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
