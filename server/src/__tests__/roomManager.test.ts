import type { ClientMessage, ServerMessage } from '../../../src/network/protocol';
import type { CardDefinition, GameElement, GameState } from '../../../src/game/types';
import { RoomManager } from '../roomManager';
import type { RoomManagerEvent } from '../roomManager';

describe('RoomManager room lifecycle', () => {
  it('creates a waiting room with Player A and a unique readable code', () => {
    let randomValue = 0;
    const rooms = new RoomManager({
      now: () => 10,
      random: () => (randomValue++ % 32) / 32,
      tokenFactory: () => 'seat-a',
    });

    const created = rooms.handleMessage('socket-a', {
      type: 'room.create',
      requestId: 'create-a',
    });
    const session = messageOf(created, 'socket-a', 'room.session');

    expect(session.localPlayerId).toBe('A');
    expect(session.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(session.seatToken).toBe('seat-a');
    expect(session.snapshot.phase).toBe('waiting');
    expect(session.snapshot.players.A.connected).toBe(true);
    expect(session.snapshot.players.B.connected).toBe(false);
    expect(session.snapshot.players.A.drawCount).toBeNull();

    const secondRoom = rooms.handleMessage('socket-a2', {
      type: 'room.create',
      requestId: 'create-a2',
    });
    expect(messageOf(secondRoom, 'socket-a2', 'room.session').roomCode).not.toBe(
      session.roomCode,
    );
  });

  it('starts a shuffled 30/30 match when Player B joins and updates both clients', () => {
    const rooms = makeRoomManager();
    const room = createWaitingRoom(rooms);
    const events = rooms.handleMessage('socket-b', {
      type: 'room.join',
      requestId: 'join-b',
      roomCode: room.roomCode,
    });

    const bSession = messageOf(events, 'socket-b', 'room.session');
    const aSnapshot = messageOf(events, 'socket-a', 'room.snapshot');

    expect(bSession.localPlayerId).toBe('B');
    expect(bSession.snapshot.phase).toBe('playing');
    expect(bSession.snapshot.turn).toBe('A');
    expect(bSession.snapshot.players.A.drawCount).toBe(30);
    expect(bSession.snapshot.players.B.drawCount).toBe(30);
    expect(aSnapshot.snapshot.localPlayerId).toBe('A');
    expect(aSnapshot.snapshot.phase).toBe('playing');
  });

  it('rejects a third player without displacing either seat', () => {
    const rooms = makeRoomManager();
    const room = createWaitingRoom(rooms);
    rooms.handleMessage('socket-b', {
      type: 'room.join',
      requestId: 'join-b',
      roomCode: room.roomCode,
    });

    const events = rooms.handleMessage('socket-c', {
      type: 'room.join',
      requestId: 'join-c',
      roomCode: room.roomCode,
    });

    expect(messageOf(events, 'socket-c', 'error').code).toBe('ROOM_FULL');
  });

  it('accepts flips only from the current turn and broadcasts changed snapshots', () => {
    const rooms = makeRoomManager();
    const room = joinBothPlayers(rooms);

    const rejected = rooms.handleMessage('socket-b', {
      type: 'game.flip',
      actionId: 'b-flip-too-soon',
    });
    expect(messageOf(rejected, 'socket-b', 'error').code).toBe('NOT_YOUR_TURN');

    const flipped = rooms.handleMessage('socket-a', {
      type: 'game.flip',
      actionId: 'a-flip-1',
    });

    expect(messageOf(flipped, 'socket-a', 'action.result')).toMatchObject({
      actionId: 'a-flip-1',
      accepted: true,
    });
    expect(messageOf(flipped, 'socket-a', 'room.snapshot').snapshot).toMatchObject({
      turn: 'B',
      players: { A: { drawCount: 29, playedCount: 1 } },
    });
    expect(messageOf(flipped, 'socket-b', 'room.snapshot').snapshot.localPlayerId).toBe('B');
  });
});

describe('RoomManager authoritative game transitions', () => {
  it('awards every covered played card to the correct ringer', () => {
    const game = customGame({
      A: {
        drawPile: [card('C005', ['peach'])],
        playedPile: [card('C001', ['strawberry', 'strawberry']), card('C002', ['banana'])],
      },
      B: {
        drawPile: [card('C006', ['grape'])],
        playedPile: [card('C003', ['strawberry', 'strawberry', 'strawberry']), card('C004', ['pear'])],
      },
    });
    const rooms = joinBothPlayers(makeRoomManager({ gameFactory: () => game }));

    const events = rooms.manager.handleMessage('socket-b', {
      type: 'game.ring',
      actionId: 'b-correct-ring',
      tableVersion: 0,
    });
    const result = messageOf(events, 'socket-b', 'action.result');
    const snapshot = messageOf(events, 'socket-a', 'room.snapshot').snapshot;

    expect(result).toMatchObject({
      accepted: true,
      outcome: 'correct',
      movedCardCount: 4,
    });
    expect(snapshot.players.B.drawCount).toBe(5);
    expect(snapshot.players.B.playedCount).toBe(0);
    expect(snapshot.players.A.playedCount).toBe(0);
    expect(snapshot.tableVersion).toBe(1);
  });

  it('transfers at most two cards on a wrong ring and never decrements below zero', () => {
    const rooms = joinBothPlayers(
      makeRoomManager({
        gameFactory: () =>
          customGame({
            A: { drawPile: [card('C001', ['banana']), card('C002', ['pear']), card('C003', ['grape'])], playedPile: [] },
            B: { drawPile: [card('C004', ['peach'])], playedPile: [] },
          }),
      }),
    );

    const events = rooms.manager.handleMessage('socket-a', {
      type: 'game.ring',
      actionId: 'a-wrong-ring',
      tableVersion: 0,
    });
    const result = messageOf(events, 'socket-a', 'action.result');
    const snapshot = messageOf(events, 'socket-b', 'room.snapshot').snapshot;

    expect(result).toMatchObject({ accepted: true, outcome: 'wrong', movedCardCount: 2 });
    expect(snapshot.players.A.drawCount).toBe(1);
    expect(snapshot.players.B.drawCount).toBe(3);
    expect(snapshot.tableVersion).toBe(0);
  });

  it('ignores a ring for a table that was already collected without applying a penalty', () => {
    const rooms = joinBothPlayers(
      makeRoomManager({
        gameFactory: () =>
          customGame({
            A: { drawPile: [card('C005', ['peach'])], playedPile: [card('C001', ['strawberry', 'strawberry'])] },
            B: { drawPile: [card('C006', ['grape'])], playedPile: [card('C003', ['strawberry', 'strawberry', 'strawberry'])] },
          }),
      }),
    );
    rooms.manager.handleMessage('socket-a', {
      type: 'game.ring',
      actionId: 'a-ring',
      tableVersion: 0,
    });

    const stale = rooms.manager.handleMessage('socket-b', {
      type: 'game.ring',
      actionId: 'b-stale-ring',
      tableVersion: 0,
    });

    expect(messageOf(stale, 'socket-b', 'error').code).toBe('STALE_TABLE');
    expect(messageOf(stale, 'socket-b', 'room.snapshot').snapshot.players.B.drawCount).toBe(1);
    expect(messageOf(stale, 'socket-b', 'room.snapshot').snapshot.tableVersion).toBe(1);
  });

  it('deduplicates a retried wrong ring so its penalty is applied once', () => {
    const rooms = joinBothPlayers(
      makeRoomManager({
        gameFactory: () =>
          customGame({
            A: { drawPile: [card('C001', ['banana']), card('C002', ['pear']), card('C003', ['grape'])], playedPile: [] },
            B: { drawPile: [card('C004', ['peach'])], playedPile: [] },
          }),
      }),
    );
    const ring: ClientMessage = {
      type: 'game.ring',
      actionId: 'same-action-id',
      tableVersion: 0,
    };
    rooms.manager.handleMessage('socket-a', ring);

    const duplicate = rooms.manager.handleMessage('socket-a', ring);

    expect(messageOf(duplicate, 'socket-a', 'action.result')).toMatchObject({
      actionId: 'same-action-id',
      accepted: true,
      movedCardCount: 2,
    });
    expect(messageOf(duplicate, 'socket-a', 'room.snapshot').snapshot.players.A.drawCount).toBe(1);
    expect(messageOf(duplicate, 'socket-a', 'room.snapshot').snapshot.players.B.drawCount).toBe(3);
  });

  it('declares the opponent winner only when the empty player is required to flip', () => {
    const rooms = joinBothPlayers(
      makeRoomManager({
        gameFactory: () =>
          customGame({
            A: { drawPile: [card('C001', ['banana'])], playedPile: [] },
            B: { drawPile: [], playedPile: [] },
          }),
      }),
    );
    rooms.manager.handleMessage('socket-a', { type: 'game.flip', actionId: 'last-card' });
    const finished = rooms.manager.handleMessage('socket-b', {
      type: 'game.flip',
      actionId: 'empty-flip',
    });

    expect(messageOf(finished, 'socket-a', 'room.snapshot').snapshot).toMatchObject({
      phase: 'finished',
      winner: 'A',
    });
  });

  it('allows only Player A to rematch after game over and keeps the room seats', () => {
    let gameCount = 0;
    const rooms = joinBothPlayers(
      makeRoomManager({
        gameFactory: () => {
          gameCount += 1;
          return customGame({
            A: { drawPile: [card('C001', ['banana'])], playedPile: [] },
            B: { drawPile: [], playedPile: [] },
          });
        },
      }),
    );
    rooms.manager.handleMessage('socket-a', { type: 'game.flip', actionId: 'last-card' });
    rooms.manager.handleMessage('socket-b', { type: 'game.flip', actionId: 'empty-flip' });

    const unauthorized = rooms.manager.handleMessage('socket-b', {
      type: 'game.rematch',
      actionId: 'b-rematch',
    });
    expect(messageOf(unauthorized, 'socket-b', 'error').code).toBe('HOST_ONLY');

    const rematch = rooms.manager.handleMessage('socket-a', {
      type: 'game.rematch',
      actionId: 'a-rematch',
    });
    expect(gameCount).toBe(2);
    expect(messageOf(rematch, 'socket-a', 'room.snapshot').snapshot).toMatchObject({
      phase: 'playing',
      localPlayerId: 'A',
      turn: 'A',
    });
    expect(messageOf(rematch, 'socket-b', 'room.snapshot').snapshot.localPlayerId).toBe('B');
  });
});

describe('RoomManager reconnect and expiry', () => {
  it('pauses actions while a seat is disconnected and resumes after token reconnect', () => {
    const rooms = joinBothPlayers(makeRoomManager());
    const disconnected = rooms.manager.disconnect('socket-b');

    expect(messageOf(disconnected, 'socket-a', 'room.snapshot').snapshot).toMatchObject({
      phase: 'connection-paused',
      players: { B: { connected: false } },
    });
    const pausedFlip = rooms.manager.handleMessage('socket-a', {
      type: 'game.flip',
      actionId: 'paused-flip',
    });
    expect(messageOf(pausedFlip, 'socket-a', 'error').code).toBe('CONNECTION_PAUSED');

    const resumed = rooms.manager.handleMessage('socket-b2', {
      type: 'room.reconnect',
      requestId: 'reconnect-b',
      roomCode: rooms.roomCode,
      seatToken: rooms.seatTokenB,
    });
    expect(messageOf(resumed, 'socket-b2', 'room.session')).toMatchObject({
      localPlayerId: 'B',
      snapshot: { phase: 'playing' },
    });
    expect(messageOf(resumed, 'socket-a', 'room.snapshot').snapshot.players.B.connected).toBe(true);
  });

  it('rejects a mismatched reconnect token and expires waiting rooms after fifteen minutes', () => {
    let now = 100;
    const rooms = makeRoomManager({ now: () => now });
    const room = createWaitingRoom(rooms);
    const badToken = rooms.handleMessage('socket-b', {
      type: 'room.reconnect',
      requestId: 'bad-reconnect',
      roomCode: room.roomCode,
      seatToken: 'wrong-token',
    });
    expect(messageOf(badToken, 'socket-b', 'error').code).toBe('INVALID_SEAT_TOKEN');

    now += 15 * 60 * 1000 + 1;
    rooms.pruneExpiredRooms(now);
    const join = rooms.handleMessage('socket-c', {
      type: 'room.join',
      requestId: 'expired-join',
      roomCode: room.roomCode,
    });
    expect(messageOf(join, 'socket-c', 'error').code).toBe('ROOM_NOT_FOUND');
  });
});

type CustomPlayers = GameState['players'];

function makeRoomManager(overrides: {
  now?: () => number;
  random?: () => number;
  tokenFactory?: () => string;
  gameFactory?: () => GameState;
} = {}): RoomManager {
  let tokenCount = 0;
  return new RoomManager({
    now: overrides.now ?? (() => 1_000),
    random: overrides.random ?? (() => 0),
    tokenFactory: overrides.tokenFactory ?? (() => `seat-${++tokenCount}`),
    gameFactory: overrides.gameFactory,
  });
}

function createWaitingRoom(manager: RoomManager) {
  const events = manager.handleMessage('socket-a', {
    type: 'room.create',
    requestId: 'create-a',
  });
  const session = messageOf(events, 'socket-a', 'room.session');
  return { roomCode: session.roomCode, seatTokenA: session.seatToken };
}

function joinBothPlayers(manager: RoomManager) {
  const waiting = createWaitingRoom(manager);
  const events = manager.handleMessage('socket-b', {
    type: 'room.join',
    requestId: 'join-b',
    roomCode: waiting.roomCode,
  });
  const session = messageOf(events, 'socket-b', 'room.session');
  return {
    manager,
    roomCode: waiting.roomCode,
    seatTokenA: waiting.seatTokenA,
    seatTokenB: session.seatToken,
  };
}

function messageOf<T extends ServerMessage['type']>(
  events: readonly RoomManagerEvent[],
  connectionId: string,
  type: T,
): Extract<ServerMessage, { type: T }> {
  const event = events.find(
    candidate => candidate.connectionId === connectionId && candidate.message.type === type,
  );
  if (!event) throw new Error(`Missing ${type} message for ${connectionId}`);

  return event.message as Extract<ServerMessage, { type: T }>;
}

function customGame(players: CustomPlayers): GameState {
  return {
    status: 'playing',
    turn: 'A',
    winner: null,
    lastRingOutcome: null,
    players,
  };
}

function card(id: string, symbols: readonly GameElement[]): CardDefinition {
  return { id, symbols };
}
