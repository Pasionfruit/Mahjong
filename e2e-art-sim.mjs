// End-to-end simulation of the art games over real sockets.
// Run: node e2e-art-sim.mjs   (starts its own server on :3199, then cleans up)
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
let serverProc = null;
const clients = [];

function ok(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

function fatal(msg) {
  console.error(`  ✗ FATAL: ${msg}`);
  cleanup(1);
}

function cleanup(code) {
  for (const c of clients) c.socket?.disconnect();
  serverProc?.kill();
  // Give the port a beat to release before exiting.
  setTimeout(() => process.exit(code), 300);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function makeClient(name) {
  const c = {
    name,
    socket: io(BASE, { transports: ['websocket'] }),
    lobby: null,
    game: null,
    events: [],
    join: null,
  };
  c.socket.on('lobby:state', (s) => (c.lobby = s));
  c.socket.on('game:state', (v) => (c.game = v));
  c.socket.on('game:event', (e) => c.events.push(e));
  clients.push(c);
  return c;
}

function emitAck(c, event, ...args) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: 'ack timeout' }), 5000);
    c.socket.emit(event, ...args, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
  });
}

async function waitFor(pred, label, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (pred()) return true;
    } catch {
      /* state not ready yet */
    }
    await sleep(80);
  }
  failures++;
  console.error(`  ✗ TIMEOUT waiting for: ${label}`);
  return false;
}

const strokeEvents = (c, cv) => c.events.filter((e) => e.t === 'stroke' && (!cv || e.cv === cv));

async function startServer() {
  serverProc = spawn(
    process.execPath,
    ['../node_modules/tsx/dist/cli.mjs', 'src/index.ts'],
    { cwd: new URL('./server', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'] },
  );
  serverProc.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`));
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  fatal('server never became healthy');
}

// ── scenario ────────────────────────────────────────────────────────────────

async function main() {
  await startServer();
  console.log('server up');

  const A = makeClient('A');
  const B = makeClient('B');
  const C = makeClient('C');
  await sleep(300);

  // ═══ create & join ═══
  console.log('\n[lobby]');
  const created = await emitAck(A, 'room:create', { nickname: 'Alice', gameId: 'art' });
  if (!created.ok) return fatal(`create failed: ${created.error}`);
  A.join = created.value;
  const code = created.value.roomCode;
  ok(created.value.lobby.settings.mode === 'guess', 'art room created with guess mode default');

  const jB = await emitAck(B, 'room:join', { roomCode: code, nickname: 'Bob' });
  const jC = await emitAck(C, 'room:join', { roomCode: code, nickname: 'Cara' });
  if (!jB.ok || !jC.ok) return fatal('join failed');
  B.join = jB.value;
  C.join = jC.value;

  const set1 = await emitAck(A, 'lobby:settings', { drawSeconds: 30, rounds: 1 });
  ok(set1.ok, 'host set guess settings');
  const setBad = await emitAck(B, 'lobby:settings', { drawSeconds: 45 });
  ok(!setBad.ok, 'non-host settings rejected');

  // ═══ guess mode ═══
  console.log('\n[guess mode]');
  const started = await emitAck(A, 'lobby:start');
  if (!started.ok) return fatal(`start failed: ${started.error}`);
  await waitFor(() => [A, B, C].every((c) => c.game?.phase === 'choose'), 'choose phase');
  ok(A.game.g === 'art' && A.game.mode === 'guess', 'art/guess view arrived');
  ok(A.game.guess.drawerSeat === 0, 'first drawer is seat 0');
  ok(Array.isArray(A.game.guess.choices) && A.game.guess.choices.length === 3, 'drawer sees 3 choices');
  ok(B.game.guess.choices === null, 'guesser cannot see the choices');

  await emitAck(A, 'game:action', { t: 'chooseWord', index: 0 });
  await waitFor(() => [A, B, C].every((c) => c.game?.phase === 'draw'), 'draw phase');
  const word1 = A.game.yourPrompt;
  ok(typeof word1 === 'string' && word1.length >= 2, `drawer knows the word (“${word1}”)`);
  ok(B.game.guess.word === null, 'guesser does not receive the word');
  ok(B.game.guess.wordPattern?.length === word1.length, 'guesser sees a same-length mask');
  ok(!B.game.guess.wordPattern.includes(word1[0]) || word1[0] === '_', 'mask starts hidden');

  // drawer streams two chunks of one stroke
  B.events.length = C.events.length = A.events.length = 0;
  await emitAck(A, 'game:action', { t: 'stroke', cv: 't0', id: 1, color: '#112233', size: 8, pts: [100, 100, 200, 200] });
  await emitAck(A, 'game:action', { t: 'stroke', cv: 't0', id: 1, color: '#112233', size: 8, pts: [300, 300] });
  await sleep(400);
  ok(strokeEvents(B, 't0').length === 2, 'guesser received both stroke chunks');
  ok(strokeEvents(A, 't0').length === 0, 'drawer gets no echo of its own strokes');

  // wrong guess is public chat; close & correct flows
  await emitAck(B, 'game:action', { t: 'guess', text: 'zzz not it' });
  await waitFor(
    () => C.game?.guess.messages.some((m) => m.kind === 'chat' && m.text === 'zzz not it'),
    'wrong guess visible to everyone',
  );

  // reconnect mid-turn (before anyone else scores): stroke history resyncs
  C.socket.disconnect();
  await sleep(300);
  C.socket = io(BASE, { transports: ['websocket'] });
  C.socket.on('lobby:state', (s) => (C.lobby = s));
  C.socket.on('game:state', (v) => (C.game = v));
  C.socket.on('game:event', (e) => C.events.push(e));
  C.events.length = 0;
  await sleep(300);
  const rj = await emitAck(C, 'room:rejoin', { roomCode: code, token: C.join.token });
  ok(rj.ok, 'rejoin accepted');
  await waitFor(() => strokeEvents(C, 't0').some((e) => e.full && e.pts.length === 6), 'resync replays the full stroke');

  const rGuess = await emitAck(B, 'game:action', { t: 'guess', text: word1.toUpperCase() });
  ok(rGuess.ok, 'correct guess accepted (case-insensitive)');
  await waitFor(() => B.game?.guess.word === word1, 'correct guesser now sees the word');
  ok(B.game.players[1].score > 0, `guesser scored (${B.game.players[1].score})`);
  ok(C.game.guess.word === null, 'other guesser still blind');

  // insider chat is hidden from the remaining guesser
  await emitAck(B, 'game:action', { t: 'guess', text: 'that nose though' });
  await sleep(400);
  ok(
    !C.game.guess.messages.some((m) => m.text === 'that nose though'),
    'insider chat hidden from active guesser',
  );
  ok(
    A.game.guess.messages.some((m) => m.text === 'that nose though'),
    'insider chat visible to the drawer',
  );

  // late joiner parks in the waiting room
  const D = makeClient('D');
  await sleep(200);
  const jD = await emitAck(D, 'room:join', { roomCode: code, nickname: 'Dana' });
  ok(jD.ok && jD.value.seat === -1, 'late joiner accepted as waiting (seat -1)');
  await waitFor(() => A.lobby?.waiting.length === 1, 'others see the waiting player');
  ok(D.game === null, 'waiting player receives no game state');
  const dAct = await emitAck(D, 'game:action', { t: 'guess', text: 'hax' });
  ok(!dAct.ok, 'waiting player cannot act');

  // C finishes the turn → everyone guessed → turnResult
  await emitAck(C, 'game:action', { t: 'guess', text: word1 });
  await waitFor(() => A.game?.phase === 'turnResult', 'turn result after everyone guessed');
  ok(A.game.guess.turnResult.everyoneGuessed, 'turn result flags a full house');
  ok(A.game.players[0].score === 100, `drawer earned 2×50 (${A.game.players[0].score})`);

  // turns 2 & 3: each next drawer picks, the others insta-guess
  for (const drawer of [B, C]) {
    await waitFor(() => drawer.game?.phase === 'choose' && drawer.game.guess.choices, `choose phase for ${drawer.name}`, 20000);
    await emitAck(drawer, 'game:action', { t: 'chooseWord', index: 0 });
    await waitFor(() => drawer.game?.phase === 'draw', 'draw begins');
    const w = drawer.game.yourPrompt;
    for (const g of [A, B, C]) {
      if (g === drawer) continue;
      await emitAck(g, 'game:action', { t: 'guess', text: w });
    }
    await waitFor(() => drawer.game?.phase === 'turnResult' || drawer.game?.phase === 'final', 'turn wraps');
  }
  await waitFor(() => A.game?.phase === 'final', 'final scoreboard', 20000);
  ok(A.game.guess.archive?.length === 3, 'replay archive holds all three turns');
  ok(A.game.guess.stats?.length === 3, 'final stats present');
  ok(A.game.result.winnerSeats.length >= 1, 'winners crowned');
  const top = Math.max(...A.game.players.map((p) => p.score));
  ok(
    A.game.result.winnerSeats.every((s) => A.game.players[s].score === top),
    'winners hold the top score',
  );
  ok(
    A.game.guess.stats.every((st) => st.avgGuessMs === null || st.avgGuessMs >= 0),
    'stats include guess times',
  );

  // back to lobby seats the waiting player
  await emitAck(A, 'game:toLobby');
  await waitFor(() => D.lobby?.yourSeat === 3, 'waiting player got seat 3');
  ok(A.lobby.players.length === 4, 'lobby now lists 4 players');
  D.socket.emit('room:leave');
  await waitFor(() => A.lobby?.players.length === 3, 'guest left cleanly');

  // ═══ swap mode ═══
  console.log('\n[swap mode]');
  await emitAck(A, 'lobby:settings', { mode: 'swap', drawSeconds: 30 });
  await emitAck(A, 'lobby:start');
  await waitFor(
    () => [A, B, C].every((c) => c.game?.mode === 'swap' && c.game.phase === 'draw' && c.game.canvases[0]),
    'swap draw begins',
  );
  const keys = [A, B, C].map((c) => c.game.canvases[0].key);
  ok(new Set(keys).size === 3, `everyone gets a unique canvas (${keys.join(', ')})`);
  ok([A, B, C].every((c) => c.game.yourPrompt), 'everyone sees their own prompt');
  ok(A.game.swap.entries.length === 0, 'no prompt spoilers during drawing');

  const aKey = A.game.canvases[0].key;
  await emitAck(A, 'game:action', { t: 'stroke', cv: aKey, id: 11, color: '#3f9d3a', size: 10, pts: [50, 50, 900, 900] });
  for (const c of [A, B, C]) await emitAck(c, 'game:action', { t: 'done', done: true });
  await waitFor(() => A.game?.subRound.current === 2, 'swap to turn 2');
  const inheritor = [A, B, C].find((c) => c.game.canvases[0].key === aKey);
  ok(!!inheritor && inheritor !== A, `canvas rotated to ${inheritor?.name}`);
  ok(
    inheritor.game.canvases[0].strokes.some((s) => s.seat === 0),
    'previous strokes visible to the next artist',
  );

  for (let turn = 2; turn <= 3; turn++) {
    for (const c of [A, B, C]) await emitAck(c, 'game:action', { t: 'done', done: true });
    await sleep(250);
  }
  await waitFor(() => A.game?.phase === 'reveal', 'reveal begins');
  ok(A.game.swap.revealIndex === 0, 'first canvas on stage');
  ok(A.game.canvases[0].strokes !== undefined, 'reveal carries the drawing');
  ok(A.game.swap.entries[0].contributors.length === 3, 'contributor trail complete');
  for (let i = 0; i < 3; i++) await emitAck(B, 'game:action', { t: 'advance' });
  await waitFor(() => A.game?.phase === 'gallery', 'gallery reached');
  ok(A.game.swap.entries.length === 3, 'gallery lists every artwork');
  await emitAck(A, 'game:toLobby');
  await waitFor(() => A.lobby?.phase === 'lobby', 'back in the lobby');

  // ═══ imposter mode ═══
  console.log('\n[imposter mode]');
  await emitAck(A, 'lobby:settings', { mode: 'imposter', rounds: 1 });
  await emitAck(A, 'lobby:start');
  await waitFor(
    () => [A, B, C].every((c) => c.game?.mode === 'imposter' && c.game.phase === 'draw' && c.game.yourPrompt),
    'imposter draw begins',
  );
  const prompts = [A, B, C].map((c) => c.game.yourPrompt);
  const counts = prompts.reduce((m, p) => m.set(p, (m.get(p) ?? 0) + 1), new Map());
  ok(counts.size === 2, `two distinct prompts in play (${[...counts.keys()].join(' vs ')})`);
  const oddPrompt = [...counts.entries()].find(([, n]) => n === 1)[0];
  const impSeat = prompts.indexOf(oddPrompt);
  ok([A, B, C].every((c) => c.game.canvases.length === 1), 'drawings stay private');

  for (const c of [A, B, C]) {
    await emitAck(c, 'game:action', {
      t: 'stroke', cv: c.game.canvases[0].key, id: 21, color: '#d8342c', size: 12, pts: [10, 10, 500, 500],
    });
    await emitAck(c, 'game:action', { t: 'done', done: true });
  }
  await waitFor(() => A.game?.phase === 'vote', 'vote phase');
  ok(A.game.canvases.length === 3, 'all drawings revealed for the vote');
  ok(A.game.canvases.every((cv) => cv.prompt === undefined), 'prompts still secret during the vote');

  const seats = [A, B, C];
  for (let s = 0; s < 3; s++) {
    const target = s === impSeat ? (impSeat + 1) % 3 : impSeat;
    await emitAck(seats[s], 'game:action', { t: 'vote', seat: target });
  }
  await waitFor(() => A.game?.phase === 'result', 'votes tallied');
  const result = A.game.imposter.result;
  ok(result.imposterSeat === impSeat, 'engine agrees on the imposter');
  ok(result.caught === true, 'imposter caught');
  ok(
    A.game.players.every((p) => p.score === (p.seat === impSeat ? 0 : 100)),
    'correct voters scored 100',
  );
  ok(result.commonWord !== result.imposterWord, 'both words revealed');
  await emitAck(A, 'game:toLobby');
  await waitFor(() => A.lobby?.phase === 'lobby', 'session survives replays without recreating the room');

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  cleanup(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  cleanup(1);
});
