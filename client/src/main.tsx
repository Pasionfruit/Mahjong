import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/inter';
import App from './App';
import './socket';
// Side effects: app-wide click/hover sounds + background music unlock.
import './audio';
import './styles/app.css';

// Install/refresh the service worker; autoUpdate silently swaps in new builds.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
