import { randomUUID } from 'node:crypto';
import { canPlayerRing, createGame, flipCard, ringBell } from '../../src/game/engine';
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

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
export const WAITING_ROOM_TTL_MS = 15 * 60 * 1000;
export const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;
const REMEMBERED_ACTION_LIMIT = 128;

type RoomSeat = {
  playerId: PlayerId;
  token: string;
  connectionId: string | null;
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
}>;

type ActionMessage = Extract<ClientMessage, { type: 'game.flip' | 'game.ring' | 'game.rematch' }>;

export class RoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly connectionToSeat = new Map<string, { roomCode: string; playerId: PlayerId }>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly tokenFactory: () => string;
  private readonly gameFactory: () => GameState;

  constructor(options: RoomManagerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.tokenFactory = options.tokenFactory ?? randomUUID;
    this.gameFactory = options.gameFactory ?? (() => createGame(this.random));
  }

  handleMessage(connectionId: string, message: ClientMessage): RoomManagerEvent[] {
    this.pruneExpiredRooms(this.now());

    switch (message.type) {
      case 'room.create':
        return this.createRoom(connectionId, message.requestId);
      case 'room.join':
        return this.joinRoom(connectionId, message.requestId, message.roomCode);
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
    room.lastActivityAt = this.now();
    this.updateRoomPhase(room);
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

  private createRoom(connectionId: string, requestId: string): RoomManagerEvent[] {
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
        A: { playerId: 'A', token, connectionId },
      },
      game: null,
      tableVersion: 0,
      ringVersion: 0,
      lastRingEvent: null,
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
    room.seats.B = { playerId: 'B', token, connectionId };
    this.connectionToSeat.set(connectionId, { roomCode, playerId: 'B' });
    room.lastActivityAt = this.now();
    this.updateRoomPhase(room);

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
    room.lastActivityAt = this.now();
    this.updateRoomPhase(room);

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

    const previousResult = room.actionResults[connection.playerId].get(message.actionId);
    if (previousResult) {
      return [
        this.event(connectionId, previousResult),
        this.event(connectionId, { type: 'room.snapshot', snapshot: this.snapshotFor(room, connection.playerId) }),
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
      if (hadCard) room.tableVersion += 1;
      this.updateRoomPhase(room);
      room.lastActivityAt = this.now();
      return this.acceptedAction(room, connectionId, connection.playerId, {
        type: 'action.result',
        actionId: message.actionId,
        accepted: true,
      });
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
      room.lastActivityAt = this.now();
      return this.acceptedAction(room, connectionId, connection.playerId, {
        type: 'action.result',
        actionId: message.actionId,
        accepted: true,
        outcome: result.outcome,
        movedCardCount: result.movedCardCount,
      });
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
    room.phase = 'playing';
    room.lastActivityAt = this.now();
    return this.acceptedAction(room, connectionId, connection.playerId, {
      type: 'action.result',
      actionId: message.actionId,
      accepted: true,
    });
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

  private updateRoomPhase(room: RoomRecord): void {
    const bothSeatsAssigned = Boolean(room.seats.A && room.seats.B);
    const bothConnected = Boolean(room.seats.A?.connectionId && room.seats.B?.connectionId);

    if (!bothSeatsAssigned) {
      room.phase = 'waiting';
      return;
    }
    if (!bothConnected) {
      room.phase = 'connection-paused';
      return;
    }
    if (!room.game) room.game = this.gameFactory();
    room.phase = room.game.status === 'finished' ? 'finished' : 'playing';
  }

  private snapshotEvents(room: RoomRecord, excludedConnectionId?: string): RoomManagerEvent[] {
    const events: RoomManagerEvent[] = [];
    for (const playerId of ['A', 'B'] as const) {
      const connectionId = room.seats[playerId]?.connectionId;
      if (!connectionId || connectionId === excludedConnectionId) continue;
      events.push(this.event(connectionId, {
        type: 'room.snapshot',
        snapshot: this.snapshotFor(room, playerId),
      }));
    }
    return events;
  }

  private snapshotFor(room: RoomRecord, localPlayerId: PlayerId): RoomSnapshot {
    const source: RoomSnapshotSource = {
      roomCode: room.roomCode,
      phase: room.phase,
      game: room.game,
      connected: {
        A: Boolean(room.seats.A?.connectionId),
        B: Boolean(room.seats.B?.connectionId),
      },
      tableVersion: room.tableVersion,
      ringVersion: room.ringVersion,
      remainingSeconds: null,
      lastRingEvent: room.lastRingEvent,
    };
    return createRoomSnapshot(source, localPlayerId);
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
