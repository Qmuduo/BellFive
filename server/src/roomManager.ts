import { randomUUID } from 'node:crypto';
import { canPlayerRing, createGame, finishGameByTimeout, flipCard, ringBell } from '../../src/game/engine';
import { createRoomSnapshot } from '../../src/network/protocol';
import type {
  ClientMessage,
  JoinApplication,
  OpenRoomSummary,
  RoomPhase,
  RoomSnapshot,
  RoomSnapshotSource,
  RingFeedbackEvent,
  ServerMessage,
} from '../../src/network/protocol';
import type { GameState, PlayerId } from '../../src/game/types';
import { DEFAULT_PLAYER_PROFILE, sanitizePlayerProfile } from '../../src/profile';
import type { PlayerProfile, PlayerProfileInput } from '../../src/profile';

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
export const WAITING_ROOM_TTL_MS = 15 * 60 * 1000;
export const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
export const MATCH_DURATION_MS = 5 * 60 * 1000;
const REMEMBERED_ACTION_LIMIT = 128;

type RoomSeat = {
  playerId: PlayerId;
  token: string;
  connectionId: string | null;
  profile: PlayerProfile;
};

type RoomRecord = {
  roomCode: string;
  createdAt: number;
  lastActivityAt: number;
  phase: RoomPhase;
  seats: Partial<Record<PlayerId, RoomSeat>>;
  game: GameState | null;
  tableVersion: number;
  ringVersion: number;
  lastRingEvent: RingFeedbackEvent | null;
  ringHistory: RingFeedbackEvent[];
  flipVersion: number;
  lastFlipEvent: { version: number; player: PlayerId } | null;
  ready: Record<PlayerId, boolean>;
  matchDeadlineAt: number | null;
  pausedRemainingMs: number | null;
  lastPublishedSeconds: number | null;
  actionResults: Record<PlayerId, Map<string, Extract<ServerMessage, { type: 'action.result' }>>>;
};

type PendingApplication = JoinApplication & {
  requestId: string;
  connectionId: string;
};

export type RoomManagerEvent = Readonly<{
  connectionId: string;
  message: ServerMessage;
}>;

export type RoomManagerOptions = Readonly<{
  now?: () => number;
  random?: () => number;
  tokenFactory?: () => string;
  gameFactory?: () => GameState;
  matchDurationMs?: number;
}>;

type ActionMessage = Extract<ClientMessage, { type: 'game.flip' | 'game.ring' | 'game.rematch' }>;

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly connectionToSeat = new Map<string, { roomCode: string; playerId: PlayerId }>();
  private readonly lobbySubscribers = new Set<string>();
  private readonly applications = new Map<string, PendingApplication>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly tokenFactory: () => string;
  private readonly gameFactory: () => GameState;
  private readonly matchDurationMs: number;

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.tokenFactory = options.tokenFactory ?? randomUUID;
    this.gameFactory = options.gameFactory ?? (() => createGame(this.random));
    this.matchDurationMs = options.matchDurationMs ?? MATCH_DURATION_MS;
  }

  handleMessage(connectionId: string, message: ClientMessage): RoomManagerEvent[] {
    const maintenance = this.expireRooms(this.now());
    let events: RoomManagerEvent[];

    switch (message.type) {
      case 'room.create':
        events = this.createRoom(connectionId, message.requestId, message.profile);
        break;
      case 'room.join':
        events = this.joinRoom(connectionId, message.requestId, message.roomCode, message.profile);
        break;
      case 'room.lobby.subscribe':
        this.lobbySubscribers.add(connectionId);
        events = [this.lobbySnapshotEvent(connectionId)];
        break;
      case 'room.lobby.refresh':
        events = [this.lobbySnapshotEvent(connectionId)];
        break;
      case 'room.lobby.unsubscribe':
        this.lobbySubscribers.delete(connectionId);
        events = [];
        break;
      case 'room.application.decision':
        events = this.decideApplication(connectionId, message.applicationId, message.approved);
        break;
      case 'room.application.cancel':
        events = this.cancelApplication(connectionId, message.applicationId);
        break;
      case 'room.ready':
        events = this.handleReady(connectionId, message.actionId, message.ready);
        break;
      case 'room.reconnect':
        events = this.reconnectRoom(
          connectionId,
          message.requestId,
          message.roomCode,
          message.seatToken,
        );
        break;
      case 'room.leave':
        events = this.leaveRoom(connectionId, message.requestId);
        break;
      default:
        events = this.handleGameAction(connectionId, message);
    }

    const maintenanceEvents = [...maintenance.events, ...events];
    if (maintenance.roomCodes.length > 0) maintenanceEvents.push(...this.lobbySnapshotEvents());
    return maintenanceEvents;
  }

  disconnect(connectionId: string): RoomManagerEvent[] {
    this.lobbySubscribers.delete(connectionId);
    const applicationEvents = this.cancelApplicationsForRequester(connectionId);
    const connection = this.connectionToSeat.get(connectionId);
    if (!connection) return applicationEvents;

    this.connectionToSeat.delete(connectionId);
    const room = this.rooms.get(connection.roomCode);
    const seat = room?.seats[connection.playerId];
    if (!room || !seat || seat.connectionId !== connectionId) return applicationEvents;

    seat.connectionId = null;
    const now = this.now();
    room.lastActivityAt = now;
    if (room.phase === 'waiting' || room.phase === 'finished') {
      room.ready = { A: false, B: false };
    }
    this.updateRoomPhase(room, now);
    return [...applicationEvents, ...this.snapshotEvents(room), ...this.lobbySnapshotEvents()];
  }

  pruneExpiredRooms(now = this.now()): string[] {
    return this.expireRooms(now).roomCodes;
  }

  private expireRooms(now: number): { roomCodes: string[]; events: RoomManagerEvent[] } {
    const roomCodes: string[] = [];
    const events: RoomManagerEvent[] = [];

    for (const room of this.rooms.values()) {
      const waitingExpired =
        room.phase === 'waiting' && now - room.createdAt >= WAITING_ROOM_TTL_MS;
      const idleExpired = now - room.lastActivityAt >= ROOM_IDLE_TTL_MS;
      if (!waitingExpired && !idleExpired) continue;

      events.push(...this.clearApplicationsForRoom(room.roomCode, 'This room has expired.'));
      for (const seat of Object.values(room.seats)) {
        if (seat?.connectionId) this.connectionToSeat.delete(seat.connectionId);
      }
      this.rooms.delete(room.roomCode);
      roomCodes.push(room.roomCode);
    }

    return { roomCodes, events };
  }

  tick(now = this.now()): RoomManagerEvent[] {
    const maintenance = this.expireRooms(now);
    const events: RoomManagerEvent[] = [...maintenance.events];
    if (maintenance.roomCodes.length > 0) events.push(...this.lobbySnapshotEvents());

    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing' || room.matchDeadlineAt === null || !room.game) continue;

      const remainingSeconds = this.secondsRemaining(room, now);
      if (remainingSeconds === 0) {
        room.game = finishGameByTimeout(room.game);
        room.phase = 'finished';
        room.ready = { A: false, B: false };
        room.matchDeadlineAt = null;
        room.pausedRemainingMs = 0;
        room.lastPublishedSeconds = 0;
        events.push(...this.snapshotEvents(room, undefined, now));
        continue;
      }

      if (remainingSeconds !== room.lastPublishedSeconds) {
        room.lastPublishedSeconds = remainingSeconds;
        events.push(...this.snapshotEvents(room, undefined, now));
      }
    }

    return events;
  }

  private createRoom(
    connectionId: string,
    requestId: string,
    profile?: PlayerProfileInput,
  ): RoomManagerEvent[] {
    if (this.connectionToSeat.has(connectionId)) {
      return [this.errorEvent(connectionId, 'ALREADY_IN_ROOM', 'This connection already has a room seat.', requestId)];
    }

    const roomCode = this.generateRoomCode();
    if (!roomCode) {
      return [this.errorEvent(connectionId, 'ROOM_CAPACITY', 'Could not allocate a room code.', requestId)];
    }

    const token = this.tokenFactory();
    const now = this.now();
    const room: RoomRecord = {
      roomCode,
      createdAt: now,
      lastActivityAt: now,
      phase: 'waiting',
      seats: {
        A: {
          playerId: 'A',
          token,
          connectionId,
          profile: sanitizePlayerProfile(profile ?? DEFAULT_PLAYER_PROFILE, 'A'),
        },
      },
      game: null,
      tableVersion: 0,
      ringVersion: 0,
      lastRingEvent: null,
      ringHistory: [],
      flipVersion: 0,
      lastFlipEvent: null,
      ready: { A: false, B: false },
      matchDeadlineAt: null,
      pausedRemainingMs: null,
      lastPublishedSeconds: null,
      actionResults: { A: new Map(), B: new Map() },
    };

    this.rooms.set(roomCode, room);
    this.connectionToSeat.set(connectionId, { roomCode, playerId: 'A' });
    const snapshot = this.snapshotFor(room, 'A');
    return [
      this.event(connectionId, {
        type: 'room.session',
        requestId,
        roomCode,
        localPlayerId: 'A',
        seatToken: token,
        snapshot,
      }),
      ...this.lobbySnapshotEvents(),
    ];
  }

  private joinRoom(
    connectionId: string,
    requestId: string,
    roomCode: string,
    profile?: PlayerProfileInput,
  ): RoomManagerEvent[] {
    if (this.connectionToSeat.has(connectionId)) {
      return [this.errorEvent(connectionId, 'ALREADY_IN_ROOM', 'This connection already has a room seat.', requestId)];
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return [this.errorEvent(connectionId, 'ROOM_NOT_FOUND', 'Room code was not found or has expired.', requestId)];
    }
    if (room.seats.B || room.phase !== 'waiting') {
      return [this.errorEvent(connectionId, 'ROOM_FULL', 'This room already has two players.', requestId)];
    }
    if (!room.seats.A?.connectionId) {
      return [this.errorEvent(connectionId, 'ROOM_NOT_WAITING', 'The room creator is not currently available.', requestId)];
    }

    const existing = [...this.applications.values()].find(
      application => application.roomCode === roomCode && application.connectionId === connectionId,
    );
    if (existing) {
      return [this.applicationStatusEvent(connectionId, existing.applicationId, 'pending', 'Waiting for the room creator to approve.')];
    }

    const application: PendingApplication = {
      applicationId: randomUUID(),
      requestId,
      roomCode,
      connectionId,
      profile: sanitizePlayerProfile(profile ?? DEFAULT_PLAYER_PROFILE, 'B'),
    };
    this.applications.set(application.applicationId, application);
    room.lastActivityAt = this.now();
    return [
      this.event(room.seats.A.connectionId, {
        type: 'room.application.pending',
        application: this.publicApplication(application),
      }),
      this.applicationStatusEvent(connectionId, application.applicationId, 'pending', 'Waiting for the room creator to approve.'),
    ];
  }

  private decideApplication(
    connectionId: string,
    applicationId: string,
    approved: boolean,
  ): RoomManagerEvent[] {
    const application = this.applications.get(applicationId);
    if (!application) {
      return [this.errorEvent(connectionId, 'APPLICATION_NOT_FOUND', 'This join request is no longer pending.')];
    }
    const hostConnection = this.connectionToSeat.get(connectionId);
    if (
      !hostConnection ||
      hostConnection.roomCode !== application.roomCode ||
      hostConnection.playerId !== 'A'
    ) {
      return [this.errorEvent(connectionId, 'HOST_ONLY', 'Only the room creator can decide join requests.')];
    }

    const room = this.rooms.get(application.roomCode);
    if (!room || room.seats.A?.connectionId !== connectionId) {
      this.applications.delete(applicationId);
      return [
        this.applicationStatusEvent(application.connectionId, applicationId, 'cancelled', 'This room is no longer available.'),
      ];
    }

    if (!approved) {
      this.applications.delete(applicationId);
      return [
        this.applicationStatusEvent(application.connectionId, applicationId, 'rejected', 'The room creator declined your request.'),
      ];
    }

    if (room.seats.B || room.phase !== 'waiting') {
      this.applications.delete(applicationId);
      return [
        this.applicationStatusEvent(application.connectionId, applicationId, 'room_full', 'The room is no longer available.'),
        this.applicationStatusEvent(connectionId, applicationId, 'room_full', 'This request could not be approved because the room is full.'),
      ];
    }

    const token = this.tokenFactory();
    room.seats.B = {
      playerId: 'B',
      token,
      connectionId: application.connectionId,
      profile: application.profile,
    };
    room.ready = { A: false, B: false };
    room.actionResults.A.clear();
    room.actionResults.B.clear();
    this.connectionToSeat.set(application.connectionId, { roomCode: room.roomCode, playerId: 'B' });
    this.applications.delete(applicationId);
    const now = this.now();
    room.lastActivityAt = now;
    this.updateRoomPhase(room, now);

    const events: RoomManagerEvent[] = [
      this.event(application.connectionId, {
        type: 'room.session',
        requestId: application.requestId,
        roomCode: room.roomCode,
        localPlayerId: 'B',
        seatToken: token,
        snapshot: this.snapshotFor(room, 'B', now),
      }),
      ...this.snapshotEvents(room, application.connectionId, now),
    ];
    events.push(...this.cancelApplicationsForRequester(application.connectionId));
    events.push(...this.clearApplicationsForRoom(room.roomCode, 'The room has been filled.', 'room_full'));
    events.push(...this.lobbySnapshotEvents());
    return events;
  }

  private cancelApplication(connectionId: string, applicationId: string): RoomManagerEvent[] {
    const application = this.applications.get(applicationId);
    if (!application || application.connectionId !== connectionId) {
      return [this.errorEvent(connectionId, 'APPLICATION_NOT_FOUND', 'This join request is no longer pending.')];
    }

    this.applications.delete(applicationId);
    const room = this.rooms.get(application.roomCode);
    const hostConnectionId = room?.seats.A?.connectionId;
    return [
      ...(hostConnectionId
        ? [this.applicationStatusEvent(hostConnectionId, applicationId, 'cancelled', 'The applicant cancelled the request.')]
        : []),
      this.applicationStatusEvent(connectionId, applicationId, 'cancelled', 'Your join request was cancelled.'),
    ];
  }

  private reconnectRoom(
    connectionId: string,
    requestId: string,
    roomCode: string,
    seatToken: string,
  ): RoomManagerEvent[] {
    if (this.connectionToSeat.has(connectionId)) {
      return [this.errorEvent(connectionId, 'ALREADY_IN_ROOM', 'This connection already has a room seat.', requestId)];
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      return [this.errorEvent(connectionId, 'ROOM_NOT_FOUND', 'Room code was not found or has expired.', requestId)];
    }

    const playerId: PlayerId | null =
      room.seats.A?.token === seatToken ? 'A' : room.seats.B?.token === seatToken ? 'B' : null;
    if (!playerId) {
      return [this.errorEvent(connectionId, 'INVALID_SEAT_TOKEN', 'This seat token is not valid for the room.', requestId)];
    }

    const seat = room.seats[playerId];
    if (!seat) {
      return [this.errorEvent(connectionId, 'INVALID_SEAT_TOKEN', 'This seat token is not valid for the room.', requestId)];
    }

    if (seat.connectionId) this.connectionToSeat.delete(seat.connectionId);
    seat.connectionId = connectionId;
    this.connectionToSeat.set(connectionId, { roomCode, playerId });
    const now = this.now();
    room.lastActivityAt = now;
    this.updateRoomPhase(room, now);

    const events: RoomManagerEvent[] = [
      this.event(connectionId, {
        type: 'room.session',
        requestId,
        roomCode,
        localPlayerId: playerId,
        seatToken: seat.token,
        snapshot: this.snapshotFor(room, playerId),
      }),
    ];
    events.push(...this.snapshotEvents(room, connectionId));
    if (playerId === 'A') {
      for (const application of this.applications.values()) {
        if (application.roomCode === room.roomCode) {
          events.push(this.event(connectionId, {
            type: 'room.application.pending',
            application: this.publicApplication(application),
          }));
        }
      }
    }
    events.push(...this.lobbySnapshotEvents());
    return events;
  }

  private leaveRoom(connectionId: string, requestId: string): RoomManagerEvent[] {
    const connection = this.connectionToSeat.get(connectionId);
    const room = connection ? this.rooms.get(connection.roomCode) : undefined;
    const seat = connection ? room?.seats[connection.playerId] : undefined;
    if (!connection || !room || !seat || seat.connectionId !== connectionId) {
      return [
        this.event(connectionId, { type: 'room.left', requestId }),
        ...this.cancelApplicationsForRequester(connectionId),
      ];
    }

    const events: RoomManagerEvent[] = [
      this.event(connectionId, { type: 'room.left', requestId }),
    ];
    for (const otherSeat of Object.values(room.seats)) {
      const otherConnectionId = otherSeat?.connectionId;
      if (!otherConnectionId) continue;
      this.connectionToSeat.delete(otherConnectionId);
      if (otherConnectionId !== connectionId) {
        events.push(this.event(otherConnectionId, {
          type: 'room.closed',
          code: 'PEER_LEFT',
          message: 'The other player left the room.',
        }));
      }
    }

    events.push(...this.clearApplicationsForRoom(room.roomCode, 'The room creator closed this room.'));
    this.rooms.delete(room.roomCode);
    events.push(...this.lobbySnapshotEvents());
    return events;
  }

  private handleGameAction(connectionId: string, message: ActionMessage): RoomManagerEvent[] {
    const connection = this.connectionToSeat.get(connectionId);
    if (!connection) {
      return [this.errorEvent(connectionId, 'NOT_IN_ROOM', 'Join a room before sending game actions.', undefined, message.actionId)];
    }

    const room = this.rooms.get(connection.roomCode);
    const seat = room?.seats[connection.playerId];
    if (!room || !seat || seat.connectionId !== connectionId) {
      return [this.errorEvent(connectionId, 'NOT_IN_ROOM', 'The room session is no longer active.', undefined, message.actionId)];
    }

    const now = this.now();
    const expiredEvents = this.finishMatchIfExpired(room, now);
    const previousResult = room.actionResults[connection.playerId].get(message.actionId);
    if (previousResult) {
      return [
        ...expiredEvents,
        this.event(connectionId, previousResult),
        this.event(connectionId, { type: 'room.snapshot', snapshot: this.snapshotFor(room, connection.playerId, now) }),
      ];
    }

    if (expiredEvents.length > 0) {
      return [
        ...expiredEvents,
        ...this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'GAME_FINISHED', 'The match has finished.'),
      ];
    }

    if (message.type === 'game.rematch') {
      return this.rejectedAction(
        room,
        connectionId,
        connection.playerId,
        message.actionId,
        'READY_REQUIRED',
        'Both players must ready up to start the next match.',
      );
    }

    if (room.phase === 'connection-paused') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'CONNECTION_PAUSED', 'Wait for both players to reconnect.');
    }
    if (!room.game || room.phase === 'waiting') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'GAME_NOT_STARTED', 'The match starts when both players are ready.');
    }
    if (room.phase === 'finished' || room.game.status === 'finished') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'GAME_FINISHED', 'The match has finished.');
    }

    if (message.type === 'game.flip') {
      if (room.game.turn !== connection.playerId) {
        return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'NOT_YOUR_TURN', 'Only the player whose turn it is can flip.');
      }

      const hadCard = room.game.players[connection.playerId].drawPile.length > 0;
      room.game = flipCard(room.game);
      if (hadCard) {
        room.tableVersion += 1;
        room.flipVersion += 1;
        room.lastFlipEvent = { version: room.flipVersion, player: connection.playerId };
      }
      this.updateRoomPhase(room);
      room.lastActivityAt = now;
      const actionEvents = this.acceptedAction(room, connectionId, connection.playerId, {
        type: 'action.result',
        actionId: message.actionId,
        accepted: true,
      });
      return [...expiredEvents, ...actionEvents];
    }

    if (message.type === 'game.ring') {
      if (!canPlayerRing(room.game, connection.playerId)) {
        return this.rejectedAction(
          room,
          connectionId,
          connection.playerId,
          message.actionId,
          'RING_COOLDOWN',
          'Flip one card before ringing again.',
        );
      }
      if (message.tableVersion !== room.tableVersion) {
        return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'STALE_TABLE', 'The visible cards changed before this ring reached the server.');
      }

      const result = ringBell(room.game, connection.playerId);
      room.game = result.state;
      room.ringVersion += 1;
      room.lastRingEvent = {
        version: room.ringVersion,
        caller: connection.playerId,
        outcome: result.outcome,
        movedCardCount: result.movedCardCount,
      };
      room.ringHistory = [...room.ringHistory, room.lastRingEvent].slice(-12);
      if (result.outcome === 'correct') room.tableVersion += 1;
      this.updateRoomPhase(room);
      room.lastActivityAt = now;
      const actionEvents = this.acceptedAction(room, connectionId, connection.playerId, {
        type: 'action.result',
        actionId: message.actionId,
        accepted: true,
        outcome: result.outcome,
        movedCardCount: result.movedCardCount,
      });
      return [...expiredEvents, ...actionEvents];
    }

    return [];
  }

  private handleReady(
    connectionId: string,
    actionId: string,
    ready: boolean,
  ): RoomManagerEvent[] {
    const connection = this.connectionToSeat.get(connectionId);
    if (!connection) {
      return [this.errorEvent(connectionId, 'NOT_IN_ROOM', 'Join a room before readying up.', undefined, actionId)];
    }
    const room = this.rooms.get(connection.roomCode);
    const seat = room?.seats[connection.playerId];
    if (!room || !seat || seat.connectionId !== connectionId) {
      return [this.errorEvent(connectionId, 'NOT_IN_ROOM', 'The room session is no longer active.', undefined, actionId)];
    }

    const now = this.now();
    const expiredEvents = this.finishMatchIfExpired(room, now);
    const cached = room.actionResults[connection.playerId].get(actionId);
    if (cached) {
      return [
        ...expiredEvents,
        this.event(connectionId, cached),
        this.event(connectionId, { type: 'room.snapshot', snapshot: this.snapshotFor(room, connection.playerId, now) }),
      ];
    }

    if (room.phase !== 'waiting' && room.phase !== 'finished') {
      return [
        ...expiredEvents,
        this.errorEvent(connectionId, 'READY_NOT_AVAILABLE', 'Readiness can only change before a match starts.', undefined, actionId),
        this.event(connectionId, { type: 'room.snapshot', snapshot: this.snapshotFor(room, connection.playerId, now) }),
      ];
    }

    room.ready[connection.playerId] = ready;
    room.lastActivityAt = now;
    if (
      room.seats.A?.connectionId &&
      room.seats.B?.connectionId &&
      room.ready.A &&
      room.ready.B
    ) {
      this.startMatch(room, now);
    }

    const actionEvents = this.acceptedAction(room, connectionId, connection.playerId, {
      type: 'action.result',
      actionId,
      accepted: true,
    });
    return [...expiredEvents, ...actionEvents];
  }

  private startMatch(room: RoomRecord, now: number): void {
    room.game = this.gameFactory();
    room.phase = 'playing';
    room.ready = { A: true, B: true };
    room.lastRingEvent = null;
    room.ringHistory = [];
    room.lastFlipEvent = null;
    room.matchDeadlineAt = now + this.matchDurationMs;
    room.pausedRemainingMs = null;
    room.lastPublishedSeconds = Math.ceil(this.matchDurationMs / 1000);
    room.lastActivityAt = now;
    room.actionResults.A.clear();
    room.actionResults.B.clear();
  }

  private acceptedAction(
    room: RoomRecord,
    connectionId: string,
    playerId: PlayerId,
    result: Extract<ServerMessage, { type: 'action.result' }>,
  ): RoomManagerEvent[] {
    const results = room.actionResults[playerId];
    results.set(result.actionId, result);
    if (results.size > REMEMBERED_ACTION_LIMIT) {
      const firstActionId = results.keys().next().value;
      if (firstActionId) results.delete(firstActionId);
    }

    return [this.event(connectionId, result), ...this.snapshotEvents(room)];
  }

  private rejectedAction(
    room: RoomRecord,
    connectionId: string,
    playerId: PlayerId,
    actionId: string,
    code: string,
    message: string,
  ): RoomManagerEvent[] {
    return [
      this.errorEvent(connectionId, code, message, undefined, actionId),
      this.event(connectionId, { type: 'room.snapshot', snapshot: this.snapshotFor(room, playerId) }),
    ];
  }

  private updateRoomPhase(room: RoomRecord, now = this.now()): void {
    const bothSeatsAssigned = Boolean(room.seats.A && room.seats.B);
    const bothConnected = Boolean(room.seats.A?.connectionId && room.seats.B?.connectionId);

    if (!bothSeatsAssigned) {
      this.pauseClock(room, now);
      room.phase = 'waiting';
      return;
    }
    if (room.game?.status === 'finished') {
      this.freezeClock(room, now);
      if (room.phase !== 'finished') room.ready = { A: false, B: false };
      room.phase = 'finished';
      return;
    }
    if (!bothConnected) {
      this.pauseClock(room, now);
      room.phase = room.game ? 'connection-paused' : 'waiting';
      return;
    }
    if (!room.game || !room.ready.A || !room.ready.B) {
      this.pauseClock(room, now);
      room.phase = 'waiting';
      return;
    }

    if (room.pausedRemainingMs !== null) {
      room.matchDeadlineAt = now + room.pausedRemainingMs;
      room.lastPublishedSeconds = Math.ceil(room.pausedRemainingMs / 1000);
      room.pausedRemainingMs = null;
    } else if (room.matchDeadlineAt === null && room.lastPublishedSeconds === null) {
      this.startClock(room, now);
    }
    room.phase = 'playing';
  }

  private snapshotEvents(
    room: RoomRecord,
    excludedConnectionId?: string,
    now = this.now(),
  ): RoomManagerEvent[] {
    const events: RoomManagerEvent[] = [];
    for (const playerId of ['A', 'B'] as const) {
      const connectionId = room.seats[playerId]?.connectionId;
      if (!connectionId || connectionId === excludedConnectionId) continue;
      events.push(this.event(connectionId, {
        type: 'room.snapshot',
        snapshot: this.snapshotFor(room, playerId, now),
      }));
    }
    return events;
  }

  private snapshotFor(room: RoomRecord, localPlayerId: PlayerId, now = this.now()): RoomSnapshot {
    const source: RoomSnapshotSource = {
      roomCode: room.roomCode,
      phase: room.phase,
      game: room.game,
      connected: {
        A: Boolean(room.seats.A?.connectionId),
        B: Boolean(room.seats.B?.connectionId),
      },
      profiles: {
        A: room.seats.A?.profile ?? sanitizePlayerProfile(DEFAULT_PLAYER_PROFILE, 'A'),
        B: room.seats.B?.profile ?? sanitizePlayerProfile(DEFAULT_PLAYER_PROFILE, 'B'),
      },
      tableVersion: room.tableVersion,
      ringVersion: room.ringVersion,
      remainingSeconds: this.snapshotSecondsRemaining(room, now),
      lastRingEvent: room.lastRingEvent,
      lastFlipEvent: room.lastFlipEvent,
      ready: room.ready,
      ringHistory: room.ringHistory,
    };
    return createRoomSnapshot(source, localPlayerId);
  }

  private lobbySnapshotEvent(connectionId: string): RoomManagerEvent {
    return this.event(connectionId, { type: 'room.lobby.snapshot', rooms: this.openRoomSummaries() });
  }

  private lobbySnapshotEvents(): RoomManagerEvent[] {
    const rooms = this.openRoomSummaries();
    return [...this.lobbySubscribers].map(connectionId => this.event(connectionId, {
      type: 'room.lobby.snapshot',
      rooms,
    }));
  }

  private openRoomSummaries(): OpenRoomSummary[] {
    return [...this.rooms.values()]
      .filter(room => room.phase === 'waiting' && !room.seats.B && Boolean(room.seats.A?.connectionId))
      .map(room => ({
        roomCode: room.roomCode,
        hostProfile: room.seats.A?.profile ?? sanitizePlayerProfile(DEFAULT_PLAYER_PROFILE, 'A'),
      }));
  }

  private publicApplication(application: PendingApplication): JoinApplication {
    return {
      applicationId: application.applicationId,
      roomCode: application.roomCode,
      profile: application.profile,
    };
  }

  private applicationStatusEvent(
    connectionId: string,
    applicationId: string,
    status: 'pending' | 'rejected' | 'cancelled' | 'room_full',
    message: string,
  ): RoomManagerEvent {
    return this.event(connectionId, {
      type: 'room.application.status',
      applicationId,
      status,
      message,
    });
  }

  private cancelApplicationsForRequester(connectionId: string): RoomManagerEvent[] {
    const events: RoomManagerEvent[] = [];
    for (const application of this.applications.values()) {
      if (application.connectionId !== connectionId) continue;
      this.applications.delete(application.applicationId);
      const hostConnectionId = this.rooms.get(application.roomCode)?.seats.A?.connectionId;
      if (hostConnectionId) {
        events.push(this.applicationStatusEvent(
          hostConnectionId,
          application.applicationId,
          'cancelled',
          'The applicant disconnected.',
        ));
      }
    }
    return events;
  }

  private clearApplicationsForRoom(
    roomCode: string,
    message: string,
    status: 'cancelled' | 'room_full' = 'cancelled',
  ): RoomManagerEvent[] {
    const events: RoomManagerEvent[] = [];
    const hostConnectionId = this.rooms.get(roomCode)?.seats.A?.connectionId;
    for (const application of this.applications.values()) {
      if (application.roomCode !== roomCode) continue;
      this.applications.delete(application.applicationId);
      events.push(this.applicationStatusEvent(
        application.connectionId,
        application.applicationId,
        status,
        message,
      ));
      if (hostConnectionId) {
        events.push(this.applicationStatusEvent(
          hostConnectionId,
          application.applicationId,
          status,
          message,
        ));
      }
    }
    return events;
  }

  private startClock(room: RoomRecord, now: number): void {
    room.matchDeadlineAt = now + this.matchDurationMs;
    room.pausedRemainingMs = null;
    room.lastPublishedSeconds = Math.ceil(this.matchDurationMs / 1000);
  }

  private pauseClock(room: RoomRecord, now: number): void {
    if (room.matchDeadlineAt === null) return;
    room.pausedRemainingMs = Math.max(0, room.matchDeadlineAt - now);
    room.matchDeadlineAt = null;
    room.lastPublishedSeconds = Math.ceil(room.pausedRemainingMs / 1000);
  }

  private freezeClock(room: RoomRecord, now: number): void {
    if (room.matchDeadlineAt === null) return;
    room.pausedRemainingMs = Math.max(0, room.matchDeadlineAt - now);
    room.matchDeadlineAt = null;
    room.lastPublishedSeconds = Math.ceil(room.pausedRemainingMs / 1000);
  }

  private secondsRemaining(room: RoomRecord, now: number): number {
    const remainingMs = room.matchDeadlineAt === null
      ? room.pausedRemainingMs
      : Math.max(0, room.matchDeadlineAt - now);
    if (remainingMs === null) return 0;
    return Math.ceil(remainingMs / 1000);
  }

  private snapshotSecondsRemaining(room: RoomRecord, now: number): number | null {
    if (room.game === null) return null;
    if (room.matchDeadlineAt === null && room.pausedRemainingMs === null) {
      return room.lastPublishedSeconds;
    }
    return this.secondsRemaining(room, now);
  }

  private finishMatchIfExpired(room: RoomRecord, now: number): RoomManagerEvent[] {
    if (
      room.phase !== 'playing' ||
      !room.game ||
      room.matchDeadlineAt === null ||
      room.matchDeadlineAt > now
    ) {
      return [];
    }

    room.game = finishGameByTimeout(room.game);
    room.phase = 'finished';
    room.ready = { A: false, B: false };
    room.matchDeadlineAt = null;
    room.pausedRemainingMs = 0;
    room.lastPublishedSeconds = 0;
    return this.snapshotEvents(room, undefined, now);
  }

  private generateRoomCode(): string | null {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
        const value = this.random();
        const boundedValue = Math.min(0.999999999, Math.max(0, value));
        const characterIndex = Math.floor(boundedValue * ROOM_CODE_CHARACTERS.length);
        code += ROOM_CODE_CHARACTERS[characterIndex];
      }
      if (!this.rooms.has(code)) return code;
    }
    return null;
  }

  private errorEvent(
    connectionId: string,
    code: string,
    message: string,
    requestId?: string,
    actionId?: string,
  ): RoomManagerEvent {
    return this.event(connectionId, {
      type: 'error',
      ...(requestId === undefined ? {} : { requestId }),
      ...(actionId === undefined ? {} : { actionId }),
      code,
      message,
    });
  }

  private event(connectionId: string, message: ServerMessage): RoomManagerEvent {
    return { connectionId, message };
  }
}
