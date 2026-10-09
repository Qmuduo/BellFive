/** @jest-environment node */
import type { StateStorage } from 'zustand/middleware';

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: StateStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
  };
  return { storage, values };
}

beforeEach(() => {
  jest.resetModules();
  jest.doMock('react', () => { throw new Error('Portable APIs must not load React'); });
});
afterEach(() => { jest.dontMock('react'); });

test('vanilla game API starts and leaves a guest game and notifies subscribers without React', () => {
  const { createGameStoreApi } = require('../createGameStoreApi');
  const api = createGameStoreApi(() => { throw new Error('Guest play must not create a client'); }, () => null);
  const modes: string[] = [];
  const unsubscribe = api.subscribe((state: { sessionMode: string }) => { modes.push(state.sessionMode); });
  expect(api.getState().sessionMode).toBe('none');
  try {
    api.getState().startSinglePlayer({ nickname: 'Guest', avatarId: 'pear' }, 'easy');
    expect(api.getState().sessionMode).toBe('single-player');
    expect(api.getState().roomSnapshot.players.A.profile).toEqual({ nickname: 'Guest', avatarId: 'pear' });
    api.getState().leaveRoom();
    expect(api.getState().sessionMode).toBe('none');
    expect(modes).toContain('single-player');
    expect(modes[modes.length - 1]).toBe('none');
  } finally { api.getState().leaveRoom(); unsubscribe(); }
});

test('vanilla profile API preserves the persisted profile format and hydrates without React', () => {
  const { createProfileStoreApi } = require('../createProfileStoreApi');
  const { storage, values } = memoryStorage();
  const api = createProfileStoreApi(storage);
  api.getState().setProfile({ nickname: '  Guest  ', avatarId: 'pear' });
  expect(JSON.parse(values.get('bellfive-player-profile')!)).toEqual({ state: { profile: { nickname: 'Guest', avatarId: 'pear' } }, version: 0 });
  expect(createProfileStoreApi(storage).getState()).toMatchObject({ profile: { nickname: 'Guest', avatarId: 'pear' }, hydrated: true });
});

test('vanilla settings API preserves settings hydration and persistence without React', () => {
  const { createSettingsStoreApi } = require('../createSettingsStoreApi');
  const { storage, values } = memoryStorage();
  const api = createSettingsStoreApi(storage);
  api.getState().setLanguage('en');
  api.getState().setMusicEnabled(false);
  expect(JSON.parse(values.get('bellfive-settings')!)).toEqual({ state: { language: 'en', musicEnabled: false }, version: 0 });
  expect(createSettingsStoreApi(storage).getState()).toMatchObject({ language: 'en', musicEnabled: false, hydrated: true });
});

test('vanilla auth API persists and refreshes the canonical session without React', async () => {
  const { createAuthStoreApi } = require('../../auth/createAuthStoreApi');
  const { AuthClient } = require('../../auth/AuthClient');
  const { storage, values } = memoryStorage();
  const user = { userId: 'user-1', username: 'guest', wechatLinked: false, profile: { nickname: 'Guest', avatarId: 'pear' } };
  const expiresAt = Date.now() + 60_000;
  const requests: string[] = [];
  const client = new AuthClient(async (request: { path: string }) => {
    requests.push(request.path);
    return request.path === '/auth/me' ? user : { token: 'session-token', expiresAt, user };
  });
  const api = createAuthStoreApi(storage, client);
  await api.getState().login('guest', 'long-password');
  expect(JSON.parse(values.get('bellfive-auth')!)).toEqual({ state: { user, sessionToken: 'session-token', sessionExpiresAt: expiresAt }, version: 0 });
  const hydrated = createAuthStoreApi(storage, client);
  await hydrated.getState().refreshSession();
  expect(hydrated.getState()).toMatchObject({ user, sessionToken: 'session-token', hydrated: true, profileVerified: true });
  expect(requests).toContain('/auth/me');
  await hydrated.getState().logout();
  expect(hydrated.getState().sessionToken).toBeNull();
});
