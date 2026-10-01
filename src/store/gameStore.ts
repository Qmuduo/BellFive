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
  disconnect(): void;
}

export type GameClientFactory = (handlers: GameClientHandlers) => GameClientPort;

type GameStore = {
  connectionStatus: GameClientStatus;
  roomSnapshot: RoomSnapshot | null;
  roomCode: string | null;
  localPlayerId: PlayerId | null;
  error: GameClientError | null;
  lastActionResult: Extract<ServerMessage, { type: 'action.result' }> | null;
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
          set({
            connectionStatus: 'connected',
            roomCode: message.roomCode,
            localPlayerId: message.localPlayerId,
            roomSnapshot: message.snapshot,
            error: null,
          });
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
        onError: error => set({ error }),
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
      error: null,
      lastActionResult: null,
      client: null,
      createRoom: () => {
        set({ roomSnapshot: null, roomCode: null, localPlayerId: null, error: null, lastActionResult: null });
        getClient().createRoom();
      },
      joinRoom: code => {
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
        get().client?.disconnect();
        set({
          connectionStatus: 'disconnected',
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
