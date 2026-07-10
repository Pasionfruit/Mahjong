import { useStore, currentScreen } from './store';
import Home from './screens/Home';
import { gameById } from './games/catalog';

export default function App() {
  const lobby = useStore((s) => s.lobby);
  const game = useStore((s) => s.game);
  const connected = useStore((s) => s.connected);
  const screen = currentScreen(lobby, game);
  const theme = lobby?.settings.theme ?? 'jade';

  // In a room, render the screens registered for that room's game.
  const screens = lobby ? gameById(lobby.gameId)?.screens : undefined;

  let content;
  if (screen === 'home' || !screens) {
    content = <Home />;
  } else if (screen === 'game') {
    content = <screens.Game />;
  } else {
    content = <screens.Lobby />;
  }

  return (
    <div className="app" data-theme={theme}>
      {!connected && <div className="conn-banner">Reconnecting to server…</div>}
      {content}
    </div>
  );
}
