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

  it('serves health and forwards approved room sessions and snapshots to both phones', async () => {
    const health = await getHealth(server.httpUrl);
    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: 'ok' });

    const playerA = await connect(server.webSocketUrl);
    const aSessionPromise = nextMessage(playerA, message => message.type === 'room.session');
    playerA.send(JSON.stringify({ type: 'room.create', requestId: 'create-a' }));
    const aSession = await aSessionPromise;
    if (aSession.type !== 'room.session') throw new Error('Expected Player A room session.');

    const playerB = await connect(server.webSocketUrl);
    const pendingPromise = nextMessage(playerA, message => message.type === 'room.application.pending');
    playerB.send(
      JSON.stringify({
        type: 'room.join',
        requestId: 'join-b',
        roomCode: aSession.roomCode,
      }),
    );
    const pending = await pendingPromise;
    if (pending.type !== 'room.application.pending') throw new Error('Expected a join application.');

    const bSessionPromise = nextMessage(playerB, message => message.type === 'room.session');
    const aSnapshotPromise = nextMessage(playerA, message => message.type === 'room.snapshot');
    playerA.send(JSON.stringify({
      type: 'room.application.decision',
      applicationId: pending.application.applicationId,
      approved: true,
    }));

    const [bSession, aSnapshot] = await Promise.all([bSessionPromise, aSnapshotPromise]);
    expect(bSession).toMatchObject({
      type: 'room.session',
      localPlayerId: 'B',
      snapshot: { phase: 'waiting', players: { A: { drawCount: null }, B: { drawCount: null } } },
    });
    expect(aSnapshot).toMatchObject({
      type: 'room.snapshot',
      snapshot: { phase: 'waiting', localPlayerId: 'A', turn: null },
    });

    const aPlayingPromise = nextMessage(
      playerA,
      message => message.type === 'room.snapshot' && message.snapshot.phase === 'playing',
    );
    const bPlayingPromise = nextMessage(
      playerB,
      message => message.type === 'room.snapshot' && message.snapshot.phase === 'playing',
    );
    playerA.send(JSON.stringify({ type: 'room.ready', actionId: 'a-ready', ready: true }));
    playerB.send(JSON.stringify({ type: 'room.ready', actionId: 'b-ready', ready: true }));
    await Promise.all([aPlayingPromise, bPlayingPromise]);
  });

  it('discovers an open room and keeps the requester outside until the host approves', async () => {
    const playerA = await connect(server.webSocketUrl);
    const aSessionPromise = nextMessage(playerA, message => message.type === 'room.session');
    playerA.send(JSON.stringify({ type: 'room.create', requestId: 'create-a' }));
    const aSession = await aSessionPromise;
    if (aSession.type !== 'room.session') throw new Error('Expected a room session.');

    const playerB = await connect(server.webSocketUrl);
    const roomListPromise = nextMessage(playerB, message => message.type === 'room.lobby.snapshot');
    playerB.send(JSON.stringify({ type: 'room.lobby.subscribe' }));
    await expect(roomListPromise).resolves.toMatchObject({
      type: 'room.lobby.snapshot',
      rooms: [{ roomCode: aSession.roomCode, hostProfile: { nickname: 'Player A' } }],
    });

    const pendingPromise = nextMessage(playerA, message => message.type === 'room.application.pending');
    const statusPromise = nextMessage(
      playerB,
      message => message.type === 'room.application.status' && message.status === 'pending',
    );
    const noSessionMessages: ServerMessage[] = [];
    const recordMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as ServerMessage;
      noSessionMessages.push(parsed);
    };
    playerB.on('message', recordMessage);
    playerB.send(JSON.stringify({
      type: 'room.join', requestId: 'apply-b', roomCode: aSession.roomCode,
      profile: { nickname: 'Kai', avatarId: 'banana' },
    }));
    const [pending, status] = await Promise.all([pendingPromise, statusPromise]);
    playerB.off('message', recordMessage);
    if (pending.type !== 'room.application.pending') throw new Error('Expected a pending application.');
    expect(status).toMatchObject({ type: 'room.application.status', status: 'pending' });
    expect(noSessionMessages.some(message => message.type === 'room.session')).toBe(false);

    const sessionPromise = nextMessage(playerB, message => message.type === 'room.session');
    playerA.send(JSON.stringify({
      type: 'room.application.decision',
      applicationId: pending.application.applicationId,
      approved: true,
    }));
    await expect(sessionPromise).resolves.toMatchObject({ localPlayerId: 'B', requestId: 'apply-b' });
  });

  it('broadcasts countdown updates from the server timer', async () => {
    await server.close();
    let now = 1_000;
    server = await createWebSocketServer({
      roomManager: new RoomManager({ now: () => now, matchDurationMs: 2_000 }),
      host: '127.0.0.1',
      port: 0,
      tickIntervalMs: 10,
    });
    const { playerA, playerB } = await createJoinedSockets();
    now += 1_000;

    const aCountdown = nextMessage(
      playerA,
      message => message.type === 'room.snapshot' && message.snapshot.remainingSeconds === 1,
    );
    const bCountdown = nextMessage(
      playerB,
      message => message.type === 'room.snapshot' && message.snapshot.remainingSeconds === 1,
    );

    await Promise.all([aCountdown, bCountdown]);
    now += 1_000;
    const aFinished = nextMessage(
      playerA,
      message => message.type === 'room.snapshot' && message.snapshot.phase === 'finished',
    );
    const bFinished = nextMessage(
      playerB,
      message => message.type === 'room.snapshot' && message.snapshot.phase === 'finished',
    );
    const [aTimeout, bTimeout] = await Promise.all([aFinished, bFinished]);
    expect(aTimeout).toMatchObject({ type: 'room.snapshot', snapshot: { remainingSeconds: 0 } });
    expect(bTimeout).toMatchObject({ type: 'room.snapshot', snapshot: { remainingSeconds: 0 } });
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

  it('closes a connection after an invalid seat token reconnect attempt', async () => {
    const playerA = await connect(server.webSocketUrl);
    const sessionPromise = nextMessage(playerA, message => message.type === 'room.session');
    playerA.send(JSON.stringify({ type: 'room.create', requestId: 'create-a' }));
    const session = await sessionPromise;
    if (session.type !== 'room.session') throw new Error('Expected Player A room session.');

    const invalidClient = await connect(server.webSocketUrl);
    const errorPromise = nextMessage(
      invalidClient,
      message => message.type === 'error' && message.code === 'INVALID_SEAT_TOKEN',
    );
    const closePromise = new Promise<number>(resolve => invalidClient.once('close', code => resolve(code)));
    invalidClient.send(JSON.stringify({
      type: 'room.reconnect',
      requestId: 'bad-reconnect',
      roomCode: session.roomCode,
      seatToken: 'not-the-seat-token',
    }));

    await expect(errorPromise).resolves.toMatchObject({ code: 'INVALID_SEAT_TOKEN' });
    expect(await closePromise).toBe(4401);
  });

  it('notifies the remaining phone and releases both seats when a player leaves', async () => {
    const { playerA, playerB } = await createJoinedSockets();
    const ackPromise = nextMessage(playerA, message => message.type === 'room.left');
    const peerClosedPromise = nextMessage(playerB, message => message.type === 'room.closed');

    playerA.send(JSON.stringify({ type: 'room.leave', requestId: 'leave-a' }));

    await expect(ackPromise).resolves.toEqual({ type: 'room.left', requestId: 'leave-a' });
    await expect(peerClosedPromise).resolves.toMatchObject({ type: 'room.closed', code: 'PEER_LEFT' });

    const newSessionPromise = nextMessage(playerB, message => message.type === 'room.session');
    playerB.send(JSON.stringify({ type: 'room.create', requestId: 'new-room' }));
    await expect(newSessionPromise).resolves.toMatchObject({
      type: 'room.session',
      requestId: 'new-room',
      localPlayerId: 'A',
    });
  });

  async function createJoinedSockets() {
    const playerA = await connect(server.webSocketUrl);
    const aSessionPromise = nextMessage(playerA, message => message.type === 'room.session');
    playerA.send(JSON.stringify({ type: 'room.create', requestId: 'create-a' }));
    const aSession = await aSessionPromise;
    if (aSession.type !== 'room.session') throw new Error('Expected Player A room session.');

    const playerB = await connect(server.webSocketUrl);
    const pendingPromise = nextMessage(playerA, message => message.type === 'room.application.pending');
    playerB.send(
      JSON.stringify({ type: 'room.join', requestId: 'join-b', roomCode: aSession.roomCode }),
    );
    const pending = await pendingPromise;
    if (pending.type !== 'room.application.pending') throw new Error('Expected a join application.');
    const bSessionPromise = nextMessage(playerB, message => message.type === 'room.session');
    playerA.send(JSON.stringify({
      type: 'room.application.decision',
      applicationId: pending.application.applicationId,
      approved: true,
    }));
    await bSessionPromise;
    const aPlayingPromise = nextMessage(
      playerA,
      message => message.type === 'room.snapshot' && message.snapshot.phase === 'playing',
    );
    const bPlayingPromise = nextMessage(
      playerB,
      message => message.type === 'room.snapshot' && message.snapshot.phase === 'playing',
    );
    playerA.send(JSON.stringify({ type: 'room.ready', actionId: 'helper-a-ready', ready: true }));
    playerB.send(JSON.stringify({ type: 'room.ready', actionId: 'helper-b-ready', ready: true }));
    await Promise.all([aPlayingPromise, bPlayingPromise]);
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
