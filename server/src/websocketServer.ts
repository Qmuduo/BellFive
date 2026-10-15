import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeClientMessage } from '../../src/network/protocol';
import type { ServerMessage } from '../../src/network/protocol';
import { RoomManager } from './roomManager';
import type { RoomManagerEvent } from './roomManager';
import type { AuthService } from './auth/service';
import type { AuthPrincipal } from './auth/types';
import type { GuardianConsentService } from './auth/guardianConsent';
import { handleAuthHttpRequest } from './auth/httpApi';

export type CreateWebSocketServerOptions = Readonly<{
  roomManager: RoomManager;
  host: string;
  port: number;
  tickIntervalMs?: number;
  authService?: AuthService;
  guardianConsent?: GuardianConsentService;
  corsOrigins?: readonly string[];
}>;

export type RunningRoomServer = Readonly<{
  host: string;
  port: number;
  httpUrl: string;
  webSocketUrl: string;
  close: () => Promise<void>;
}>;

type Connection = {
  socket: WebSocket;
  principal: AuthPrincipal | null;
  token: string | null;
  messageQueue: Promise<void>;
  authTimer: ReturnType<typeof setTimeout>;
  authenticating: boolean;
};

export async function createWebSocketServer(
  options: CreateWebSocketServerOptions,
): Promise<RunningRoomServer> {
  const connections = new Map<string, Connection>();
  const roomManager = options.roomManager;
  const sendEvents = (events: readonly RoomManagerEvent[]) => {
    for (const event of events) {
      const socket = connections.get(event.connectionId)?.socket;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event.message));
      }
    }
  };
  const httpServer = createServer((request, response) => {
    void handleAuthHttpRequest(request, response, options.authService, {
      corsOrigins: options.corsOrigins ?? [],
      guardianConsent: options.guardianConsent,
      onAccountDeleted(userId) {
        sendEvents(roomManager.removeUser(userId));
        for (const connection of connections.values()) {
          if (connection.principal?.userId === userId) connection.socket.close(4001, 'Account deleted');
        }
      },
    }).then(handled => {
      if (handled) return;
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: 'not_found' }));
      request.resume();
    }).catch(() => {
      response.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'The service could not process that request.' } }));
    });
  });
  const webSocketServer = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });
  webSocketServer.on('error', () => {
    // ws forwards HTTP errors here before listen() can reject the startup promise.
    // Consume that forwarded event so the HTTP error reaches its handled path.
  });

  webSocketServer.on('connection', socket => {
    const connectionId = randomUUID();
    const connection: Connection = {
      socket, principal: null, token: null, messageQueue: Promise.resolve(), authenticating: false,
      authTimer: setTimeout(() => socket.close(4401, 'Authentication required'), 5_000),
    };
    connections.set(connectionId, connection);

    socket.on('message', async raw => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const message = decodeClientMessage(raw.toString());
      if (!connection.principal) {
        if (message?.type !== 'session.authenticate' || connection.authenticating) {
          socket.close(4401, 'Authentication required');
          return;
        }
        connection.authenticating = true;
        try {
          const principal = await options.authService?.authenticateToken(message.token);
          if (connections.get(connectionId) !== connection || socket.readyState !== WebSocket.OPEN) return;
          if (!principal) {
            socket.close(4401, 'Authentication required');
            return;
          }
          connection.principal = principal;
          connection.token = message.token;
          clearTimeout(connection.authTimer);
          sendMessage(socket, { type: 'session.authenticated', userId: principal.userId });
        } catch {
          socket.close(4401, 'Authentication required');
        }
        return;
      }
      if (!message) {
        sendMessage(socket, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'The message does not match the 铃果派对 room protocol.',
        });
        return;
      }
      if (message.type === 'session.authenticate') {
        socket.close(4401, 'Already authenticated');
        return;
      }

      connection.messageQueue = connection.messageQueue.then(async () => {
        if (socket.readyState !== WebSocket.OPEN) return;
        let principal: AuthPrincipal | null | undefined;
        try {
          principal = await options.authService?.authenticateToken(connection.token!);
        } catch {
          socket.close(4401, 'Authentication required');
          return;
        }
        if (connections.get(connectionId) !== connection || socket.readyState !== WebSocket.OPEN) return;
        if (!principal || principal.userId !== connection.principal?.userId) {
          socket.close(4401, 'Authentication required');
          return;
        }
        connection.principal = principal;
        try {
          const events = roomManager.handleMessage(connectionId, message, principal);
          sendEvents(events);
          const invalidSeatToken = message.type === 'room.reconnect' && events.some(event =>
            event.connectionId === connectionId &&
            event.message.type === 'error' &&
            event.message.code === 'INVALID_SEAT_TOKEN'
          );
          if (invalidSeatToken) socket.close(4401, 'Invalid seat token');
        } catch {
          sendMessage(socket, {
            type: 'error',
            requestId: 'requestId' in message ? message.requestId : undefined,
            actionId: 'actionId' in message ? message.actionId : undefined,
            code: 'SERVER_ERROR',
            message: 'The room service could not process that action.',
          });
        }
      }).catch(() => socket.close(4401, 'Authentication required'));
    });

    socket.on('close', () => {
      clearTimeout(connection.authTimer);
      connections.delete(connectionId);
      sendEvents(roomManager.disconnect(connectionId));
    });

    socket.on('error', () => {
      // The close event releases the room seat and notifies the other player.
    });
  });

  try {
    await listen(httpServer, options.port, options.host);
  } catch (error) {
    await closeServers(httpServer, webSocketServer, connections);
    throw error;
  }
  const ticker = setInterval(
    () => sendEvents(roomManager.tick()),
    options.tickIntervalMs ?? 1_000,
  );
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    await closeServers(httpServer, webSocketServer, connections, ticker);
    throw new Error('The room service did not bind to a TCP address.');
  }

  const boundAddress = address as AddressInfo;
  const urlHost = options.host === '0.0.0.0' ? '127.0.0.1' : options.host;
  const baseUrl = `http://${urlHost}:${boundAddress.port}`;

  return {
    host: options.host,
    port: boundAddress.port,
    httpUrl: `${baseUrl}/health`,
    webSocketUrl: `ws://${urlHost}:${boundAddress.port}`,
    close: () => closeServers(httpServer, webSocketServer, connections, ticker),
  };
}

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function listen(server: HttpServer, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

async function closeServers(
  httpServer: HttpServer,
  webSocketServer: WebSocketServer,
  connections: Map<string, Connection>,
  ticker?: ReturnType<typeof setInterval>,
): Promise<void> {
  if (ticker) clearInterval(ticker);
  for (const connection of connections.values()) {
    clearTimeout(connection.authTimer);
    connection.socket.terminate();
  }
  connections.clear();

  const closeWebSockets = new Promise<void>(resolve => {
    webSocketServer.close(() => resolve());
  });
  const closeHttp = new Promise<void>((resolve, reject) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }
    httpServer.close(error => (error ? reject(error) : resolve()));
  });

  await Promise.all([closeWebSockets, closeHttp]);
}
