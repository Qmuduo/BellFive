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
import { SinglePlayerController } from '../game/singlePlayerController';
import type { SinglePlayerDifficulty } from '../game/singlePlayerController';

export type GameSessionMode = 'none' | 'online' | 'single-player';

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
  sessionMode: GameSessionMode;
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
  startSinglePlayer: (profile: PlayerProfileInput, difficulty: SinglePlayerDifficulty) => void;
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
    let singlePlayerController: SinglePlayerController | null = null;

    const applyServerMessage = (message: ServerMessage) => {
      switch (message.type) {
        case 'room.session':
          if (get().sessionMode === 'single-player') return;
          singlePlayerController?.stop();
          singlePlayerController = null;
          set(state => ({
            sessionMode: 'online',
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
          if (get().sessionMode === 'single-player') return;
          set({ roomSnapshot: message.snapshot });
          return;
        case 'action.result':
          if (get().sessionMode === 'single-player') return;
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
          if (get().sessionMode === 'single-player') return;
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
        onRoomLeft: () => {
          if (get().sessionMode === 'single-player') return;
          set({ sessionMode: 'none', connectionStatus: 'disconnected', leavingRoom: false });
        },
        onRoomClosed: message => {
          if (get().sessionMode === 'single-player') return;
          singlePlayerController?.stop();
          singlePlayerController = null;
          set({
            sessionMode: 'none',
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
          });
        },
        onError: error => {
          if (get().sessionMode === 'single-player') return;
          set({
            ...(error.code === 'ROOM_NOT_FOUND' || error.code === 'INVALID_SEAT_TOKEN'
              ? { sessionMode: 'none' as const, roomSnapshot: null, roomCode: null, localPlayerId: null, leavingRoom: false }
              : {}),
            error,
          });
        },
      };
      const client = clientFactory(handlers);
      set({ client });
      return client;
    };

    return {
      connectionStatus: 'idle',
      sessionMode: 'none',
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
      startSinglePlayer: (profile, difficulty) => {
        singlePlayerController?.stop();
        const controller = new SinglePlayerController({
          onUpdate: update => {
            if (get().sessionMode !== 'single-player') return;
            set({
              roomSnapshot: update.snapshot,
              lastActionResult: update.lastActionResult,
              error: null,
              leavingRoom: false,
            });
          },
        });
        singlePlayerController = controller;
        set(state => ({
          sessionMode: 'single-player',
          roomSnapshot: null,
          roomCode: null,
          localPlayerId: 'A',
          leavingRoom: false,
          error: null,
          lastActionResult: null,
          roomSessionVersion: state.roomSessionVersion + 1,
          pendingApplications: [],
          applyingRoomCode: null,
          localApplicationId: null,
          localApplicationStatus: null,
        }));
        controller.start(profile, difficulty);
      },
      createRoom: profile => {
        if (get().leavingRoom) return;
        singlePlayerController?.stop();
        singlePlayerController = null;
        set({ sessionMode: 'none', roomSnapshot: null, roomCode: null, localPlayerId: null, error: null, lastActionResult: null });
        getClient().createRoom(profile);
      },
      joinRoom: (code, profile) => {
        if (get().leavingRoom) return;
        singlePlayerController?.stop();
        singlePlayerController = null;
        set({ sessionMode: 'none', roomSnapshot: null, roomCode: null, localPlayerId: null, lastActionResult: null });
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
        if (get().sessionMode === 'single-player') {
          if (ready && singlePlayerController) {
            set(state => ({ roomSessionVersion: state.roomSessionVersion + 1 }));
            singlePlayerController.rematch();
          }
          return;
        }
        set({ error: null });
        get().client?.setReady(ready);
      },
      flip: () => {
        if (get().sessionMode === 'single-player') {
          singlePlayerController?.flip();
          return;
        }
        set({ error: null });
        get().client?.flip();
      },
      ring: () => {
        if (get().sessionMode === 'single-player') {
          singlePlayerController?.ring();
          return;
        }
        const { client, roomSnapshot } = get();
        set({ error: null });
        if (roomSnapshot) client?.ring(roomSnapshot.tableVersion);
      },
      rematch: () => {
        if (get().sessionMode === 'single-player') {
          if (singlePlayerController) {
            set(state => ({ roomSessionVersion: state.roomSessionVersion + 1 }));
            singlePlayerController.rematch();
          }
          return;
        }
        set({ error: null });
        get().client?.rematch();
      },
      leaveRoom: () => {
        if (get().leavingRoom) return;
        if (get().sessionMode === 'single-player') {
          singlePlayerController?.stop();
          singlePlayerController = null;
          set({
            sessionMode: 'none',
            leavingRoom: false,
            roomSnapshot: null,
            roomCode: null,
            localPlayerId: null,
            error: null,
            lastActionResult: null,
          });
          return;
        }
        get().client?.leaveRoom();
        set({
          sessionMode: 'none',
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
