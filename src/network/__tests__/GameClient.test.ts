import type { RoomSnapshot, ServerMessage } from '../protocol';
import { GameClient } from '../GameClient';
import type { GameClientHandlers, SocketHandlers, SocketLike } from '../GameClient';

describe('GameClient room commands', () => {
  it('subscribes to the public lobby and refreshes it on the same connection', () => {
    const { client, sockets } = createClient();
    client.subscribeLobby();
    expect(sockets).toHaveLength(1);
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    expect(sockets[0].sentMessages()).toEqual([{ type: 'room.lobby.subscribe' }]);

    client.refreshLobby();
    client.unsubscribeLobby();
    expect(sockets[0].sentMessages()).toEqual([
      { type: 'room.lobby.subscribe' },
      { type: 'room.lobby.refresh' },
      { type: 'room.lobby.unsubscribe' },
    ]);
    expect(sockets).toHaveLength(1);
  });

  it('keeps room applications in the lobby until an approved room session arrives', () => {
    const received = { rooms: [] as unknown[], applications: [] as unknown[], statuses: [] as unknown[], sessions: 0 };
    const { client, sockets } = createClient({
      handlers: {
        onLobbySnapshot: rooms => received.rooms.push(...rooms),
        onPendingApplication: application => received.applications.push(application),
        onApplicationStatus: status => received.statuses.push(status),
        onSession: () => { received.sessions += 1; },
      },
    });
    client.subscribeLobby();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive({ type: 'room.lobby.snapshot', rooms: [
      { roomCode: 'ABCD23', hostProfile: { nickname: 'Mira', avatarId: 'peach' } },
    ] });

    client.applyToRoom('ABCD23');
    expect(sockets).toHaveLength(1);
    const joinMessage = sockets[0].sentMessages().slice(-1)[0];
    expect(joinMessage).toMatchObject({
      type: 'room.join', roomCode: 'ABCD23',
    });
    sockets[0].receive({
      type: 'room.application.status',
      applicationId: 'app-1', status: 'pending', message: 'Waiting for approval.',
    });
    expect(client.getStatus()).toBe('connected');
    sockets[0].receive({
      type: 'room.application.status',
      applicationId: 'app-1', status: 'rejected', message: 'Request declined.',
    });
    client.refreshLobby();
    expect(client.getStatus()).toBe('connected');
    expect(sockets).toHaveLength(1);

    client.applyToRoom('ABCD23');
    sockets[0].receive({
      type: 'room.application.status',
      applicationId: 'app-2', status: 'pending', message: 'Waiting for approval.',
    });
    sockets[0].receive(makeSession('B'));

    expect(received.rooms).toHaveLength(1);
    expect(received.applications).toEqual([]);
    expect(received.statuses.map(status => (status as { status: string }).status)).toEqual([
      'pending', 'rejected', 'pending',
    ]);
    expect(received.sessions).toBe(1);
    expect(sockets[0].sentMessages().slice(-1)[0]).toEqual({ type: 'room.lobby.unsubscribe' });
  });

  it('reconnects the lobby without replaying a rejected join application', () => {
    jest.useFakeTimers();
    const { client, sockets } = createClient({ reconnectDelayMs: 20 });
    client.subscribeLobby();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    client.applyToRoom('ABCD23');
    sockets[0].receive({
      type: 'room.application.status',
      applicationId: 'app-rejected', status: 'pending', message: 'Waiting for approval.',
    });
    sockets[0].receive({
      type: 'room.application.status',
      applicationId: 'app-rejected', status: 'rejected', message: 'Request declined.',
    });
    sockets[0].closeFromServer();
    jest.advanceTimersByTime(20);

    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].receive({ type: 'session.authenticated', userId: 'user-a' });
    expect(sockets[1].sentMessages()).toEqual([{ type: 'room.lobby.subscribe' }]);
    expect(client.getStatus()).toBe('connected');
    client.disconnect();
    jest.useRealTimers();
  });

  it('sends approval decisions, cancels, and ready changes as explicit room commands', () => {
    const { client, sockets } = createClient();
    client.subscribeLobby();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });

    client.decideApplication('app-1', true);
    client.cancelApplication('app-2');
    const readyId = client.setReady(true);
    expect(sockets[0].sentMessages()).toEqual([
      { type: 'room.lobby.subscribe' },
      { type: 'room.application.decision', applicationId: 'app-1', approved: true },
      { type: 'room.application.cancel', applicationId: 'app-2' },
      { type: 'room.ready', actionId: readyId, ready: true },
    ]);
  });

  it('cancels a pending application before creating a room on the same socket', () => {
    const { client, sockets } = createClient();
    client.subscribeLobby();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    client.applyToRoom('ABCD23');
    sockets[0].receive({
      type: 'room.application.status',
      applicationId: 'app-local', status: 'pending', message: 'Waiting for approval.',
    });

    client.createRoom();

    expect(sockets[0].sentMessages().slice(-2)).toEqual([
      { type: 'room.application.cancel', applicationId: 'app-local' },
      expect.objectContaining({ type: 'room.create' }),
    ]);
    sockets[0].receive(makeSession('A'));
    expect(sockets[0].sentMessages().slice(-1)).toEqual([{ type: 'room.lobby.unsubscribe' }]);
  });

  it('keeps room creation busy on an open lobby socket until the server assigns the room', () => {
    const { client, sockets } = createClient();
    client.subscribeLobby();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    expect(client.getStatus()).toBe('connected');

    client.createRoom();
    expect(client.getStatus()).toBe('connecting');

    sockets[0].receive(makeSession('A'));
    expect(client.getStatus()).toBe('connected');
  });

  it('sends create and join requests after authentication', () => {
    const { client, sockets } = createClient();
    const createRequestId = client.createRoom();
    expect(client.getStatus()).toBe('connecting');
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    expect(sockets[0].sentMessages()).toEqual([
      { type: 'room.create', requestId: createRequestId },
    ]);

    client.disconnect();
    client.joinRoom(' abcd23 ');
    sockets[1].open();
    sockets[1].receive({ type: 'session.authenticated', userId: 'user-a' });
    expect(sockets[1].sentMessages()).toMatchObject([
      { type: 'room.lobby.subscribe' },
      { type: 'room.join', roomCode: 'ABCD23' },
    ]);
  });

  it('sends local flip and ring intents with unique IDs and the displayed table version', () => {
    const { client, sockets } = createClient();
    client.createRoom();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
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
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
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
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('A'));
    const actionId = client.flip();

    sockets[0].closeFromServer();
    expect(client.getStatus()).toBe('reconnecting');
    jest.advanceTimersByTime(100);

    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].receive({ type: 'session.authenticated', userId: 'user-a' });
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
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('B'));
    client.disconnect();
    jest.advanceTimersByTime(1_000);

    expect(sockets).toHaveLength(1);
    expect(client.getStatus()).toBe('disconnected');
    jest.useRealTimers();
  });

  it('stops reconnecting when the server rejects the saved seat token', () => {
    jest.useFakeTimers();
    const { client, sockets } = createClient({ reconnectDelayMs: 100 });
    client.createRoom();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('A'));
    sockets[0].closeFromServer();
    jest.advanceTimersByTime(100);
    sockets[1].open();
    sockets[1].receive({ type: 'session.authenticated', userId: 'user-a' });
    const reconnect = sockets[1].sentMessages()[0] as { requestId: string };
    sockets[1].receive({
      type: 'error',
      requestId: reconnect.requestId,
      code: 'INVALID_SEAT_TOKEN',
      message: 'The session is no longer valid.',
    });
    jest.advanceTimersByTime(1_000);

    expect(client.getStatus()).toBe('error');
    expect(sockets).toHaveLength(2);
    jest.useRealTimers();
  });

  it('reports a failed create or join connection so the lobby can offer a retry', () => {
    const errors: string[] = [];
    const { client, sockets } = createClient({
      handlers: { onError: error => errors.push(error.code) },
    });
    client.createRoom();
    sockets[0].closeFromServer();

    expect(client.getStatus()).toBe('disconnected');
    expect(errors).toEqual(['CONNECTION_CLOSED']);
  });

  it('sends a room leave request and closes its session after acknowledgment', () => {
    const completed: string[] = [];
    const { client, sockets } = createClient({ handlers: { onRoomLeft: () => completed.push('left') } });
    client.createRoom();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('A'));

    const requestId = client.leaveRoom();
    if (!requestId) throw new Error('Expected an active room leave request.');

    expect(sockets[0].sentMessages()).toContainEqual({ type: 'room.leave', requestId });
    expect(client.getRoomCode()).toBe('ABCD23');
    sockets[0].receive({ type: 'room.left', requestId });
    expect(client.getRoomCode()).toBeNull();
    expect(client.getStatus()).toBe('disconnected');
    expect(sockets[0].closed).toBe(true);
    expect(completed).toEqual(['left']);
  });

  it('clears its session and reports when the other player closes the room', () => {
    const closed: string[] = [];
    const { client, sockets } = createClient({
      handlers: { onRoomClosed: message => closed.push(message.code) },
    });
    client.createRoom();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('B'));

    sockets[0].receive({
      type: 'room.closed',
      code: 'PEER_LEFT',
      message: 'The other player left the room.',
    });

    expect(closed).toEqual(['PEER_LEFT']);
    expect(client.getRoomCode()).toBeNull();
    expect(client.getStatus()).toBe('disconnected');
    expect(sockets[0].closed).toBe(true);
  });

  it('sends a pending leave after reconnect without restoring the match UI', () => {
    jest.useFakeTimers();
    const sessions: string[] = [];
    const { client, sockets } = createClient({
      reconnectDelayMs: 100,
      handlers: { onSession: session => sessions.push(session.roomCode) },
    });
    client.createRoom();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('A'));
    sockets[0].closeFromServer();

    client.leaveRoom();
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    sockets[1].receive({ type: 'session.authenticated', userId: 'user-a' });
    expect(sockets[1].sentMessages()[0]).toMatchObject({ type: 'room.reconnect' });
    sockets[1].receive(makeSession('A'));

    const leave = sockets[1].sentMessages().find(message => (message as { type: string }).type === 'room.leave') as { requestId: string } | undefined;
    expect(leave).toBeDefined();
    expect(sessions).toEqual(['ABCD23']);
    sockets[1].receive({ type: 'room.left', requestId: leave!.requestId });
    expect(client.getRoomCode()).toBeNull();
    jest.useRealTimers();
  });

  it('retries an unacknowledged leave with the same request ID', () => {
    jest.useFakeTimers();
    const { client, sockets } = createClient();
    client.createRoom();
    sockets[0].open();
    sockets[0].receive({ type: 'session.authenticated', userId: 'user-a' });
    sockets[0].receive(makeSession('A'));
    const requestId = client.leaveRoom();
    if (!requestId) throw new Error('Expected an active room leave request.');

    jest.advanceTimersByTime(2_000);

    expect(sockets[0].sentMessages()).toEqual([
      expect.objectContaining({ type: 'room.create' }),
      { type: 'room.leave', requestId },
      { type: 'room.leave', requestId },
    ]);
    sockets[0].receive({ type: 'room.left', requestId });
    jest.advanceTimersByTime(4_000);
    expect(client.getRoomCode()).toBeNull();
    expect(sockets[0].sentMessages()).toHaveLength(3);
    jest.useRealTimers();
  });
});

function createClient(options: { reconnectDelayMs?: number; handlers?: GameClientHandlers } = {}) {
  const sockets: FakeSocket[] = [];
  const client = new GameClient({
    url: 'ws://localhost:8787',
    authToken: 'test-token',
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
      A: { connected: true, drawCount: 30, playedCount: 0, topCard: null, profile: { nickname: 'Player A', avatarId: 'strawberry' } },
      B: { connected: true, drawCount: 30, playedCount: 0, topCard: null, profile: { nickname: 'Player B', avatarId: 'strawberry' } },
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
    ringVersion: 0,
    remainingSeconds: 300,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null,
    lastFlipEvent: null,
    ready: { A: false, B: false },
    ringHistory: [],
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
    return this.messages.map(message => JSON.parse(message) as { type: string }).filter(message => message.type !== 'session.authenticate');
  }

  get closed(): boolean {
    return this.isClosed;
  }
}
