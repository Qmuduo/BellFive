import { GameClient } from '../network/GameClient';
import type { GameClientHandlers } from '../network/GameClient';
import { useAuthStore } from '../auth/authStore';
import { createGameStore } from './createGameStore';

export { createGameStore } from './createGameStore';
export type { GameClientFactory, GameClientPort, GameSessionMode, GameStore } from './createGameStore';

function createDefaultClient(handlers: GameClientHandlers, authToken: string): GameClient {
  const configuredUrl = process.env.EXPO_PUBLIC_GAME_SERVER_URL?.trim();
  return new GameClient({
    url: configuredUrl || 'ws://localhost:8787',
    handlers,
    authToken,
  });
}

function clearRejectedExpoSession(token: string): void {
  const authStore = useAuthStore.getState();
  if (authStore.sessionToken === token) void authStore.logout();
}

export const useGameStore = createGameStore(
  createDefaultClient,
  () => useAuthStore.getState().sessionToken,
  clearRejectedExpoSession,
);

useAuthStore.subscribe((state, previousState) => {
  if (state.sessionToken !== previousState.sessionToken) useGameStore.getState().resetClient();
});
