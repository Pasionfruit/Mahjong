import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import type { SocketData } from './rooms/Room';
import { registerHandlers } from './sockets/handlers';

const dirname = path.dirname(fileURLToPath(import.meta.url));
// Same depth from both server/src (dev) and server/dist (prod).
const clientDist = path.resolve(dirname, '../../client/dist');

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
  httpServer,
);

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

registerHandlers(io);

const port = Number(process.env.PORT) || 3001;

// Without this, a failed bind surfaces as an unhandled 'error' event: a
// 20-line Node stack trace whose actual cause (EADDRINUSE) is buried in the
// middle. The overwhelmingly common case in dev is a leftover server from a
// previous run still holding the port, so say exactly that — and how to fix
// it — instead of making the reader parse a stack.
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n✗ Port ${port} is already in use — most likely an earlier dev server that never shut down.\n` +
        `  Free it, then retry:\n` +
        `    Windows:  npx kill-port ${port}     (or: netstat -ano | findstr :${port}  →  taskkill /F /PID <pid>)\n` +
        `    macOS/Linux:  lsof -ti:${port} | xargs kill\n` +
        `  Or run on a different port:  PORT=3002 npm run dev\n`,
    );
  } else {
    console.error(`\n✗ Server failed to start:`, err.message, '\n');
  }
  process.exit(1);
});

httpServer.listen(port, () => {
  console.log(`mahjong server listening on :${port}`);
});
