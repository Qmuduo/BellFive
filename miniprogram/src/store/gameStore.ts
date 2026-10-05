import { GameClient } from '../../../src/network/GameClient';
import { createGameStore } from '../../../src/store/createGameStore';
import type { GameClientFactory } from '../../../src/store/createGameStore';
import { useMiniAuthStore } from './authStore';
import { miniWebSocketUrl } from '../platform/miniConfig';
import { createTaroSocket } from '../platform/socket';

type AuthStoreApi = typeof useMiniAuthStore;

export type MiniGameStoreOptions = Readonly<{
  webSocketUrl?: string;
  clientFactory?: GameClientFactory;
}>;

export function createMiniGameStore(
  authStore: AuthStoreApi,
  options: MiniGameStoreOptions = {},
) {
  const webSocketUrl = options.webSocketUrl ?? miniWebSocketUrl;
  const clientFactory: GameClientFactory = options.clientFactory ?? ((handlers, authToken) =>
    new GameClient({
      url: webSocketUrl,
      authToken,
      handlers,
      webSocketFactory: createTaroSocket,
    }));
  const store = createGameStore(
    clientFactory,
    () => authStore.getState().sessionToken,
    rejectedToken => {
      if (authStore.getState().sessionToken === rejectedToken) {
        void authStore.getState().logout();
      }
    },
  );

  let observedToken = authStore.getState().sessionToken;
  authStore.subscribe(state => {
    if (state.sessionToken === observedToken) return;
    observedToken = state.sessionToken;
    store.getState().resetClient();
  });
  return store;
}

export const useMiniGameStore = createMiniGameStore(useMiniAuthStore);
