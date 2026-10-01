import { randomUUID } from 'node:crypto';
import { canPlayerRing, createGame, finishGameByTimeout, flipCard, ringBell } from '../../src/game/engine';
import { createRoomSnapshot } from '../../src/network/protocol';
import type {
  ClientMessage,
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
  flipVersion: number;
  lastFlipEvent: { version: number; player: PlayerId } | null;
  matchDeadlineAt: number | null;
  pausedRemainingMs: number | null;
  lastPublishedSeconds: number | null;
  actionResults: Record<PlayerId, Map<string, Extract<ServerMessage, { type: 'action.result' }>>>;
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
    this.pruneExpiredRooms(this.now());

    switch (message.type) {
      case 'room.create':
        return this.createRoom(connectionId, message.requestId, message.profile);
      case 'room.join':
        return this.joinRoom(connectionId, message.requestId, message.roomCode, message.profile);
      case 'room.reconnect':
        return this.reconnectRoom(
          connectionId,
          message.requestId,
          message.roomCode,
          message.seatToken,
        );
      case 'room.leave':
        return this.leaveRoom(connectionId, message.requestId);
      default:
        return this.handleGameAction(connectionId, message);
    }
  }

  disconnect(connectionId: string): RoomManagerEvent[] {
    const connection = this.connectionToSeat.get(connectionId);
    if (!connection) return [];

    this.connectionToSeat.delete(connectionId);
    const room = this.rooms.get(connection.roomCode);
    const seat = room?.seats[connection.playerId];
    if (!room || !seat || seat.connectionId !== connectionId) return [];

    seat.connectionId = null;
    const now = this.now();
    room.lastActivityAt = now;
    this.updateRoomPhase(room, now);
    return this.snapshotEvents(room);
  }

  pruneExpiredRooms(now = this.now()): string[] {
    const expiredCodes: string[] = [];

    for (const room of this.rooms.values()) {
      const waitingExpired =
        room.phase === 'waiting' && now - room.createdAt >= WAITING_ROOM_TTL_MS;
      const idleExpired = now - room.lastActivityAt >= ROOM_IDLE_TTL_MS;
      if (!waitingExpired && !idleExpired) continue;

      for (const seat of Object.values(room.seats)) {
        if (seat?.connectionId) this.connectionToSeat.delete(seat.connectionId);
      }
      this.rooms.delete(room.roomCode);
      expiredCodes.push(room.roomCode);
    }

    return expiredCodes;
  }

  tick(now = this.now()): RoomManagerEvent[] {
    this.pruneExpiredRooms(now);
    const events: RoomManagerEvent[] = [];

    for (const room of this.rooms.values()) {
      if (room.phase !== 'playing' || room.matchDeadlineAt === null || !room.game) continue;

      const remainingSeconds = this.secondsRemaining(room, now);
      if (remainingSeconds === 0) {
        room.game = finishGameByTimeout(room.game);
        room.phase = 'finished';
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
      flipVersion: 0,
      lastFlipEvent: null,
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
    if (room.seats.B || room.phase === 'finished') {
      return [this.errorEvent(connectionId, 'ROOM_FULL', 'This room already has two players.', requestId)];
    }

    const token = this.tokenFactory();
    room.seats.B = {
      playerId: 'B',
      token,
      connectionId,
      profile: sanitizePlayerProfile(profile ?? DEFAULT_PLAYER_PROFILE, 'B'),
    };
    this.connectionToSeat.set(connectionId, { roomCode, playerId: 'B' });
    const now = this.now();
    room.lastActivityAt = now;
    this.updateRoomPhase(room, now);

    const events: RoomManagerEvent[] = [
      this.event(connectionId, {
        type: 'room.session',
        requestId,
        roomCode,
        localPlayerId: 'B',
        seatToken: token,
        snapshot: this.snapshotFor(room, 'B'),
      }),
    ];
    events.push(...this.snapshotEvents(room, connectionId));
    return events;
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
    return events;
  }

  private leaveRoom(connectionId: string, requestId: string): RoomManagerEvent[] {
    const connection = this.connectionToSeat.get(connectionId);
    const room = connection ? this.rooms.get(connection.roomCode) : undefined;
    const seat = connection ? room?.seats[connection.playerId] : undefined;
    if (!connection || !room || !seat || seat.connectionId !== connectionId) {
      return [this.event(connectionId, { type: 'room.left', requestId })];
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

    this.rooms.delete(room.roomCode);
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

    if (expiredEvents.length > 0 && message.type !== 'game.rematch') {
      return [
        ...expiredEvents,
        ...this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'GAME_FINISHED', 'The match has finished.'),
      ];
    }

    if (room.phase === 'connection-paused') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'CONNECTION_PAUSED', 'Wait for both players to reconnect.');
    }
    if (!room.game || room.phase === 'waiting') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'GAME_NOT_STARTED', 'The match starts when both players join.');
    }
    if (
      (room.phase === 'finished' || room.game.status === 'finished') &&
      message.type !== 'game.rematch'
    ) {
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

    if (connection.playerId !== 'A') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'HOST_ONLY', 'Only Player A can start a rematch.');
    }
    if (room.game.status !== 'finished') {
      return this.rejectedAction(room, connectionId, connection.playerId, message.actionId, 'GAME_NOT_FINISHED', 'A rematch is available after game over.');
    }

    room.game = this.gameFactory();
    room.tableVersion += 1;
    room.lastRingEvent = null;
    room.lastFlipEvent = null;
    room.phase = 'playing';
    room.matchDeadlineAt = now + this.matchDurationMs;
    room.pausedRemainingMs = null;
    room.lastPublishedSeconds = Math.ceil(this.matchDurationMs / 1000);
    room.lastActivityAt = now;
    const actionEvents = this.acceptedAction(room, connectionId, connection.playerId, {
      type: 'action.result',
      actionId: message.actionId,
      accepted: true,
    });
    return [...expiredEvents, ...actionEvents];
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
    if (!bothConnected) {
      this.pauseClock(room, now);
      room.phase = 'connection-paused';
      return;
    }
    if (!room.game) room.game = this.gameFactory();
    if (room.game.status === 'finished') {
      this.freezeClock(room, now);
      room.phase = 'finished';
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
    };
    return createRoomSnapshot(source, localPlayerId);
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
