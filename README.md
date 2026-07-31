# LocalRot

A web-based game night in the browser, three wings deep:

- **🎉 Party Games** — room-based real-time multiplayer. Create a private table,
  share the 4-letter code, and play Mahjong, Bomberman, Tetris, Art Games,
  Quoridor, Dots & Boxes, Spin Sumo, Party Board, and Ultimate Tic-Tac-Toe
  with friends.
- **🧘 Zen Endless** — solo, offline-capable arcade with global leaderboards:
  Flappy Bird, Doodle Jump, Brick Breaker, Peggle, Pogo Cat (arcade) ·
  Rope Untangle, Paint by Number (relaxing) · Sand Play, Magic Sort (sorting) ·
  2048 (matching) · Minesweeper, Sudoku, Parking Jam (logic) ·
  Word Guess, Crossword Mini (word).
- **📅 Daily** — one shared puzzle per game per UTC day (word, minesweeper,
  sudoku, Peggle map, coloring page, 2048 board, sand level, mini crossword),
  with per-profile done-today tracking and streaks.

## Mahjong rules (17-tile variant)

- **Win** with **N sets** (pong/chow/kong) **+ 1 pair**, or **(N+2) pairs + 1 set**.
  N is host-configurable, defaulting by player count: 4p → 5, 3p → 4, 2p → 3.
- **Pong**: claim any discard with two matching tiles in hand.
- **Chow**: claim a discard to complete a run — only from the player right before you.
- **Kong**: exposed / added / concealed, all draw a replacement from the back of the wall.
- Claim priority: win > kong/pong > chow (win ties go to the seat nearest the discarder).
- Optional **flowers**, **turn timer**, and **open hands** casual mode.
- Rounds play back-to-back with a win-tally scoreboard; the dealer rotates each round.

## Development

```bash
npm install
npm run dev        # server on :3001, client (Vite) on :5173
```

Open http://localhost:5173 in multiple tabs/browsers to simulate players.

```bash
npm test           # engine test suites (vitest)
npm run typecheck  # strict TS across all workspaces
```

## Production

```bash
npm run build      # builds client (client/dist) and bundles server (server/dist)
npm start          # serves everything from one port (PORT env, default 3001)
```

Deploys as a single service on Render/Railway/Fly.io:
build `npm ci && npm run build`, start `npm start`. Room state is in-memory —
run a single instance.

## Layout

- `shared/` — tile/settings types, seeded RNG, and the Socket.IO protocol contract
- `server/` — Express + Socket.IO; `engine/` is the pure, fully-tested game logic;
  `rooms/` holds lobby/party/reconnect/timers
- `client/` — React + Vite + zustand; SVG/canvas-drawn, no image assets.
  `src/games/catalog.tsx` is the single registry of every game and wing;
  `src/arcade/` is the solo pipeline (anonymous Supabase auth, IndexedDB saves,
  sync outbox, leaderboards, daily seeds, streaks).

All multiplayer rule legality is computed server-side; the client renders
`yourOptions` from each snapshot and never trusts itself. Solo games are
client-authoritative with deterministic seeds and replayable move logs.
