// End-to-end simulation of a 2-player Tetris room over real sockets.
// Run: node e2e-tetris-sim.mjs   (starts its own server on :3198, cleans up)
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3198;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
let serverProc = null;
const clients = [];

const ok = (cond, label) => {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ FAIL: ${label}`);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cleanup(code) {
  for (const c of clients) c.socket?.disconnect();
  serverProc?.kill();
  setTimeout(() => process.exit(code), 300);
}

function makeClient(name) {
  const c = { name, socket: io(BASE, { transports: ['websocket'] }), lobby: null, game: null, events: [] };
  c.socket.on('lobby:state', (s) => (c.lobby = s));
  c.socket.on('game:state', (v) => (c.game = v));
  c.socket.on('game:event', (e) => c.events.push(e));
  clients.push(c);
  return c;
}

const emitAck = (c, event, ...args) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: 'ack timeout' }), 5000);
    c.socket.emit(event, ...args, (r) => {
      clearTimeout(t);
      resolve(r);
    });
  });

async function waitFor(pred, label, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (pred()) return true;
    } catch {
      /* not yet */
    }
    await sleep(60);
  }
  failures++;
  console.error(`  ✗ TIMEOUT: ${label}`);
  return false;
}

async function startServer() {
  serverProc = spawn(process.execPath, ['../node_modules/tsx/dist/cli.mjs', 'src/index.ts'], {
    cwd: new URL('./server', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {
      /* booting */
    }
    await sleep(200);
  }
  throw new Error('server never became healthy');
}

async function main() {
  await startServer();
  console.log('server up\n[tetris]');

  const A = makeClient('A');
  const B = makeClient('B');
  await sleep(300);

  const created = await emitAck(A, 'room:create', { nickname: 'Alice', gameId: 'tetris' });
  ok(created.ok, 'tetris room created');
  const code = created.value.roomCode;
  ok(created.value.lobby.settings.startLevel === 1, 'default settings arrive');
  const jB = await emitAck(B, 'room:join', { roomCode: code, nickname: 'Bob' });
  ok(jB.ok, 'second player joined');

  ok((await emitAck(A, 'lobby:settings', { startLevel: 10, garbage: true })).ok, 'host set start level 10');
  ok(!(await emitAck(A, 'lobby:settings', { startLevel: 7 })).ok, 'off-menu start level rejected');

  ok((await emitAck(A, 'lobby:start')).ok, 'game started');
  await waitFor(() => A.game?.g === 'tetris' && B.game?.g === 'tetris', 'both got tetris views');
  ok(A.game.players.length === 2, 'two boards in view');
  ok(A.game.players[0].active.kind === A.game.players[1].active.kind, 'shared bag: same first piece');
  ok(A.game.players[0].level === 10, 'starting level honored');
  ok(A.game.players[0].grid.length === 22 && A.game.players[0].grid[0].length === 10, 'grid dimensions');

  // Movement flows through ticks.
  const x0 = A.game.players[0].active.x;
  await emitAck(A, 'game:action', { t: 'tetris', op: 'left' });
  await emitAck(A, 'game:action', { t: 'tetris', op: 'left' });
  await waitFor(() => A.game.players[0].active && A.game.players[0].active.x <= x0 - 2 + 1, 'piece moved left');

  const rot0 = A.game.players[0].active.rot;
  await emitAck(A, 'game:action', { t: 'tetris', op: 'cw' });
  await waitFor(() => A.game.players[0].active && A.game.players[0].active.rot !== rot0, 'piece rotated');

  // Hold stores, second hold is a no-op, after a lock we can trade.
  await emitAck(A, 'game:action', { t: 'tetris', op: 'hold' });
  await waitFor(() => A.game.players[0].hold !== null, 'piece stored');
  const held = A.game.players[0].hold;
  await emitAck(A, 'game:action', { t: 'tetris', op: 'hard' });
  await sleep(200);
  await emitAck(A, 'game:action', { t: 'tetris', op: 'hold' });
  await waitFor(() => A.game.players[0].hold !== held, 'piece traded after lock');

  // Gravity: B's untouched piece falls on its own at level 10.
  const yB = B.game.players[1].active.y;
  await waitFor(() => B.game.players[1].active === null || B.game.players[1].active.y > yB, 'gravity pulls B down');

  // Pause freezes gravity.
  ok((await emitAck(A, 'game:pause')).ok, 'host paused');
  await waitFor(() => A.game.paused === true, 'paused view');
  const snap = JSON.stringify(B.game.players.map((p) => p.active));
  await sleep(700);
  ok(JSON.stringify(B.game.players.map((p) => p.active)) === snap, 'nothing moves while paused');
  ok((await emitAck(A, 'game:resume')).ok, 'resumed');

  // Both spam hard drops until someone tops out — last one standing wins.
  for (let i = 0; i < 200 && !A.game.result; i++) {
    await emitAck(A, 'game:action', { t: 'tetris', op: 'hard' });
    await emitAck(B, 'game:action', { t: 'tetris', op: 'hard' });
    await sleep(25);
  }
  await waitFor(() => A.game.result !== null, 'game ended', 25000);
  const winner = A.game.result.winnerSeat;
  ok(winner === 0 || winner === 1, `winner declared (seat ${winner})`);
  ok(A.game.players[1 - winner].alive === false, 'loser topped out');
  ok(A.events.some((e) => e.t === 'death'), 'death event emitted');
  ok(A.events.some((e) => e.t === 'win'), 'win event emitted');
  const linesEvents = A.events.filter((e) => e.t === 'lines');
  console.log(`  (line clears during the slugfest: ${linesEvents.length})`);

  // Replay without recreating the lobby.
  ok((await emitAck(A, 'game:nextRound')).ok, 'play again');
  await waitFor(() => A.game.result === null && A.game.players[0].alive, 'fresh round started');

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  cleanup(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  cleanup(1);
});
