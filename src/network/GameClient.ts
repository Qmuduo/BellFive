import { decodeServerMessage } from './protocol';
import type { RoomSnapshot, ServerMessage } from './protocol';
import type { PlayerId } from '../game/types';
import { DEFAULT_PLAYER_PROFILE } from '../profile';
import type { PlayerProfileInput } from '../profile';

export type GameClientStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type SocketHandlers = Readonly<{
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
  onError: () => void;
}>;

export interface SocketLike {
  setHandlers(handlers: SocketHandlers): void;
  send(message: string): void;
  close(): void;
}

export type GameClientError = Readonly<{
  code: string;
  message: string;
  requestId?: string;
  actionId?: string;
}>;

export type GameClientHandlers = Readonly<{
  onStatusChange?: (status: GameClientStatus) => void;
  onSession?: (message: Extract<ServerMessage, { type: 'room.session' }>) => void;
  onSnapshot?: (snapshot: RoomSnapshot) => void;
  onActionResult?: (message: Extract<ServerMessage, { type: 'action.result' }>) => void;
  onRoomLeft?: () => void;
  onRoomClosed?: (message: Extract<ServerMessage, { type: 'room.closed' }>) => void;
  onError?: (error: GameClientError) => void;
}>;

export type GameClientOptions = Readonly<{
  url: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  webSocketFactory?: (url: string) => SocketLike;
  handlers?: GameClientHandlers;
}>;

type RoomRequest =
  | { type: 'room.create'; requestId: string; profile: PlayerProfileInput }
  | { type: 'room.join'; requestId: string; roomCode: string; profile: PlayerProfileInput };

type PendingAction =
  | { type: 'game.flip'; actionId: string }
  | { type: 'game.ring'; actionId: string; tableVersion: number }
  | { type: 'game.rematch'; actionId: string };

const TERMINAL_RECONNECT_ERRORS = new Set(['ROOM_NOT_FOUND', 'INVALID_SEAT_TOKEN']);

/**
 * Mobile-side transport and session adapter. Seat credentials intentionally
 * live only in this instance; a process restart returns the player to the lobby.
 */
export class GameClient {
  private readonly url: string;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly webSocketFactory: (url: string) => SocketLike;
  private readonly handlers: GameClientHandlers;
  private status: GameClientStatus = 'idle';
  private socket: SocketLike | null = null;
  private socketOpen = false;
  private intentionalDisconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private roomRequest: RoomRequest | null = null;
  private leaveRequestId: string | null = null;
  private leaveRequested = false;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private roomCode: string | null = null;
  private seatToken: string | null = null;
  private localPlayerId: PlayerId | null = null;
  private readonly pendingActions = new Map<string, PendingAction>();
  private nextIdentifier = 0;
  private connectionGeneration = 0;

  constructor(options: GameClientOptions) {
    this.url = options.url;
    this.reconnectDelayMs = options.reconnectDelayMs ?? 500;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10_000;
    this.webSocketFactory = options.webSocketFactory ?? createNativeSocket;
    this.handlers = options.handlers ?? {};
  }

  getStatus(): GameClientStatus {
    return this.status;
  }

  getRoomCode(): string | null {
    return this.roomCode;
  }

  getLocalPlayerId(): PlayerId | null {
    return this.localPlayerId;
  }

  createRoom(profile: PlayerProfileInput = DEFAULT_PLAYER_PROFILE): string {
    this.resetForNewRoomRequest();
    const requestId = this.createIdentifier('request');
    this.roomRequest = { type: 'room.create', requestId, profile: { ...profile } };
    this.connect(false);
    return requestId;
  }

  joinRoom(code: string, profile: PlayerProfileInput = DEFAULT_PLAYER_PROFILE): string {
    this.resetForNewRoomRequest();
    const requestId = this.createIdentifier('request');
    const roomCode = code.trim().toUpperCase();
    this.roomRequest = { type: 'room.join', requestId, roomCode, profile: { ...profile } };
    this.connect(false);
    return requestId;
  }

  flip(): string {
    return this.enqueueAction({ type: 'game.flip', actionId: this.createIdentifier('action') });
  }

  ring(tableVersion: number): string {
    return this.enqueueAction({
      type: 'game.ring',
      actionId: this.createIdentifier('action'),
      tableVersion,
    });
  }

  rematch(): string {
    return this.enqueueAction({ type: 'game.rematch', actionId: this.createIdentifier('action') });
  }

  leaveRoom(): string | null {
    this.clearReconnectTimer();
    this.pendingActions.clear();
    if (!this.roomCode || !this.seatToken) {
      this.disconnect();
      return null;
    }

    this.leaveRequested = true;
    if (this.socketOpen) {
      this.beginLeaveRequest();
    } else {
      this.setStatus('reconnecting');
      if (!this.socket) this.connect(true);
    }
    return this.leaveRequestId;
  }

  disconnect(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.clearLeaveTimer();
    this.leaveRequestId = null;
    this.leaveRequested = false;
    this.roomRequest = null;
    this.roomCode = null;
    this.seatToken = null;
    this.localPlayerId = null;
    this.pendingActions.clear();

    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    this.connectionGeneration += 1;
    socket?.close();
    this.setStatus('disconnected');
  }

  private resetForNewRoomRequest(): void {
    this.intentionalDisconnect = false;
    this.clearReconnectTimer();
    this.clearLeaveTimer();
    this.leaveRequestId = null;
    this.leaveRequested = false;
    this.roomCode = null;
    this.seatToken = null;
    this.localPlayerId = null;
    this.pendingActions.clear();
    this.roomRequest = null;

    const oldSocket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    this.connectionGeneration += 1;
    oldSocket?.close();
  }

  private connect(isReconnect: boolean): void {
    this.intentionalDisconnect = false;
    this.setStatus(isReconnect ? 'reconnecting' : 'connecting');

    let socket: SocketLike;
    try {
      socket = this.webSocketFactory(this.url);
    } catch (error) {
      this.handleConnectionFailure(error);
      return;
    }

    const generation = ++this.connectionGeneration;
    this.socket = socket;
    this.socketOpen = false;
    socket.setHandlers({
      onOpen: () => {
        if (!this.isCurrentSocket(socket, generation)) return;
        this.socketOpen = true;
        if (this.seatToken && this.roomCode) {
          const requestId = this.createIdentifier('request');
          this.send({
            type: 'room.reconnect',
            requestId,
            roomCode: this.roomCode,
            seatToken: this.seatToken,
          });
          return;
        }
        if (this.roomRequest) this.send(this.roomRequest);
      },
      onMessage: data => {
        if (!this.isCurrentSocket(socket, generation)) return;
        this.handleServerMessage(data);
      },
      onClose: () => {
        if (!this.isCurrentSocket(socket, generation)) return;
        this.socket = null;
        this.socketOpen = false;
        this.handleSocketClose();
      },
      onError: () => {
        if (!this.isCurrentSocket(socket, generation)) return;
        this.handlers.onError?.({ code: 'NETWORK_ERROR', message: 'Connection to the game server failed.' });
      },
    });
  }

  private handleServerMessage(raw: string): void {
    const message = decodeServerMessage(raw);
    if (!message) {
      this.handlers.onError?.({ code: 'INVALID_SERVER_MESSAGE', message: 'The server sent an invalid message.' });
      return;
    }

    switch (message.type) {
      case 'room.session':
        this.roomCode = message.roomCode;
        this.seatToken = message.seatToken;
        this.localPlayerId = message.localPlayerId;
        this.roomRequest = null;
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
        if (this.leaveRequested) {
          this.beginLeaveRequest();
          return;
        }
        this.setStatus('connected');
        this.handlers.onSession?.(message);
        this.flushPendingActions();
        return;
      case 'room.snapshot':
        this.handlers.onSnapshot?.(message.snapshot);
        return;
      case 'room.left':
        if (message.requestId === this.leaveRequestId) {
          this.finishLeave();
          this.handlers.onRoomLeft?.();
        }
        return;
      case 'room.closed':
        this.finishLeave();
        this.handlers.onRoomClosed?.(message);
        return;
      case 'action.result':
        this.pendingActions.delete(message.actionId);
        this.handlers.onActionResult?.(message);
        return;
      case 'error':
        if (message.actionId) this.pendingActions.delete(message.actionId);
        if (message.requestId && this.roomRequest?.requestId === message.requestId) {
          this.roomRequest = null;
          this.setStatus('error');
        }
        if (this.status === 'reconnecting' && TERMINAL_RECONNECT_ERRORS.has(message.code)) {
          this.clearReconnectTimer();
          this.clearLeaveTimer();
          this.intentionalDisconnect = true;
          this.leaveRequested = false;
          this.leaveRequestId = null;
          this.roomCode = null;
          this.seatToken = null;
          this.localPlayerId = null;
          this.setStatus('error');
          this.socket?.close();
          this.socket = null;
          this.socketOpen = false;
        }
        this.handlers.onError?.(message);
    }
  }

  private enqueueAction(action: PendingAction): string {
    this.pendingActions.set(action.actionId, action);
    if (this.status === 'connected' && this.socketOpen) this.send(action);
    return action.actionId;
  }

  private flushPendingActions(): void {
    for (const action of this.pendingActions.values()) this.send(action);
  }

  private send(message: object): void {
    if (!this.socket || !this.socketOpen) return;
    try {
      this.socket.send(JSON.stringify(message));
    } catch {
      // The socket close event drives reconnect. Keep queued actions for retry.
    }
  }

  private handleSocketClose(): void {
    if (this.intentionalDisconnect) return;
    if (this.leaveRequested) this.clearLeaveTimer();
    if (!this.seatToken || !this.roomCode) {
      if (this.roomRequest) {
        this.roomRequest = null;
        this.handlers.onError?.({
          code: 'CONNECTION_CLOSED',
          message: 'The connection closed before the room response. Check the server and try again.',
        });
      }
      this.setStatus('disconnected');
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect || this.reconnectTimer) return;
    this.setStatus('reconnecting');
    const delay = Math.min(
      this.reconnectDelayMs * 2 ** this.reconnectAttempts,
      this.maxReconnectDelayMs,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalDisconnect && this.seatToken && this.roomCode) this.connect(true);
    }, delay);
  }

  private handleConnectionFailure(error: unknown): void {
    this.handlers.onError?.({
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Could not connect to the game server.',
    });
    if (this.seatToken && this.roomCode && !this.intentionalDisconnect) {
      this.scheduleReconnect();
    } else {
      this.setStatus('error');
    }
  }

  private createIdentifier(prefix: string): string {
    this.nextIdentifier += 1;
    return `${prefix}-${Date.now().toString(36)}-${this.nextIdentifier.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearLeaveTimer(): void {
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = null;
  }

  private beginLeaveRequest(): void {
    if (!this.leaveRequested || !this.socketOpen || !this.roomCode || !this.seatToken) return;
    this.leaveRequestId ??= this.createIdentifier('leave');
    this.send({ type: 'room.leave', requestId: this.leaveRequestId });
    this.scheduleLeaveRetry();
  }

  private scheduleLeaveRetry(): void {
    this.clearLeaveTimer();
    this.leaveTimer = setTimeout(() => {
      this.leaveTimer = null;
      if (!this.leaveRequested) return;
      if (this.socketOpen) {
        this.beginLeaveRequest();
        return;
      }
      if (!this.socket && !this.reconnectTimer && this.roomCode && this.seatToken) {
        this.connect(true);
      } else {
        this.scheduleLeaveRetry();
      }
    }, 2_000);
  }

  private finishLeave(): void {
    this.intentionalDisconnect = true;
    this.clearReconnectTimer();
    this.clearLeaveTimer();
    this.leaveRequestId = null;
    this.leaveRequested = false;
    this.roomRequest = null;
    this.roomCode = null;
    this.seatToken = null;
    this.localPlayerId = null;
    this.pendingActions.clear();

    const socket = this.socket;
    this.socket = null;
    this.socketOpen = false;
    this.connectionGeneration += 1;
    socket?.close();
    this.setStatus('disconnected');
  }

  private isCurrentSocket(socket: SocketLike, generation: number): boolean {
    return this.socket === socket && this.connectionGeneration === generation;
  }

  private setStatus(status: GameClientStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.handlers.onStatusChange?.(status);
  }
}

function createNativeSocket(url: string): SocketLike {
  const socket = new WebSocket(url);
  return {
    setHandlers(handlers) {
      socket.onopen = () => handlers.onOpen();
      socket.onmessage = event => {
        if (typeof event.data === 'string') handlers.onMessage(event.data);
      };
      socket.onclose = () => handlers.onClose();
      socket.onerror = () => handlers.onError();
    },
    send(message) {
      socket.send(message);
    },
    close() {
      socket.close();
    },
  };
}
