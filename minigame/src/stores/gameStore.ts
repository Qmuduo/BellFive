import { GameClient } from '../../../src/network/GameClient';
import { createGameStoreApi } from '../../../src/store/createGameStoreApi';
import { createWxSocket } from '../platform/socket';
import type { MiniGameWxApi } from '../platform/wxApi';
import { createMiniAuthStore } from './authStore';
import { createMiniProfileStore } from './profileStore';
import { createMiniSettingsStore } from './settingsStore';

export interface MiniGameStoreOptions { authUrl?: string; socketUrl?: string; }

/** These development URLs are public endpoints. Release callers can inject their own endpoints. */
export function createMiniGameStores(api: MiniGameWxApi, options: MiniGameStoreOptions = {}) {
  const auth = createMiniAuthStore(api, options.authUrl ?? 'http://localhost:8787');
  const profile = createMiniProfileStore(api);
  const settings = createMiniSettingsStore(api);
  const game = createGameStoreApi((handlers, authToken) => new GameClient({
    url: options.socketUrl ?? 'ws://localhost:8787', authToken, handlers,
    webSocketFactory: url => createWxSocket(api, url),
  }), () => {
    const state = auth.getState();
    return state.hydrated && state.profileVerified && state.user && state.sessionExpiresAt !== null
      && state.sessionExpiresAt > Date.now() ? state.sessionToken : null;
  }, rejectedToken => {
    if (auth.getState().sessionToken === rejectedToken) void auth.getState().logout();
  });
  let observedToken = auth.getState().sessionToken;
  const stopAuth = auth.subscribe(state => {
    if (state.sessionToken === observedToken) return;
    observedToken = state.sessionToken;
    game.getState().resetClient();
  });
  const ready = new Promise<void>(resolve => {
    const hydrated = () => auth.getState().hydrated && profile.getState().hydrated && settings.getState().hydrated;
    if (hydrated()) { resolve(); return; }
    const stops: (() => void)[] = [];
    const check = () => { if (hydrated()) { for (const stop of stops) stop(); resolve(); } };
    stops.push(auth.subscribe(check), profile.subscribe(check), settings.subscribe(check));
    check();
  });
  return { wx: api, auth, profile, settings, game, ready,
    dispose() { stopAuth(); game.getState().leaveRoom(); game.getState().resetClient(); },
  };
}
export type MiniGameStores = ReturnType<typeof createMiniGameStores>;
