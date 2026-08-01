import { useSyncExternalStore } from 'react';

/**
 * App-wide light/dark appearance ("cozy cabin" / "harbor haze"), independent
 * of the per-room game themes. Persisted per device; defaults to the OS
 * preference on first launch.
 */

export type Mode = 'light' | 'dark';

const STORAGE_KEY = 'localrot-mode';

/** Browser-chrome color per mode — kept in sync with the CSS palettes. */
const THEME_COLOR: Record<Mode, string> = { dark: '#1c2b3a', light: '#e3c2a0' };

function initialMode(): Mode {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let mode: Mode = initialMode();
const listeners = new Set<() => void>();

/** Reflect the mode outside React's tree: the page canvas behind .app and
 *  the browser UI color, so overscroll/PWA chrome never flashes wrong. */
function reflect(): void {
  document.documentElement.dataset.mode = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[mode]);
}
reflect();

export function getMode(): Mode {
  return mode;
}

export function setMode(next: Mode): void {
  if (next === mode) return;
  mode = next;
  localStorage.setItem(STORAGE_KEY, next);
  reflect();
  listeners.forEach((l) => l());
}

export function useMode(): Mode {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => mode,
  );
}
