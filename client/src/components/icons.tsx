import type { ReactNode } from 'react';

/** Minimalist 24×24 stroke icons; size follows the surrounding font-size. */
function I({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="icon"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function IconTrophy() {
  return (
    <I>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </I>
  );
}

export function IconBot() {
  return (
    <I>
      <path d="M12 8V5.5" />
      <circle cx="12" cy="4" r="1.2" />
      <rect x="4" y="8" width="16" height="12" rx="3" />
      <path d="M9 14h.01M15 14h.01" />
    </I>
  );
}

export function IconMenu() {
  return (
    <I>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </I>
  );
}

export function IconPause() {
  return (
    <I>
      <path d="M9 5v14M15 5v14" />
    </I>
  );
}

export function IconVolume() {
  return (
    <I>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
    </I>
  );
}

export function IconMute() {
  return (
    <I>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </I>
  );
}

export function IconClose() {
  return (
    <I>
      <path d="M18 6 6 18M6 6l12 12" />
    </I>
  );
}

/** A short stack of tiles, for the wall counter. */
export function IconWall() {
  return (
    <I>
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
      <rect x="8" y="3" width="8" height="8" rx="1.5" />
    </I>
  );
}

/** A single upright tile, for the landing title. */
export function IconTile() {
  return (
    <I>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <circle cx="12" cy="12" r="3" />
    </I>
  );
}

/** A 3×3 grid, for tic-tac-toe style games. */
export function IconGrid() {
  return (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </I>
  );
}
