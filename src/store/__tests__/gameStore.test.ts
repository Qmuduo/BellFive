import type { RoomSnapshot, ServerMessage } from '../../network/protocol';
import type { GameClientHandlers } from '../../network/GameClient';
import { createGameStore } from '../gameStore';
import type { GameClientPort } from '../gameStore';

describe('friend room game store', () => {
  it('creates a client room and trusts the assigned session identity', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();
    expect(fixture.client.createRoomCalls).toBe(1);

    fixture.handlers.onSession?.(makeSession('A'));
    expect(fixture.store.getState()).toMatchObject({
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: { phase: 'waiting' },
      error: null,
    });
  });

  it('sends flip and ring requests without changing the authoritative snapshot', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();
    fixture.handlers.onSession?.(makeSession('B'));
    const snapshotBefore = fixture.store.getState().roomSnapshot;

    fixture.store.getState().flip();
    fixture.store.getState().ring();

    expect(fixture.client.flipCalls).toBe(1);
    expect(fixture.client.ringCalls).toEqual([4]);
    expect(fixture.store.getState().roomSnapshot).toBe(snapshotBefore);
    expect(fixture.store.getState().localPlayerId).toBe('B');
  });

  it('replaces the displayed room snapshot when the server updates it', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();
    fixture.handlers.onSession?.(makeSession('A'));
    const nextSnapshot = { ...makeSession('A').snapshot, turn: 'B' as const, tableVersion: 5 };

    fixture.handlers.onSnapshot?.(nextSnapshot);

    expect(fixture.store.getState().roomSnapshot).toEqual(nextSnapshot);
  });

  it('keeps server errors visible and clears the room on leave', () => {
    const fixture = makeStore();
    fixture.store.getState().joinRoom('BAD123');
    fixture.handlers.onError?.({ code: 'ROOM_NOT_FOUND', message: 'Room was not found.' });
    expect(fixture.store.getState().error?.message).toBe('Room was not found.');

    fixture.handlers.onSession?.(makeSession('B'));
    fixture.store.getState().leaveRoom();
    expect(fixture.client.leaveRoomCalls).toBe(1);
    expect(fixture.store.getState()).toMatchObject({
      roomCode: null,
      localPlayerId: null,
      roomSnapshot: null,
      leavingRoom: true,
    });
    fixture.store.getState().createRoom();
    fixture.store.getState().joinRoom('XYZ234');
    expect(fixture.client.createRoomCalls).toBe(0);
    expect(fixture.client.joinRoomCalls).toEqual(['BAD123']);
    fixture.handlers.onRoomLeft?.();
    expect(fixture.store.getState().leavingRoom).toBe(false);
  });

  it('returns to the lobby when the server reports that the room closed', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();
    fixture.handlers.onSession?.(makeSession('B'));

    fixture.handlers.onRoomClosed?.({
      type: 'room.closed',
      code: 'PEER_LEFT',
      message: 'The other player left the room.',
    });

    expect(fixture.store.getState()).toMatchObject({
      roomCode: null,
      localPlayerId: null,
      roomSnapshot: null,
      connectionStatus: 'disconnected',
      leavingRoom: false,
      error: { code: 'PEER_LEFT' },
    });
  });

  it('returns to the lobby when a reconnect discovers the room no longer exists', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();
    fixture.handlers.onSession?.(makeSession('A'));
    fixture.handlers.onError?.({ code: 'ROOM_NOT_FOUND', message: 'The room service restarted.' });

    expect(fixture.store.getState()).toMatchObject({
      roomCode: null,
      localPlayerId: null,
      roomSnapshot: null,
      leavingRoom: false,
      error: { code: 'ROOM_NOT_FOUND' },
    });
  });

  it('clears a previous error when the player tries a new action', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();
    fixture.handlers.onError?.({ code: 'NOT_YOUR_TURN', message: 'Wait for your turn.' });
    fixture.store.getState().flip();
    expect(fixture.store.getState().error).toBeNull();
  });
});

function makeStore() {
  const fixture = { handlers: {} as GameClientHandlers, client: null as FakeGameClient | null };
  const store = createGameStore(handlers => {
    fixture.handlers = handlers;
    fixture.client = new FakeGameClient();
    return fixture.client;
  });
  return {
    store,
    get handlers() { return fixture.handlers; },
    get client() { return fixture.client!; },
  };
}

class FakeGameClient implements GameClientPort {
  createRoomCalls = 0;
  joinRoomCalls: string[] = [];
  flipCalls = 0;
  ringCalls: number[] = [];
  rematchCalls = 0;
  disconnectCalls = 0;
  leaveRoomCalls = 0;

  createRoom(): string {
    this.createRoomCalls += 1;
    return 'request-create';
  }

  joinRoom(code: string): string {
    this.joinRoomCalls.push(code);
    return 'request-join';
  }

  flip(): string {
    this.flipCalls += 1;
    return 'action-flip';
  }

  ring(tableVersion: number): string {
    this.ringCalls.push(tableVersion);
    return 'action-ring';
  }

  rematch(): string {
    this.rematchCalls += 1;
    return 'action-rematch';
  }

  disconnect(): void {
    this.disconnectCalls += 1;
  }

  leaveRoom(): void {
    this.leaveRoomCalls += 1;
  }
}

function makeSession(localPlayerId: 'A' | 'B'): Extract<ServerMessage, { type: 'room.session' }> {
  const snapshot: RoomSnapshot = {
    roomCode: 'ABCD23',
    phase: 'waiting',
    localPlayerId,
    players: {
      A: { connected: true, drawCount: null, playedCount: null, topCard: null },
      B: { connected: false, drawCount: null, playedCount: null, topCard: null },
    },
    turn: null,
    winner: null,
    lastRingOutcome: null,
    visibleCounts: null,
    canRing: false,
    tableVersion: 4,
  };
  return {
    type: 'room.session',
    requestId: 'request-1',
    roomCode: 'ABCD23',
    localPlayerId,
    seatToken: 'seat-token',
    snapshot,
  };
}
