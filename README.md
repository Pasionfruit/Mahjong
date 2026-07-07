# Mahjong Party

A web-based multiplayer mahjong game. Create a private party, share the 4-letter
room code, and play with 2–4 friends in the browser.

## Rules (17-tile variant)

- **Win** with **N sets** (pong/chow/kong) **+ 1 pair**, or **(N+2) pairs + 1 set**.
  N is host-configurable, defaulting by player count: 4p → 5, 3p → 4, 2p → 3.
- **Pong**: claim any discard with two matching tiles in hand.
- **Chow**: claim a discard to complete a run — only from the player right before you.
- **Kong**: exposed / added / concealed, all draw a replacement from the back of the wall.
- Claim priority: win > kong/pong > chow (win ties go to the seat nearest the discarder).
- Optional **flowers** (set aside face-up, replacement drawn).
- Optional **turn timer** (15/30/60s — timeouts auto-discard) and a fixed 7s claim window.
- Optional **open hands** casual mode where every hand is face-up.
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

- `shared/` — tile/settings types and the Socket.IO protocol contract
- `server/` — Express + Socket.IO; `engine/` is the pure, fully-tested game logic
  (wall, deal, claims, win detection, turn state machine, per-seat redaction);
  `rooms/` holds lobby/party/reconnect/timers
- `client/` — React + Vite + zustand; SVG-drawn tiles, no image assets

All rule legality is computed server-side; the client renders `yourOptions`
from each snapshot and never trusts itself.
