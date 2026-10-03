import type { RoomSnapshot, ServerMessage } from '../../network/protocol';
import type { GameClientHandlers } from '../../network/GameClient';
import type { PlayerProfileInput } from '../../profile';
import { createGameStore } from '../gameStore';
import type { GameClientPort } from '../gameStore';

describe('friend room game store', () => {
  it('routes lobby listings and applicant status into visible store state', () => {
    const fixture = makeStore();
    fixture.store.getState().openLobby();
    expect(fixture.client.subscribeLobbyCalls).toBe(1);

    const rooms = [{ roomCode: 'ABCD23', hostProfile: { nickname: 'Mira', avatarId: 'peach' as const } }];
    fixture.handlers.onLobbySnapshot?.(rooms);
    expect(fixture.store.getState().openRooms).toEqual(rooms);

    fixture.store.getState().applyToRoom('ABCD23', { nickname: 'Kai', avatarId: 'banana' });
    expect(fixture.client.applyCalls).toEqual([{ roomCode: 'ABCD23', profile: { nickname: 'Kai', avatarId: 'banana' } }]);
    expect(fixture.store.getState().applyingRoomCode).toBe('ABCD23');
    fixture.handlers.onApplicationStatus?.({
      type: 'room.application.status',
      applicationId: 'app-local',
      status: 'pending',
      message: 'Waiting for approval.',
    });
    expect(fixture.store.getState()).toMatchObject({
      localApplicationId: 'app-local',
      localApplicationStatus: { status: 'pending' },
      applyingRoomCode: null,
    });
  });

  it('tracks host applications, decisions, cancellation, and readiness commands', () => {
    const fixture = makeStore();
    fixture.store.getState().openLobby();
    const application = {
      applicationId: 'app-host',
      roomCode: 'ABCD23',
      profile: { nickname: 'Kai', avatarId: 'banana' as const },
    };
    fixture.handlers.onPendingApplication?.(application);
    expect(fixture.store.getState().pendingApplications).toEqual([application]);

    fixture.store.getState().decideApplication('app-host', true);
    expect(fixture.client.decisionCalls).toEqual([{ applicationId: 'app-host', approved: true }]);
    expect(fixture.store.getState().pendingApplications).toEqual([]);

    fixture.store.getState().applyToRoom('ABCD23');
    fixture.handlers.onApplicationStatus?.({
      type: 'room.application.status',
      applicationId: 'app-local',
      status: 'pending',
      message: 'Waiting for approval.',
    });
    fixture.store.getState().cancelApplication();
    expect(fixture.client.cancelApplicationCalls).toEqual(['app-local']);
    fixture.store.getState().setReady(true);
    expect(fixture.client.readyCalls).toEqual([true]);
  });

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

  it('forwards the saved profile when creating or joining a room', () => {
    const fixture = makeStore();
    const creatorProfile = { nickname: 'Mira', avatarId: 'peach' };
    const joinerProfile = { nickname: 'Kai', avatarId: 'banana' };

    fixture.store.getState().createRoom(creatorProfile);
    fixture.store.getState().joinRoom('ABCD23', joinerProfile);

    expect(fixture.client.createRoomProfiles).toEqual([creatorProfile]);
    expect(fixture.client.applyCalls).toEqual([{ roomCode: 'ABCD23', profile: joinerProfile }]);
    expect(fixture.store.getState().applyingRoomCode).toBe('ABCD23');
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

  it('increments the local room session version for every session, including reconnects', () => {
    const fixture = makeStore();
    fixture.store.getState().createRoom();

    fixture.handlers.onSession?.(makeSession('A'));
    expect(fixture.store.getState().roomSessionVersion).toBe(1);

    fixture.handlers.onSession?.(makeSession('A'));
    expect(fixture.store.getState().roomSessionVersion).toBe(2);
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
    expect(fixture.client.applyCalls).toEqual([{ roomCode: 'BAD123', profile: undefined }]);
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
  createRoomProfiles: (PlayerProfileInput | undefined)[] = [];
  joinRoomCalls: string[] = [];
  joinRoomProfiles: { code: string; profile: PlayerProfileInput | undefined }[] = [];
  flipCalls = 0;
  ringCalls: number[] = [];
  rematchCalls = 0;
  subscribeLobbyCalls = 0;
  refreshLobbyCalls = 0;
  unsubscribeLobbyCalls = 0;
  applyCalls: { roomCode: string; profile: PlayerProfileInput | undefined }[] = [];
  decisionCalls: { applicationId: string; approved: boolean }[] = [];
  cancelApplicationCalls: string[] = [];
  readyCalls: boolean[] = [];
  disconnectCalls = 0;
  leaveRoomCalls = 0;

  createRoom(profile?: PlayerProfileInput): string {
    this.createRoomCalls += 1;
    this.createRoomProfiles.push(profile);
    return 'request-create';
  }

  joinRoom(code: string, profile?: PlayerProfileInput): string {
    this.joinRoomCalls.push(code);
    this.joinRoomProfiles.push({ code, profile });
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

  subscribeLobby(): void {
    this.subscribeLobbyCalls += 1;
  }

  refreshLobby(): void {
    this.refreshLobbyCalls += 1;
  }

  unsubscribeLobby(): void {
    this.unsubscribeLobbyCalls += 1;
  }

  applyToRoom(roomCode: string, profile?: PlayerProfileInput): string {
    this.applyCalls.push({ roomCode, profile });
    return 'request-apply';
  }

  decideApplication(applicationId: string, approved: boolean): void {
    this.decisionCalls.push({ applicationId, approved });
  }

  cancelApplication(applicationId: string): void {
    this.cancelApplicationCalls.push(applicationId);
  }

  setReady(ready: boolean): string {
    this.readyCalls.push(ready);
    return 'action-ready';
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
      A: { connected: true, drawCount: null, playedCount: null, topCard: null, profile: { nickname: 'Mira', avatarId: 'strawberry' } },
      B: { connected: false, drawCount: null, playedCount: null, topCard: null, profile: { nickname: 'Player B', avatarId: 'strawberry' } },
    },
    turn: null,
    winner: null,
    lastRingOutcome: null,
    visibleCounts: null,
    canRing: false,
    tableVersion: 4,
    ringVersion: 0,
    remainingSeconds: null,
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
    seatToken: 'seat-token',
    snapshot,
  };
}
