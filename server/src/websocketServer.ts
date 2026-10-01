import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { decodeClientMessage } from '../../src/network/protocol';
import type { ServerMessage } from '../../src/network/protocol';
import { RoomManager } from './roomManager';
import type { RoomManagerEvent } from './roomManager';

export type CreateWebSocketServerOptions = Readonly<{
  roomManager: RoomManager;
  host: string;
  port: number;
}>;

export type RunningRoomServer = Readonly<{
  host: string;
  port: number;
  httpUrl: string;
  webSocketUrl: string;
  close: () => Promise<void>;
}>;

export async function createWebSocketServer(
  options: CreateWebSocketServerOptions,
): Promise<RunningRoomServer> {
  const connections = new Map<string, WebSocket>();
  const roomManager = options.roomManager;
  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  const webSocketServer = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });

  const sendEvents = (events: readonly RoomManagerEvent[]) => {
    for (const event of events) {
      const socket = connections.get(event.connectionId);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(event.message));
      }
    }
  };

  webSocketServer.on('connection', socket => {
    const connectionId = randomUUID();
    connections.set(connectionId, socket);

    socket.on('message', raw => {
      const message = decodeClientMessage(raw.toString());
      if (!message) {
        sendMessage(socket, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: 'The message does not match the BellFive room protocol.',
        });
        return;
      }

      try {
        const events = roomManager.handleMessage(connectionId, message);
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
    });

    socket.on('close', () => {
      connections.delete(connectionId);
      sendEvents(roomManager.disconnect(connectionId));
    });

    socket.on('error', () => {
      // The close event releases the room seat and notifies the other player.
    });
  });

  await listen(httpServer, options.port, options.host);
  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    await closeServers(httpServer, webSocketServer, connections);
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
    close: () => closeServers(httpServer, webSocketServer, connections),
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
  connections: Map<string, WebSocket>,
): Promise<void> {
  for (const socket of connections.values()) socket.terminate();
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
