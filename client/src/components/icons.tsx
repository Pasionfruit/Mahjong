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

export function IconPlay() {
  return (
    <I>
      <path d="M8 5.5 18.5 12 8 18.5Z" fill="currentColor" />
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

/** A game controller, for the LocalRot brand. */
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

/** A die showing five — Party Board. */
export function IconDie() {
  return (
    <I>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.3" fill="currentColor" stroke="none" />
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

/** Three letter tiles, one lit — Word Guess. */
export function IconWordTiles() {
  return (
    <I>
      <rect x="2" y="9" width="6" height="6" rx="1.2" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="16" y="9" width="6" height="6" rx="1.2" />
    </I>
  );
}

/** A mine with spikes — Minesweeper. */
export function IconMine() {
  return (
    <I>
      <circle cx="12" cy="13" r="6" />
      <path d="M12 3v3M12 20v1M3 13h2M19 13h2M5.5 6.5l1.5 1.5M18.5 6.5l-1.5 1.5" />
      <circle cx="9.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </I>
  );
}

/** Four merging tiles — 2048. */
export function IconMergeTiles() {
  return (
    <I>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.4" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.4" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.4" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.4" fill="currentColor" stroke="none" />
    </I>
  );
}

/** An hourglass of falling grains — Sand Play. */
export function IconHourglass() {
  return (
    <I>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 4 3.5 6 5 8-1.5 2-5 4-5 8M17 3c0 4-3.5 6-5 8 1.5 2 5 4 5 8" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A plump bird mid-flap between two pipes — Flappy Bird. */
/** Pixel t-rex silhouette — Dino Run. */
export function IconDino() {
  return (
    <I>
      <path
        fill="currentColor"
        stroke="none"
        fillRule="evenodd"
        d="M13 2h8v7h-5v2h4v3h-5v3h2v3h-3v-3h-2v5h-3v-5l-4-2-3 3-2-2 5-4V9l8-2V2Zm2 2h2v2h-2V4Z"
      />
    </I>
  );
}

export function IconFlappy() {
  return (
    <I>
      <path d="M3 3v7M3 14v7M21 3v5M21 12v9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M8.5 11.5c-1.5-.5-2-2-1.5-3" />
      <circle cx="13.5" cy="10.8" r="0.8" fill="currentColor" stroke="none" />
      <path d="M16 12.5h2" />
    </I>
  );
}

/** A springy platform bounce — Doodle Jump. */
export function IconSpring() {
  return (
    <I>
      <path d="M5 20h6M13 12h6" />
      <circle cx="8" cy="12" r="2.5" />
      <path d="M8 14.5V17M6.5 20L8 17l1.5 3" />
      <path d="M14 8l2-2 2 2M16 6v4" />
    </I>
  );
}

/** A paddle, ball, and brick row — Brick Breaker. */
export function IconPaddle() {
  return (
    <I>
      <rect x="3" y="4" width="5" height="3" rx="0.8" />
      <rect x="9.5" y="4" width="5" height="3" rx="0.8" />
      <rect x="16" y="4" width="5" height="3" rx="0.8" />
      <circle cx="12" cy="13" r="1.6" />
      <rect x="7" y="18" width="10" height="2.5" rx="1.2" />
    </I>
  );
}

/** A ball banking through round pegs — Peggle. */
export function IconPegs() {
  return (
    <I>
      <circle cx="12" cy="4" r="1.8" />
      <path d="M12 6.5c0 3-4.5 3.5-4.5 7" strokeDasharray="1.5 2" />
      <circle cx="6" cy="10" r="1.4" />
      <circle cx="17" cy="9" r="1.4" />
      <circle cx="12" cy="14" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="15" r="1.4" />
      <path d="M8 21h8l-1-3h-6z" />
    </I>
  );
}

/** A cat face atop a pogo spring — Pogo Cat. */
export function IconPogoCat() {
  return (
    <I>
      <path d="M8 4l1.5 2h5L16 4v4.5a4 4 0 0 1-8 0z" />
      <circle cx="10" cy="8" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="14" cy="8" r="0.7" fill="currentColor" stroke="none" />
      <path d="M12 13v2M10 17h4M10.5 15h3M12 19v2M9 21h6" />
    </I>
  );
}

/** Three flasks of layered liquid — Magic Sort. */
export function IconFlasks() {
  return (
    <I>
      <path d="M5 3v6l-2 8a2.5 2.5 0 0 0 2.4 3h.2" />
      <path d="M9 3v6l2 8" />
      <path d="M7 3h4" />
      <path d="M4 13h4" />
      <path d="M15 3v14a3 3 0 0 0 6 0V3" />
      <path d="M14 3h8M15 11h6M15 15h6" />
    </I>
  );
}

/** Two crossing ropes with pin ends — Rope Untangle. */
export function IconKnot() {
  return (
    <I>
      <circle cx="5" cy="5" r="1.6" />
      <circle cx="19" cy="5" r="1.6" />
      <circle cx="5" cy="19" r="1.6" />
      <circle cx="19" cy="19" r="1.6" />
      <path d="M6.2 6.2c4 4 7.6 8.6 11.6 11.6" />
      <path d="M17.8 6.2C15 9 11 10.5 6.2 17.8" />
    </I>
  );
}

/** A numbered grid with brush — Paint by Number. */
export function IconPaintGrid() {
  return (
    <I>
      <rect x="3" y="3" width="13" height="13" rx="1.5" />
      <path d="M3 9.5h13M9.5 3v13" />
      <rect x="4.5" y="4.5" width="3.5" height="3.5" fill="currentColor" stroke="none" rx="0.5" />
      <path d="M20.5 3.5L14 10l-1 3 3-1 6.5-6.5a1.4 1.4 0 0 0-2-2z" />
      <path d="M15 19.5h.01" />
    </I>
  );
}

/** A 9×9 grid with a lone digit cell — Sudoku. */
export function IconSudoku() {
  return (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      <circle cx="6" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A car boxed in on a grid — Parking Jam. */
export function IconCar() {
  return (
    <I>
      <path d="M5 12l1.5-4.5A2 2 0 0 1 8.4 6h7.2a2 2 0 0 1 1.9 1.5L19 12" />
      <rect x="4" y="12" width="16" height="5" rx="1.5" />
      <circle cx="8" cy="17" r="1.6" />
      <circle cx="16" cy="17" r="1.6" />
      <path d="M3 3h2M19 3h2" />
    </I>
  );
}

/** A tiny crossword grid — Crossword Mini. */
export function IconCrossword() {
  return (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M10.2 3v18M17.4 3v18M3 10.2h18M3 17.4h18" />
      <rect x="10.2" y="3" width="7.2" height="7.2" fill="currentColor" stroke="none" />
      <rect x="3" y="10.2" width="7.2" height="7.2" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A calendar page with a check — the Daily wing. */
export function IconCalendarCheck() {
  return (
    <I>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M9 15.5l2 2 4-4" />
    </I>
  );
}

/** A sun — light mode. */
/** A compact keyboard — Word Type. */
export function IconKeyboard() {
  return (
    <I>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" />
    </I>
  );
}

export function IconGear() {
  return (
    <I>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.88 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.88V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z" />
    </I>
  );
}

export function IconSun() {
  return (
    <I>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
    </I>
  );
}

/** A crescent moon — dark mode. */
export function IconMoon() {
  return (
    <I>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
    </I>
  );
}

/** Two joined chain links — the Connect wing. */
export function IconLink() {
  return (
    <I>
      <path d="M10.5 13.5a4 4 0 0 0 6 .4l2.6-2.6a4 4 0 1 0-5.7-5.7l-1.3 1.3" />
      <path d="M13.5 10.5a4 4 0 0 0-6-.4l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.3-1.3" />
    </I>
  );
}

/** A party popper mid-burst — the Party wing. */
export function IconPartyPopper() {
  return (
    <I>
      <path d="M5.2 12.6L3 21l8.4-2.2z" />
      <path d="M8 12l4 4" />
      <path d="M13 9.5c1.5-1.5 3-1.8 4.5-.8" />
      <path d="M14.5 6c.3-1.6 1.3-2.5 3-2.7" />
      <circle cx="15" cy="13.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="8.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="19.5" cy="9" r="0.9" fill="currentColor" stroke="none" />
    </I>
  );
}

/** A lotus bloom — the Zen wing. */
export function IconZenLotus() {
  return (
    <I>
      <path d="M12 6.5c1.6 1.7 2.4 3.6 2.4 5.6 0 2.5-1 4.4-2.4 5.9-1.4-1.5-2.4-3.4-2.4-5.9 0-2 .8-3.9 2.4-5.6z" />
      <path d="M6 9.5c2 .4 3.4 1.4 4.3 2.8M18 9.5c-2 .4-3.4 1.4-4.3 2.8" />
      <path d="M3.5 13.5C5 17 8 18.9 12 18.9s7-1.9 8.5-5.4" />
    </I>
  );
}

/** A person bust — the Profile wing. */
export function IconUser() {
  return (
    <I>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </I>
  );
}

/** A magnifying glass over a letter grid — Word Search. */
export function IconWordSearch() {
  return (
    <I>
      <path d="M4 4h9v9H4z" />
      <path d="M7 4v9M4 7.3h9" />
      <circle cx="16.5" cy="16.5" r="4" />
      <path d="M19.4 19.4 22 22" />
    </I>
  );
}

/** A small pennant on a post — personal flag marker. */
export function IconFlag() {
  return (
    <I>
      <path d="M6 21V4" />
      <path d="M6 4h12l-3.5 4L18 12H6" />
    </I>
  );
}

/** A grid of cells with a mine peeking out — Minefield. */
export function IconMinefield() {
  return (
    <I>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />
      <path d="M12 8v1M12 15v1M8 12h1M15 12h1M9.3 9.3l.7.7M14 14l.7.7M14.7 9.3l-.7.7M9.3 14.7l.7-.7" />
    </I>
  );
}

/**
 * A cat curled up asleep on top of a game controller — the LocalRot mark.
 * Pure outline (no fills), and deliberately a lighter stroke than the
 * shared `I` wrapper's 2px: this carries more internal detail than a
 * typical nav glyph, and at 2px the shapes bleed into each other.
 */
export function IconCatOnController() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="icon"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Gamepad: one closed outline — grips, bottom edge and all. */}
      <path d="M6.5 11h11a5 5 0 0 1 4.9 6l-.9 4.2a2.6 2.6 0 0 1-4.5 1.1L14.6 20H9.4L7 22.3a2.6 2.6 0 0 1-4.5-1.1L1.6 17a5 5 0 0 1 4.9-6Z" />
      {/* D-pad (left) and two face buttons (right). */}
      <path d="M8 14v4M6 16h4" />
      <circle cx="15.5" cy="17" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14.8" r="0.8" fill="currentColor" stroke="none" />
      {/* Cat asleep along the top: low loaf body rising into the head. */}
      <path d="M7.6 11c-.4-2.8 1.7-4.8 4.3-4.7 1.5.1 2.8.8 3.5 2" />
      {/* Tail curling off the left end of the loaf. */}
      <path d="M7.6 11c-.9.2-1.9-.2-2.1-1.1-.2-.8.4-1.5 1.2-1.5" />
      {/* Head resting at the right end… */}
      <circle cx="15.9" cy="8.6" r="2.2" />
      {/* …with solid pointed ears — the unmistakably-feline tell. */}
      <path d="M14.4 7 14 5l1.8.9Z" fill="currentColor" stroke="none" />
      <path d="m17.2 6.9 1.5-1.4.2 2Z" fill="currentColor" stroke="none" />
      {/* Closed eye and whiskers: fast asleep. */}
      <path d="M15 8.8c.3.3.8.3 1.1 0" />
      <path d="M18.4 9.4h1.2M18.3 10.1l1.1.4" />
    </svg>
  );
}
