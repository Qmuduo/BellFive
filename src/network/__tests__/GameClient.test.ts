import type { RoomSnapshot, ServerMessage } from '../protocol';
import { GameClient } from '../GameClient';
import type { GameClientHandlers, SocketHandlers, SocketLike } from '../GameClient';

describe('GameClient room commands', () => {
  it('sends create and join requests after the socket opens', () => {
    const { client, sockets } = createClient();
    const createRequestId = client.createRoom();
    expect(client.getStatus()).toBe('connecting');
    sockets[0].open();
    expect(sockets[0].sentMessages()).toEqual([
      { type: 'room.create', requestId: createRequestId },
    ]);

    client.disconnect();
    client.joinRoom(' abcd23 ');
    sockets[1].open();
    expect(sockets[1].sentMessages()).toMatchObject([
      { type: 'room.join', roomCode: 'ABCD23' },
    ]);
  });

  it('sends local flip and ring intents with unique IDs and the displayed table version', () => {
    const { client, sockets } = createClient();
    client.createRoom();
    sockets[0].open();
    sockets[0].receive(makeSession('A'));

    const flipId = client.flip();
    const ringId = client.ring(7);
    expect(sockets[0].sentMessages()).toEqual([
      expect.objectContaining({ type: 'room.create' }),
      { type: 'game.flip', actionId: flipId },
      { type: 'game.ring', actionId: ringId, tableVersion: 7 },
    ]);
  });

  it('surfaces the room session, snapshots, action results, and server errors', () => {
    const received = {
      sessions: [] as string[],
      snapshots: [] as number[],
      results: [] as string[],
      errors: [] as string[],
    };
    const { client, sockets } = createClient({
      handlers: {
        onSession: message => received.sessions.push(message.roomCode),
        onSnapshot: snapshot => received.snapshots.push(snapshot.tableVersion),
        onActionResult: message => received.results.push(message.actionId),
        onError: error => received.errors.push(error.code),
      },
    });

    client.createRoom();
    sockets[0].open();
    sockets[0].receive(makeSession('A'));
    sockets[0].receive({
      type: 'room.snapshot',
      snapshot: { ...makeSession('A').snapshot, tableVersion: 3 },
    });
    sockets[0].receive({ type: 'action.result', actionId: 'action-1', accepted: true });
    sockets[0].receive({
      type: 'error',
      code: 'NOT_YOUR_TURN',
      message: 'Only the player whose turn it is can flip.',
    });

    expect(received).toEqual({
      sessions: ['ABCD23'],
      snapshots: [3],
      results: ['action-1'],
      errors: ['NOT_YOUR_TURN'],
    });
  });

  it('reconnects with the same seat token and retries each unacknowledged action once', () => {
    jest.useFakeTimers();
    const { client, sockets } = createClient({ reconnectDelayMs: 100 });
    client.createRoom();
    sockets[0].open();
    sockets[0].receive(makeSession('A'));
    const actionId = client.flip();

    sockets[0].closeFromServer();
    expect(client.getStatus()).toBe('reconnecting');
    jest.advanceTimersByTime(100);

    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(sockets[1].sentMessages()).toEqual([
      expect.objectContaining({
        type: 'room.reconnect',
        roomCode: 'ABCD23',
        seatToken: 'secret-seat-token',
      }),
    ]);
    sockets[1].receive(makeSession('A'));

    expect(sockets[1].sentMessages()[1]).toEqual({ type: 'game.flip', actionId });
    expect(client.getStatus()).toBe('connected');
    jest.useRealTimers();
  });

  it('does not reconnect after explicit disconnect', () => {
    jest.useFakeTimers();
    const { client, sockets } = createClient({ reconnectDelayMs: 100 });
    client.createRoom();
    sockets[0].open();
    sockets[0].receive(makeSession('B'));
    client.disconnect();
    jest.advanceTimersByTime(1_000);

    expect(sockets).toHaveLength(1);
    expect(client.getStatus()).toBe('disconnected');
    jest.useRealTimers();
  });
});

function createClient(options: { reconnectDelayMs?: number; handlers?: GameClientHandlers } = {}) {
  const sockets: FakeSocket[] = [];
  const client = new GameClient({
    url: 'ws://localhost:8787',
    reconnectDelayMs: options.reconnectDelayMs ?? 10,
    handlers: options.handlers,
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  return { client, sockets };
}

function makeSession(
  localPlayerId: 'A' | 'B',
): Extract<ServerMessage, { type: 'room.session' }> {
  const snapshot: RoomSnapshot = {
    roomCode: 'ABCD23',
    phase: 'playing',
    localPlayerId,
    players: {
      A: { connected: true, drawCount: 30, playedCount: 0, topCard: null },
      B: { connected: true, drawCount: 30, playedCount: 0, topCard: null },
    },
    turn: 'A',
    winner: null,
    lastRingOutcome: null,
    visibleCounts: {
      banana: 0,
      grape: 0,
      pear: 0,
      strawberry: 0,
      peach: 0,
      wildBellCount: 0,
    },
    canRing: false,
    tableVersion: 0,
  };

  return {
    type: 'room.session',
    requestId: 'request-1',
    roomCode: 'ABCD23',
    localPlayerId,
    seatToken: 'secret-seat-token',
    snapshot,
  };
}

class FakeSocket implements SocketLike {
  private handlers: SocketHandlers | null = null;
  private messages: string[] = [];
  private isClosed = false;

  setHandlers(handlers: SocketHandlers): void {
    this.handlers = handlers;
  }

  send(message: string): void {
    this.messages.push(message);
  }

  close(): void {
    this.isClosed = true;
    this.handlers?.onClose();
  }

  open(): void {
    this.handlers?.onOpen();
  }

  receive(message: ServerMessage): void {
    this.handlers?.onMessage(JSON.stringify(message));
  }

  closeFromServer(): void {
    this.isClosed = true;
    this.handlers?.onClose();
  }

  sentMessages(): unknown[] {
    return this.messages.map(message => JSON.parse(message) as unknown);
  }

  get closed(): boolean {
    return this.isClosed;
  }
}
