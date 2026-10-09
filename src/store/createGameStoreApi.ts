import { createStore } from 'zustand/vanilla';
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
  createRoom(): string;
  joinRoom(code: string): string;
  subscribeLobby(): void;
  refreshLobby(): void;
  unsubscribeLobby(): void;
  applyToRoom(code: string): string;
  decideApplication(applicationId: string, approved: boolean): void;
  cancelApplication(applicationId: string): void;
  setReady(ready: boolean): string;
  flip(): string;
  ring(tableVersion: number): string;
  rematch(): string;
  leaveRoom(): void;
  disconnect(): void;
}

export type GameClientFactory = (handlers: GameClientHandlers, authToken: string) => GameClientPort;

export type GameStore = {
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
  lobbySnapshotReceived: boolean;
  pendingApplications: readonly JoinApplication[];
  applyingRoomCode: string | null;
  localApplicationId: string | null;
  localApplicationStatus: Extract<ServerMessage, { type: 'room.application.status' }> | null;
  client: GameClientPort | null;
  resetClient: () => void;
  startSinglePlayer: (profile: PlayerProfileInput, difficulty: SinglePlayerDifficulty) => void;
  createRoom: () => string;
  joinRoom: (code: string) => string;
  openLobby: () => void;
  refreshLobby: () => void;
  closeLobby: () => void;
  applyToRoom: (code: string) => string;
  decideApplication: (applicationId: string, approved: boolean) => void;
  cancelApplication: () => boolean;
  setReady: (ready: boolean) => string | null;
  flip: () => void;
  ring: () => void;
  rematch: () => void;
  leaveRoom: () => void;
  clearError: () => void;
  applyServerMessage: (message: ServerMessage) => void;
};

export function createGameStoreApi(
  clientFactory: GameClientFactory,
  authTokenProvider: () => string | null,
  onAuthRejected?: (token: string) => void,
) {
  return createStore<GameStore>()((set, get) => {
    let singlePlayerController: SinglePlayerController | null = null;
    let clientToken: string | null = null;

    const clearAuthentication = (error: GameClientError) => {
      const client = get().client;
      const rejectedToken = clientToken;
      clientToken = null;
      set({ client: null, sessionMode: 'none', connectionStatus: 'error', roomSnapshot: null,
        roomCode: null, localPlayerId: null, leavingRoom: false, lastActionResult: null,
        openRooms: [], pendingApplications: [], applyingRoomCode: null,
        lobbySnapshotReceived: false,
        localApplicationId: null, localApplicationStatus: null, error });
      client?.disconnect();
      set({ connectionStatus: 'error' });
      if (rejectedToken) onAuthRejected?.(rejectedToken);
    };

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
          set({ openRooms: message.rooms, lobbySnapshotReceived: true });
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
          if (message.code === 'AUTH_REQUIRED') {
            clearAuthentication(message);
            return;
          }
          set(state => ({
            error: message,
            ...(message.requestId && state.applyingRoomCode ? { applyingRoomCode: null } : {}),
          }));
      }
    };

    const getClient = (): GameClientPort | null => {
      const authToken = authTokenProvider();
      if (!authToken?.trim()) {
        clearAuthentication({ code: 'AUTH_REQUIRED', message: 'Sign in before connecting to online rooms.' });
        return null;
      }
      const current = get().client;
      if (current && clientToken === authToken) return current;
      if (current) clearAuthentication({ code: 'AUTH_REQUIRED', message: 'The account session changed.' });

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
          if (error.code === 'AUTH_REQUIRED') {
            clearAuthentication(error);
            return;
          }
          set({
            ...(error.code === 'ROOM_NOT_FOUND' || error.code === 'INVALID_SEAT_TOKEN'
              ? { sessionMode: 'none' as const, roomSnapshot: null, roomCode: null, localPlayerId: null, leavingRoom: false }
              : {}),
            error,
          });
        },
      };
      const client = clientFactory(handlers, authToken);
      clientToken = authToken;
      set({ client });
      return client;
    };

    const getActiveClient = (): GameClientPort | null => {
      const authToken = authTokenProvider();
      if (!authToken?.trim() || (get().client && clientToken !== authToken)) {
        clearAuthentication({ code: 'AUTH_REQUIRED', message: 'Sign in before connecting to online rooms.' });
        return null;
      }
      return get().client;
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
      lobbySnapshotReceived: false,
      pendingApplications: [],
      applyingRoomCode: null,
      localApplicationId: null,
      localApplicationStatus: null,
      client: null,
      resetClient: () => {
        const client = get().client;
        const isSinglePlayer = get().sessionMode === 'single-player';
        clientToken = null;
        set({
          client: null,
          ...(isSinglePlayer ? {} : {
            sessionMode: 'none' as const,
            roomSnapshot: null,
            roomCode: null,
            localPlayerId: null,
            leavingRoom: false,
            lastActionResult: null,
            error: null,
          }),
          pendingApplications: [],
          openRooms: [],
          lobbySnapshotReceived: false,
          applyingRoomCode: null,
          localApplicationId: null,
          localApplicationStatus: null,
        });
        client?.disconnect();
        set({ connectionStatus: isSinglePlayer ? 'idle' : 'disconnected' });
      },
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
      createRoom: () => {
        if (get().leavingRoom) return '';
        singlePlayerController?.stop();
        singlePlayerController = null;
        set({ sessionMode: 'none', roomSnapshot: null, roomCode: null, localPlayerId: null, error: null, lastActionResult: null });
        return getClient()?.createRoom() ?? '';
      },
      joinRoom: code => {
        if (get().leavingRoom) return '';
        singlePlayerController?.stop();
        singlePlayerController = null;
        set({ sessionMode: 'none', roomSnapshot: null, roomCode: null, localPlayerId: null, lastActionResult: null });
        return get().applyToRoom(code);
      },
      openLobby: () => {
        set({ lobbySnapshotReceived: false });
        getClient()?.subscribeLobby();
      },
      refreshLobby: () => {
        set({ lobbySnapshotReceived: false });
        getClient()?.refreshLobby();
      },
      closeLobby: () => {
        if (get().client) getActiveClient()?.unsubscribeLobby();
      },
      applyToRoom: code => {
        if (get().leavingRoom) return '';
        const client = getClient();
        if (!client) return '';
        set({
          applyingRoomCode: code.trim().toUpperCase(),
          localApplicationId: null,
          localApplicationStatus: null,
          error: null,
        });
        return client.applyToRoom(code);
      },
      decideApplication: (applicationId, approved) => {
        if (get().leavingRoom) return;
        const client = getClient();
        if (!client) return;
        client.decideApplication(applicationId, approved);
        set(state => ({
          pendingApplications: state.pendingApplications.filter(item => item.applicationId !== applicationId),
          error: null,
        }));
      },
      cancelApplication: () => {
        const client = getActiveClient();
        const { localApplicationId } = get();
        if (!localApplicationId || !client) return false;
        client.cancelApplication(localApplicationId);
        return true;
      },
      setReady: ready => {
        if (get().sessionMode === 'single-player') {
          if (ready && singlePlayerController) {
            set(state => ({ roomSessionVersion: state.roomSessionVersion + 1 }));
            singlePlayerController.rematch();
          }
          return null;
        }
        set({ error: null });
        return getActiveClient()?.setReady(ready) ?? null;
      },
      flip: () => {
        if (get().sessionMode === 'single-player') {
          singlePlayerController?.flip();
          return;
        }
        set({ error: null });
        getActiveClient()?.flip();
      },
      ring: () => {
        if (get().sessionMode === 'single-player') {
          singlePlayerController?.ring();
          return;
        }
        const { roomSnapshot } = get();
        set({ error: null });
        const client = getActiveClient();
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
        getActiveClient()?.rematch();
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
        const client = getActiveClient();
        if (!client) return;
        client.leaveRoom();
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
