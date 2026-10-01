import { RoomManager } from './roomManager';
import { createWebSocketServer } from './websocketServer';

async function startServer(): Promise<void> {
  const portValue = Number(process.env.PORT ?? 8787);
  const port = Number.isInteger(portValue) && portValue >= 0 ? portValue : 8787;
  const host = process.env.HOST ?? '0.0.0.0';
  const roomManager = new RoomManager();
  const server = await createWebSocketServer({ roomManager, host, port });
  const expiryTimer = setInterval(() => roomManager.pruneExpiredRooms(), 60_000);
  expiryTimer.unref();

  console.log(`BellFive room service listening at ${server.host}:${server.port}`);

  const shutdown = () => {
    clearInterval(expiryTimer);
    void server.close().then(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void startServer().catch(error => {
  console.error('BellFive room service failed to start.', error);
  process.exitCode = 1;
});
