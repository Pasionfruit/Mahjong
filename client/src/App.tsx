import { useStore, currentScreen } from './store';
import Home from './screens/Home';
import Lobby from './screens/Lobby';
import { gameById } from './games/catalog';
import { useMode } from './mode';
import WingNav from './components/WingNav';

export default function App() {
  const lobby = useStore((s) => s.lobby);
  const game = useStore((s) => s.game);
  const connected = useStore((s) => s.connected);
  const localGame = useStore((s) => s.localGame);
  const mode = useMode();
  const screen = currentScreen(lobby, game);
  const theme = lobby && 'theme' in lobby.settings ? lobby.settings.theme : 'jade';

  const LocalGame = localGame ? gameById(localGame)?.Game : undefined;
  const Game = lobby ? gameById(lobby.gameId)?.Game : undefined;

  let content;
  if (LocalGame) {
    // Device-local games take priority: a lobby state arriving mid-game
    // (e.g. another tab's room session) must never unmount the board.
    content = <LocalGame />;
  } else if (screen === 'home') {
    content = <Home />;
  } else if (screen === 'game' && Game) {
    content = <Game />;
  } else {
    content = <Lobby />;
  }

  return (
    <>
      <div className="app" data-theme={theme} data-mode={mode}>
        {!connected && <div className="conn-banner">Reconnecting to server…</div>}
        {content}
      </div>
      {/* A sibling of .app, not a child: .app is the scrolling container
          (overflow: auto), and nesting a position:fixed element inside a
          scrolling ancestor is a known iOS Safari bug — the fixed element
          can fail to stay truly pinned to the viewport, which is exactly
          the "gap below the bottom nav in standalone/home-screen mode" bug.
          Living outside .app's scroll box sidesteps it entirely. Still
          survives every route (games included); hidden on wide viewports
          via CSS. */}
      <WingNav dock />
    </>
  );
}
