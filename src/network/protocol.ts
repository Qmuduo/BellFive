import { canRing, countVisibleItems } from '../game/rules';
import { FRUIT_TYPES, GAME_ELEMENTS } from '../game/types';
import type {
  CardDefinition,
  GameState,
  PlayerId,
  RingOutcome,
  VisibleCounts,
} from '../game/types';

export type RoomPhase = 'waiting' | 'playing' | 'connection-paused' | 'finished';

export type ClientMessage =
  | { type: 'room.create'; requestId: string }
  | { type: 'room.join'; requestId: string; roomCode: string }
  | { type: 'room.leave'; requestId: string }
  | {
      type: 'room.reconnect';
      requestId: string;
      roomCode: string;
      seatToken: string;
    }
  | { type: 'game.flip'; actionId: string }
  | { type: 'game.ring'; actionId: string; tableVersion: number }
  | { type: 'game.rematch'; actionId: string };

export type PlayerSnapshot = Readonly<{
  connected: boolean;
  drawCount: number | null;
  playedCount: number | null;
  topCard: CardDefinition | null;
}>;

export type RingFeedbackEvent = Readonly<{
  version: number;
  caller: PlayerId;
  outcome: RingOutcome;
  movedCardCount: number;
}>;

export type RoomSnapshot = Readonly<{
  roomCode: string;
  phase: RoomPhase;
  localPlayerId: PlayerId;
  players: Readonly<Record<PlayerId, PlayerSnapshot>>;
  turn: PlayerId | null;
  winner: PlayerId | null;
  lastRingOutcome: RingOutcome | null;
  visibleCounts: VisibleCounts | null;
  canRing: boolean;
  tableVersion: number;
  ringVersion?: number;
  remainingSeconds: number | null;
  ringBlockedUntilFlip: Readonly<Record<PlayerId, boolean>>;
  lastRingEvent: RingFeedbackEvent | null;
}>;

export type RoomSnapshotSource = Readonly<{
  roomCode: string;
  phase: RoomPhase;
  game: GameState | null;
  connected: Readonly<Record<PlayerId, boolean>>;
  tableVersion: number;
  ringVersion?: number;
  remainingSeconds: number | null;
  lastRingEvent: RingFeedbackEvent | null;
}>;

export type ServerMessage =
  | {
      type: 'room.session';
      requestId: string;
      roomCode: string;
      localPlayerId: PlayerId;
      seatToken: string;
      snapshot: RoomSnapshot;
    }
  | { type: 'room.snapshot'; snapshot: RoomSnapshot }
  | { type: 'room.left'; requestId: string }
  | { type: 'room.closed'; code: string; message: string }
  | {
      type: 'action.result';
      actionId: string;
      accepted: boolean;
      outcome?: RingOutcome;
      movedCardCount?: number;
    }
  | {
      type: 'error';
      requestId?: string;
      actionId?: string;
      code: string;
      message: string;
    };

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export function decodeClientMessage(raw: string): ClientMessage | null {
  const value = parseJson(raw);
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'room.create':
    case 'room.leave':
      return isNonEmptyString(value.requestId)
        ? { type: value.type, requestId: value.requestId }
        : null;
    case 'room.join':
      return isNonEmptyString(value.requestId) && isRoomCode(value.roomCode)
        ? { type: 'room.join', requestId: value.requestId, roomCode: value.roomCode }
        : null;
    case 'room.reconnect':
      return isNonEmptyString(value.requestId) &&
        isRoomCode(value.roomCode) &&
        isNonEmptyString(value.seatToken)
        ? {
            type: 'room.reconnect',
            requestId: value.requestId,
            roomCode: value.roomCode,
            seatToken: value.seatToken,
          }
        : null;
    case 'game.flip':
    case 'game.rematch':
      return isNonEmptyString(value.actionId)
        ? { type: value.type, actionId: value.actionId }
        : null;
    case 'game.ring':
      return isNonEmptyString(value.actionId) &&
        isNonNegativeInteger(value.tableVersion)
        ? {
            type: 'game.ring',
            actionId: value.actionId,
            tableVersion: value.tableVersion,
          }
        : null;
    default:
      return null;
  }
}

export function decodeServerMessage(raw: string): ServerMessage | null {
  const value = parseJson(raw);
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'room.session':
      if (
        !isNonEmptyString(value.requestId) ||
        !isRoomCode(value.roomCode) ||
        !isPlayerId(value.localPlayerId) ||
        !isNonEmptyString(value.seatToken) ||
        !isRoomSnapshot(value.snapshot) ||
        value.snapshot.roomCode !== value.roomCode ||
        value.snapshot.localPlayerId !== value.localPlayerId
      ) {
        return null;
      }
      return {
        type: 'room.session',
        requestId: value.requestId,
        roomCode: value.roomCode,
        localPlayerId: value.localPlayerId,
        seatToken: value.seatToken,
        snapshot: value.snapshot,
      };
    case 'room.snapshot':
      return isRoomSnapshot(value.snapshot)
        ? { type: 'room.snapshot', snapshot: value.snapshot }
        : null;
    case 'room.left':
      return isNonEmptyString(value.requestId)
        ? { type: 'room.left', requestId: value.requestId }
        : null;
    case 'room.closed':
      return isNonEmptyString(value.code) && isNonEmptyString(value.message)
        ? { type: 'room.closed', code: value.code, message: value.message }
        : null;
    case 'action.result':
      if (
        !isNonEmptyString(value.actionId) ||
        typeof value.accepted !== 'boolean' ||
        (value.outcome !== undefined && !isRingOutcome(value.outcome)) ||
        (value.movedCardCount !== undefined && !isNonNegativeInteger(value.movedCardCount))
      ) {
        return null;
      }
      return {
        type: 'action.result',
        actionId: value.actionId,
        accepted: value.accepted,
        ...(value.outcome === undefined ? {} : { outcome: value.outcome }),
        ...(value.movedCardCount === undefined
          ? {}
          : { movedCardCount: value.movedCardCount }),
      };
    case 'error':
      if (
        (value.requestId !== undefined && !isNonEmptyString(value.requestId)) ||
        (value.actionId !== undefined && !isNonEmptyString(value.actionId)) ||
        !isNonEmptyString(value.code) ||
        !isNonEmptyString(value.message)
      ) {
        return null;
      }
      return {
        type: 'error',
        ...(value.requestId === undefined ? {} : { requestId: value.requestId }),
        ...(value.actionId === undefined ? {} : { actionId: value.actionId }),
        code: value.code,
        message: value.message,
      };
    default:
      return null;
  }
}

export function createRoomSnapshot(
  source: RoomSnapshotSource,
  localPlayerId: PlayerId,
): RoomSnapshot {
  const players = {} as Record<PlayerId, PlayerSnapshot>;

  for (const playerId of ['A', 'B'] as const) {
    const player = source.game?.players[playerId];
    const topCard = player?.playedPile[0];

    players[playerId] = {
      connected: source.connected[playerId],
      drawCount: player ? player.drawPile.length : null,
      playedCount: player ? player.playedPile.length : null,
      topCard: topCard ? { id: topCard.id, symbols: [...topCard.symbols] } : null,
    };
  }

  const visibleCounts = source.game ? countVisibleItems(source.game) : null;

  return {
    roomCode: source.roomCode,
    phase: source.phase,
    localPlayerId,
    players,
    turn: source.game?.turn ?? null,
    winner: source.game?.winner ?? null,
    lastRingOutcome: source.game?.lastRingOutcome ?? null,
    visibleCounts,
    canRing: visibleCounts ? canRing(visibleCounts) : false,
    tableVersion: source.tableVersion,
    ringVersion: source.ringVersion ?? 0,
    remainingSeconds: source.remainingSeconds,
    ringBlockedUntilFlip: source.game?.ringBlockedUntilFlip ?? { A: false, B: false },
    lastRingEvent: source.lastRingEvent,
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRoomSnapshot(value: unknown): value is RoomSnapshot {
  if (!isRecord(value) || !isRoomCode(value.roomCode)) return false;
  if (!['waiting', 'playing', 'connection-paused', 'finished'].includes(String(value.phase))) {
    return false;
  }
  if (
    !isPlayerId(value.localPlayerId) ||
    !isRecord(value.players) ||
    !isPlayerSnapshot(value.players.A) ||
    !isPlayerSnapshot(value.players.B) ||
    !(value.turn === null || isPlayerId(value.turn)) ||
    !(value.winner === null || isPlayerId(value.winner)) ||
    !(value.lastRingOutcome === null || isRingOutcome(value.lastRingOutcome)) ||
    !(value.visibleCounts === null || isVisibleCounts(value.visibleCounts)) ||
    typeof value.canRing !== 'boolean' ||
    !isNonNegativeInteger(value.tableVersion) ||
    (value.ringVersion !== undefined && !isNonNegativeInteger(value.ringVersion)) ||
    !isNullableNonNegativeInteger(value.remainingSeconds) ||
    !isPlayerBooleanRecord(value.ringBlockedUntilFlip) ||
    !(value.lastRingEvent === null || isRingFeedbackEvent(value.lastRingEvent))
  ) {
    return false;
  }
  return true;
}

function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  return (
    isRecord(value) &&
    typeof value.connected === 'boolean' &&
    isNullableNonNegativeInteger(value.drawCount) &&
    isNullableNonNegativeInteger(value.playedCount) &&
    (value.topCard === null || isCardDefinition(value.topCard))
  );
}

function isCardDefinition(value: unknown): value is CardDefinition {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    Array.isArray(value.symbols) &&
    value.symbols.length >= 1 &&
    value.symbols.length <= 5 &&
    value.symbols.every(symbol => GAME_ELEMENTS.includes(symbol as (typeof GAME_ELEMENTS)[number]))
  );
}

function isVisibleCounts(value: unknown): value is VisibleCounts {
  if (!isRecord(value) || !isNonNegativeInteger(value.wildBellCount)) return false;
  return FRUIT_TYPES.every(fruit => isNonNegativeInteger(value[fruit]));
}

function isPlayerBooleanRecord(value: unknown): value is Record<PlayerId, boolean> {
  return (
    isRecord(value) &&
    typeof value.A === 'boolean' &&
    typeof value.B === 'boolean'
  );
}

function isRingFeedbackEvent(value: unknown): value is RingFeedbackEvent {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.version) &&
    value.version > 0 &&
    isPlayerId(value.caller) &&
    isRingOutcome(value.outcome) &&
    isNonNegativeInteger(value.movedCardCount)
  );
}

function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

function isPlayerId(value: unknown): value is PlayerId {
  return value === 'A' || value === 'B';
}

function isRingOutcome(value: unknown): value is RingOutcome {
  return value === 'correct' || value === 'wrong';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}
