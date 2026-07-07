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
httpServer.listen(port, () => {
  console.log(`mahjong server listening on :${port}`);
});
