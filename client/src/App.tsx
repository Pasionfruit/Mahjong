import { useStore, currentScreen } from './store';
import Landing from './screens/Landing';
import Lobby from './screens/Lobby';
import GameTable from './screens/GameTable';

export default function App() {
  const lobby = useStore((s) => s.lobby);
  const game = useStore((s) => s.game);
  const connected = useStore((s) => s.connected);
  const screen = currentScreen(lobby, game);
  const theme = lobby?.settings.theme ?? 'jade';

  return (
    <div className="app" data-theme={theme}>
      {!connected && <div className="conn-banner">Reconnecting to server…</div>}
      {screen === 'landing' && <Landing />}
      {screen === 'lobby' && <Lobby />}
      {screen === 'game' && <GameTable />}
    </div>
  );
}
