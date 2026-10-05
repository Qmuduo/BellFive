import { RoomManager } from './roomManager';
import { createWebSocketServer } from './websocketServer';
import { openAuthDatabase } from './auth/database';
import { AuthRepository } from './auth/repository';
import { AuthService } from './auth/service';

async function startServer(): Promise<void> {
  const portValue = Number(process.env.PORT ?? 8787);
  const port = Number.isInteger(portValue) && portValue >= 0 && portValue <= 65535 ? portValue : 8787;
  const host = process.env.HOST ?? '0.0.0.0';
  const roomManager = new RoomManager();
  const db = openAuthDatabase();
  const authService = new AuthService(new AuthRepository(db));
  const corsOrigins = (process.env.BELLFIVE_CORS_ORIGINS ?? '').split(',').map(origin => origin.trim()).filter(Boolean);
  let server;
  try {
    server = await createWebSocketServer({ roomManager, authService, corsOrigins, host, port });
  } catch (error) {
    db.close();
    throw error;
  }
  const expiryTimer = setInterval(() => roomManager.pruneExpiredRooms(), 60_000);
  expiryTimer.unref();

  console.log(`BellFive room and account service listening at ${server.host}:${server.port}`);

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = () => {
    if (shutdownPromise) return;
    clearInterval(expiryTimer);
    shutdownPromise = server.close().finally(() => db.close());
    void shutdownPromise.catch(() => {
      console.error('BellFive service failed to shut down.');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

void startServer().catch(() => {
  console.error('BellFive room and account service failed to start.');
  process.exitCode = 1;
});
