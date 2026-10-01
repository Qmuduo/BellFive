import { create } from 'zustand';
import { GameClient } from '../network/GameClient';
import type {
  GameClientError,
  GameClientHandlers,
  GameClientStatus,
} from '../network/GameClient';
import type { RoomSnapshot, ServerMessage } from '../network/protocol';
import type { PlayerId } from '../game/types';

export interface GameClientPort {
  createRoom(): string;
  joinRoom(code: string): string;
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
  client: GameClientPort | null;
  createRoom: () => void;
  joinRoom: (code: string) => void;
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
          }));
          return;
        case 'room.snapshot':
          set({ roomSnapshot: message.snapshot });
          return;
        case 'action.result':
          set({ lastActionResult: message, error: null });
          return;
        case 'error':
          set({ error: message });
      }
    };

    const getClient = (): GameClientPort => {
      const current = get().client;
      if (current) return current;

      const handlers: GameClientHandlers = {
        onStatusChange: connectionStatus => set({ connectionStatus }),
        onSession: message => applyServerMessage(message),
        onSnapshot: snapshot => applyServerMessage({ type: 'room.snapshot', snapshot }),
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
      client: null,
      createRoom: () => {
        if (get().leavingRoom) return;
        set({ roomSnapshot: null, roomCode: null, localPlayerId: null, error: null, lastActionResult: null });
        getClient().createRoom();
      },
      joinRoom: code => {
        if (get().leavingRoom) return;
        set({ roomSnapshot: null, roomCode: null, localPlayerId: null, error: null, lastActionResult: null });
        getClient().joinRoom(code);
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
