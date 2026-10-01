/** @jest-environment node */

import WebSocket from 'ws';
import { get as httpGet } from 'node:http';
import type { ServerMessage } from '../../../src/network/protocol';
import { RoomManager } from '../roomManager';
import { createWebSocketServer } from '../websocketServer';
import type { RunningRoomServer } from '../websocketServer';

describe('WebSocket room transport', () => {
  let server: RunningRoomServer;
  const sockets: WebSocket[] = [];

  beforeEach(async () => {
    server = await createWebSocketServer({
      roomManager: new RoomManager(),
      host: '127.0.0.1',
      port: 0,
    });
  });

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.terminate();
      }
    }
    await server.close();
  });

  it('serves health and forwards room sessions and snapshots to both phones', async () => {
    const health = await getHealth(server.httpUrl);
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok' });

    const playerA = await connect(server.webSocketUrl);
    const aSessionPromise = nextMessage(playerA, message => message.type === 'room.session');
    playerA.send(JSON.stringify({ type: 'room.create', requestId: 'create-a' }));
    const aSession = await aSessionPromise;
    if (aSession.type !== 'room.session') throw new Error('Expected Player A room session.');

    const playerB = await connect(server.webSocketUrl);
    const bSessionPromise = nextMessage(playerB, message => message.type === 'room.session');
    const aSnapshotPromise = nextMessage(playerA, message => message.type === 'room.snapshot');
    playerB.send(
      JSON.stringify({
        type: 'room.join',
        requestId: 'join-b',
        roomCode: aSession.roomCode,
      }),
    );

    const [bSession, aSnapshot] = await Promise.all([bSessionPromise, aSnapshotPromise]);
    expect(bSession).toMatchObject({
      type: 'room.session',
      localPlayerId: 'B',
      snapshot: { phase: 'playing', players: { A: { drawCount: 30 }, B: { drawCount: 30 } } },
    });
    expect(aSnapshot).toMatchObject({
      type: 'room.snapshot',
      snapshot: { phase: 'playing', localPlayerId: 'A', turn: 'A' },
    });
  });

  it('rejects out-of-turn flips and malformed protocol messages without ending the socket', async () => {
    const { playerA, playerB, roomCode } = await createJoinedSockets();
    const wrongTurnErrorPromise = nextMessage(
      playerB,
      message => message.type === 'error' && message.code === 'NOT_YOUR_TURN',
    );
    const unchangedSnapshotPromise = nextMessage(
      playerB,
      message => message.type === 'room.snapshot' && message.snapshot.turn === 'A',
    );
    playerB.send(JSON.stringify({ type: 'game.flip', actionId: 'b-flip' }));
    await Promise.all([wrongTurnErrorPromise, unchangedSnapshotPromise]);

    const invalidMessagePromise = nextMessage(
      playerA,
      message => message.type === 'error' && message.code === 'INVALID_MESSAGE',
    );
    playerA.send('{invalid json');
    await invalidMessagePromise;

    const acceptedFlipPromise = nextMessage(
      playerA,
      message => message.type === 'action.result' && message.actionId === 'a-flip',
    );
    playerA.send(JSON.stringify({ type: 'game.flip', actionId: 'a-flip' }));
    expect(await acceptedFlipPromise).toMatchObject({ type: 'action.result', accepted: true });
    expect(roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  });

  it('rejects a third socket from joining a full room', async () => {
    const { roomCode } = await createJoinedSockets();
    const playerC = await connect(server.webSocketUrl);
    const fullRoomErrorPromise = nextMessage(
      playerC,
      message => message.type === 'error' && message.code === 'ROOM_FULL',
    );
    playerC.send(JSON.stringify({ type: 'room.join', requestId: 'join-c', roomCode }));

    await expect(fullRoomErrorPromise).resolves.toMatchObject({
      type: 'error',
      requestId: 'join-c',
      code: 'ROOM_FULL',
    });
  });

  async function createJoinedSockets() {
    const playerA = await connect(server.webSocketUrl);
    const aSessionPromise = nextMessage(playerA, message => message.type === 'room.session');
    playerA.send(JSON.stringify({ type: 'room.create', requestId: 'create-a' }));
    const aSession = await aSessionPromise;
    if (aSession.type !== 'room.session') throw new Error('Expected Player A room session.');

    const playerB = await connect(server.webSocketUrl);
    const bSessionPromise = nextMessage(playerB, message => message.type === 'room.session');
    playerB.send(
      JSON.stringify({ type: 'room.join', requestId: 'join-b', roomCode: aSession.roomCode }),
    );
    await bSessionPromise;
    return { playerA, playerB, roomCode: aSession.roomCode };
  }

  async function connect(url: string): Promise<WebSocket> {
    const socket = new WebSocket(url);
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return socket;
  }

  function getHealth(url: string): Promise<{ statusCode: number | undefined; body: string }> {
    return new Promise((resolve, reject) => {
      httpGet(url, response => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', chunk => {
          body += chunk;
        });
        response.on('end', () => resolve({ statusCode: response.statusCode, body }));
      }).on('error', reject);
    });
  }

  function nextMessage(
    socket: WebSocket,
    predicate: (message: ServerMessage) => boolean,
  ): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('message', onMessage);
        reject(new Error('Timed out waiting for a server message.'));
      }, 5_000);
      const onMessage = (data: WebSocket.RawData) => {
        let message: ServerMessage | null = null;
        try {
          message = JSON.parse(data.toString()) as ServerMessage;
        } catch {
          clearTimeout(timeout);
          socket.off('message', onMessage);
          reject(new Error('Server sent malformed JSON.'));
          return;
        }
        if (!predicate(message)) return;
        clearTimeout(timeout);
        socket.off('message', onMessage);
        resolve(message);
      };
      socket.on('message', onMessage);
    });
  }
});
