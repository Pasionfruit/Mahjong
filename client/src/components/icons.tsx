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

/** A game controller, for the GameNight brand. */
export function IconController() {
  return (
    <I>
      <path d="M6.5 7h11a5 5 0 0 1 4.9 6l-.9 4.2a2.6 2.6 0 0 1-4.5 1.1L14.6 16H9.4L7 18.3a2.6 2.6 0 0 1-4.5-1.1L1.6 13a5 5 0 0 1 4.9-6Z" />
      <path d="M8 10v4M6 12h4" />
      <circle cx="15.5" cy="13" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="10.8" r="0.8" fill="currentColor" stroke="none" />
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

/** Painter's palette — drawing/party games. */
export function IconPalette() {
  return (
    <I>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="8.5" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="9.2" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A domino mask — social deduction (Mafia). */
export function IconMask() {
  return (
    <I>
      <rect x="3" y="7" width="18" height="10" rx="5" />
      <circle cx="8.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </I>
  );
}

/** Exclamation in a circle — challenge/dare. */
export function IconDare() {
  return (
    <I>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <circle cx="12" cy="16.2" r="0.7" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A bomb with a lit fuse. */
export function IconBomb() {
  return (
    <I>
      <circle cx="10.5" cy="14.5" r="6.5" />
      <path d="M15.5 9.5l2.5-2.5" />
      <path d="M18 6.5v-2M18 6.5h2M18 6.5l1.5 1.5M18 6.5l1.5-1.5" />
    </I>
  );
}

/** A little bus — "Ride the Bus". */
export function IconBus() {
  return (
    <I>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M3 11h18M8 5v6M13 5v6M17.5 5v6" />
      <circle cx="8" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A letter tile — word games (Bananagrams). */
export function IconTiles() {
  return (
    <I>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 16l3-8 3 8M10.1 13.2h3.8" />
    </I>
  );
}

/** A pawn beside a wall — Quoridor. */
export function IconQuoridor() {
  return (
    <I>
      <circle cx="8" cy="7" r="2.4" />
      <path d="M5.5 17c0-2.2 1.1-4 2.5-4s2.5 1.8 2.5 4z" />
      <path d="M17 4v13" strokeWidth={3} />
    </I>
  );
}

/** A spinning top mid-wobble — Spin Sumo. */
export function IconSpinTop() {
  return (
    <I>
      <path d="M6 8c0-2.2 2.7-4 6-4s6 1.8 6 4-2.7 4-6 4-6-1.8-6-4z" />
      <path d="M8.5 10.5L12 20l3.5-9.5" />
      <path d="M12 4V2" />
      <path d="M19.5 14.5c1 .8 1.6 1.6 1.5 2.5" />
      <path d="M4.5 14.5c-1 .8-1.6 1.6-1.5 2.5" />
    </I>
  );
}

/** A dot grid with one captured box — Dots and Boxes. */
export function IconDotsBoxes() {
  return (
    <I>
      <path d="M5 5h7M5 5v7M12 5v7M5 12h7" />
      <circle cx="5" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="19" r="1.4" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A falling T-tetromino — Tetris. */
export function IconTetromino() {
  return (
    <I>
      <rect x="3" y="8" width="6" height="6" />
      <rect x="9" y="8" width="6" height="6" />
      <rect x="15" y="8" width="6" height="6" />
      <rect x="9" y="14" width="6" height="6" />
    </I>
  );
}

/** Pac-Man with a pellet. */
export function IconPac() {
  return (
    <I>
      <path d="M20 6.8A9 9 0 1 0 20 17.2L12 12z" />
      <circle cx="17.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </I>
  );
}
