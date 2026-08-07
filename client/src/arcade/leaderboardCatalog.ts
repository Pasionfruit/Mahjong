/**
 * Every game's leaderboards, in one place — the browser for these lives on
 * the profile ("Stats") page rather than inside each game, so game screens
 * stay lean. Formats/ordering mirror what each game's in-game leaderboard
 * tab used to show before the move.
 */

export interface BoardSpec {
  /** Section title shown above the list. */
  label: string;
  mode: 'endless' | 'streak';
  /** Lower-is-better boards (times, fewest moves) rank ascending. */
  ascending: boolean;
  formatScore?: (score: number) => string;
}

export interface GameBoards {
  gameId: string;
  name: string;
  boards: BoardSpec[];
}

const time = (ms: number): string => (ms / 1000).toFixed(1) + 's';
const STREAKS: BoardSpec = { label: '🔥 Longest Daily Streaks', mode: 'streak', ascending: false };

export const LEADERBOARDS: GameBoards[] = [
  {
    gameId: 'flappy',
    name: 'Flappy Bird',
    boards: [{ label: 'All-Time Most Pipes', mode: 'endless', ascending: false }],
  },
  {
    gameId: 'dino',
    name: 'Dino Run',
    boards: [{ label: 'All-Time Longest Runs', mode: 'endless', ascending: false }],
  },
  {
    gameId: 'doodlejump',
    name: 'Doodle Jump',
    boards: [{ label: 'All-Time Highest', mode: 'endless', ascending: false }],
  },
  {
    gameId: 'brickbreaker',
    name: 'Brick Breaker',
    boards: [{ label: 'All-Time Best', mode: 'endless', ascending: false }],
  },
  {
    gameId: 'peggle',
    name: 'Peggle',
    boards: [{ label: 'All-Time Best (Endless)', mode: 'endless', ascending: false }, STREAKS],
  },
  {
    gameId: 'pogocat',
    name: 'Pogo Cat',
    boards: [{ label: 'All-Time Best', mode: 'endless', ascending: false }],
  },
  {
    gameId: 'untangle',
    name: 'Rope Untangle',
    boards: [
      { label: 'All-Time Fastest (Endless)', mode: 'endless', ascending: true, formatScore: time },
      STREAKS,
    ],
  },
  {
    gameId: 'sandplay',
    name: 'Sand Play',
    boards: [
      { label: 'All-Time Fastest (Endless)', mode: 'endless', ascending: true, formatScore: time },
      STREAKS,
    ],
  },
  {
    gameId: 'magicsort',
    name: 'Magic Sort',
    boards: [{ label: 'All-Time Best (Fewest Moves)', mode: 'endless', ascending: true }],
  },
  {
    gameId: 'parkingjam',
    name: 'Parking Jam',
    boards: [{ label: 'All-Time Best (Fewest Moves)', mode: 'endless', ascending: true }],
  },
  {
    gameId: 'twenty48',
    name: '2048',
    boards: [{ label: 'All-Time Best (Endless)', mode: 'endless', ascending: false }],
  },
  {
    gameId: 'minesweeper',
    name: 'Minesweeper',
    boards: [
      {
        label: 'All-Time Fastest (Endless)',
        mode: 'endless',
        ascending: true,
        formatScore: (s) => (s >= 999_999_999 ? 'DNF' : time(s)),
      },
      STREAKS,
    ],
  },
  {
    gameId: 'sudoku',
    name: 'Sudoku',
    boards: [{ label: 'All-Time Fastest (Endless)', mode: 'endless', ascending: true, formatScore: time }],
  },
  {
    gameId: 'crossword',
    name: 'Crossword Mini',
    boards: [
      { label: 'All-Time Fastest (Endless)', mode: 'endless', ascending: true, formatScore: time },
      STREAKS,
    ],
  },
  {
    gameId: 'wordsearch',
    name: 'Word Search',
    boards: [
      { label: 'All-Time Fastest (Endless)', mode: 'endless', ascending: true, formatScore: time },
      STREAKS,
    ],
  },
  {
    gameId: 'wordguess',
    name: 'Word Guess',
    boards: [{ label: 'All-Time Best (Endless)', mode: 'endless', ascending: false }, STREAKS],
  },
  {
    gameId: 'paintbynumber',
    name: 'Paint by Number',
    boards: [
      { label: 'All-Time Fastest (Endless)', mode: 'endless', ascending: true, formatScore: time },
      STREAKS,
    ],
  },
];
