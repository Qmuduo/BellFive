import { create } from 'zustand';
import { GameClient } from '../network/GameClient';
import type {
  GameClientError,
  GameClientHandlers,
  GameClientStatus,
} from '../network/GameClient';
import type {
  JoinApplication,
  OpenRoomSummary,
  RoomSnapshot,
  ServerMessage,
} from '../network/protocol';
import type { PlayerId } from '../game/types';
import type { PlayerProfileInput } from '../profile';

export interface GameClientPort {
  createRoom(profile?: PlayerProfileInput): string;
  joinRoom(code: string, profile?: PlayerProfileInput): string;
  subscribeLobby(): void;
  refreshLobby(): void;
  unsubscribeLobby(): void;
  applyToRoom(code: string, profile?: PlayerProfileInput): string;
  decideApplication(applicationId: string, approved: boolean): void;
  cancelApplication(applicationId: string): void;
  setReady(ready: boolean): string;
  flip(): string;
  ring(tableVersion: number): string;
  rematch(): string;
  leaveRoom(): void;
  disconnect(): void;
}

export type GameClientFactory = (handlers: GameClientHandlers) => GameClientPort;

type GameStore = {
  connectionStatus: GameClientStatus;
  roomSnapshot: RoomSnapshot | null;
  roomCode: string | null;
  localPlayerId: PlayerId | null;
  leavingRoom: boolean;
  error: GameClientError | null;
  lastActionResult: Extract<ServerMessage, { type: 'action.result' }> | null;
  roomSessionVersion: number;
  openRooms: readonly OpenRoomSummary[];
  pendingApplications: readonly JoinApplication[];
  applyingRoomCode: string | null;
  localApplicationId: string | null;
  localApplicationStatus: Extract<ServerMessage, { type: 'room.application.status' }> | null;
  client: GameClientPort | null;
  createRoom: (profile?: PlayerProfileInput) => void;
  joinRoom: (code: string, profile?: PlayerProfileInput) => void;
  openLobby: () => void;
  refreshLobby: () => void;
  closeLobby: () => void;
  applyToRoom: (code: string, profile?: PlayerProfileInput) => void;
  decideApplication: (applicationId: string, approved: boolean) => void;
  cancelApplication: () => void;
  setReady: (ready: boolean) => void;
  flip: () => void;
  ring: () => void;
  rematch: () => void;
  leaveRoom: () => void;
  clearError: () => void;
  applyServerMessage: (message: ServerMessage) => void;
};

export function createGameStore(clientFactory: GameClientFactory = createDefaultClient) {
  return create<GameStore>()((set, get) => {
    const applyServerMessage = (message: ServerMessage) => {
      switch (message.type) {
        case 'room.session':
          set(state => ({
            connectionStatus: 'connected',
            roomCode: message.roomCode,
            localPlayerId: message.localPlayerId,
            roomSnapshot: message.snapshot,
            roomSessionVersion: state.roomSessionVersion + 1,
            leavingRoom: false,
            error: null,
            pendingApplications: [],
            applyingRoomCode: null,
            localApplicationId: null,
            localApplicationStatus: null,
          }));
          return;
        case 'room.snapshot':
          set({ roomSnapshot: message.snapshot });
          return;
        case 'action.result':
          set({ lastActionResult: message, error: null });
          return;
        case 'room.lobby.snapshot':
          set({ openRooms: message.rooms });
          return;
        case 'room.application.pending':
          set(state => ({
            pendingApplications: [
              ...state.pendingApplications.filter(item => item.applicationId !== message.application.applicationId),
              message.application,
            ],
          }));
          return;
        case 'room.application.status':
          set(state => {
            const isLocalApplication = state.localApplicationId === message.applicationId;
            return {
              pendingApplications: state.pendingApplications.filter(item => item.applicationId !== message.applicationId),
              ...(message.status === 'pending' || isLocalApplication
                ? {
                    localApplicationStatus: message,
                    localApplicationId: message.status === 'pending' ? message.applicationId : null,
                    applyingRoomCode: null,
                  }
                : {}),
            };
          });
          return;
        case 'error':
          set(state => ({
            error: message,
            ...(message.requestId && state.applyingRoomCode ? { applyingRoomCode: null } : {}),
          }));
      }
    };

    const getClient = (): GameClientPort => {
      const current = get().client;
      if (current) return current;

      const handlers: GameClientHandlers = {
        onStatusChange: connectionStatus => set({ connectionStatus }),
        onSession: message => applyServerMessage(message),
        onSnapshot: snapshot => applyServerMessage({ type: 'room.snapshot', snapshot }),
        onLobbySnapshot: rooms => applyServerMessage({ type: 'room.lobby.snapshot', rooms }),
        onPendingApplication: application => applyServerMessage({ type: 'room.application.pending', application }),
        onApplicationStatus: message => applyServerMessage(message),
        onActionResult: message => applyServerMessage(message),
        onRoomLeft: () => set({ connectionStatus: 'disconnected', leavingRoom: false }),
        onRoomClosed: message => set({
          connectionStatus: 'disconnected',
          roomSnapshot: null,
          roomCode: null,
          localPlayerId: null,
          leavingRoom: false,
          error: { code: message.code, message: message.message },
          lastActionResult: null,
          pendingApplications: [],
          applyingRoomCode: null,
          localApplicationId: null,
          localApplicationStatus: null,
        }),
        onError: error => set({
          ...(error.code === 'ROOM_NOT_FOUND' || error.code === 'INVALID_SEAT_TOKEN'
            ? { roomSnapshot: null, roomCode: null, localPlayerId: null, leavingRoom: false }
            : {}),
          error,
        }),
      };
      const client = clientFactory(handlers);
      set({ client });
      return client;
    };

    return {
      connectionStatus: 'idle',
      roomSnapshot: null,
      roomCode: null,
      localPlayerId: null,
      leavingRoom: false,
      error: null,
      lastActionResult: null,
      roomSessionVersion: 0,
      openRooms: [],
      pendingApplications: [],
      applyingRoomCode: null,
      localApplicationId: null,
      localApplicationStatus: null,
      client: null,
      createRoom: profile => {
        if (get().leavingRoom) return;
        set({ roomSnapshot: null, roomCode: null, localPlayerId: null, error: null, lastActionResult: null });
        getClient().createRoom(profile);
      },
      joinRoom: (code, profile) => {
        if (get().leavingRoom) return;
        set({ roomSnapshot: null, roomCode: null, localPlayerId: null, lastActionResult: null });
        get().applyToRoom(code, profile);
      },
      openLobby: () => getClient().subscribeLobby(),
      refreshLobby: () => getClient().refreshLobby(),
      closeLobby: () => getClient().unsubscribeLobby(),
      applyToRoom: (code, profile) => {
        if (get().leavingRoom) return;
        set({
          applyingRoomCode: code.trim().toUpperCase(),
          localApplicationId: null,
          localApplicationStatus: null,
          error: null,
        });
        getClient().applyToRoom(code, profile);
      },
      decideApplication: (applicationId, approved) => {
        if (get().leavingRoom) return;
        getClient().decideApplication(applicationId, approved);
        set(state => ({
          pendingApplications: state.pendingApplications.filter(item => item.applicationId !== applicationId),
          error: null,
        }));
      },
      cancelApplication: () => {
        const { client, localApplicationId } = get();
        if (localApplicationId) client?.cancelApplication(localApplicationId);
      },
      setReady: ready => {
        set({ error: null });
        get().client?.setReady(ready);
      },
      flip: () => {
        set({ error: null });
        get().client?.flip();
      },
      ring: () => {
        const { client, roomSnapshot } = get();
        set({ error: null });
        if (roomSnapshot) client?.ring(roomSnapshot.tableVersion);
      },
      rematch: () => {
        set({ error: null });
        get().client?.rematch();
      },
      leaveRoom: () => {
        if (get().leavingRoom) return;
        get().client?.leaveRoom();
        set({
          leavingRoom: true,
          roomSnapshot: null,
          roomCode: null,
          localPlayerId: null,
          error: null,
          lastActionResult: null,
        });
      },
      clearError: () => set({ error: null }),
      applyServerMessage,
    };
  });
}

function createDefaultClient(handlers: GameClientHandlers): GameClient {
  const configuredUrl = process.env.EXPO_PUBLIC_GAME_SERVER_URL?.trim();
  return new GameClient({
    url: configuredUrl || 'ws://localhost:8787',
    handlers,
  });
}

export const useGameStore = createGameStore();
