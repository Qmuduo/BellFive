import type { StateStorage } from 'zustand/middleware';
import { waitFor } from '@testing-library/react-native';
import { AuthClient } from '../AuthClient';
import { AuthClientError } from '../contracts';
import type { AuthSession, AuthUser } from '../contracts';
import { createAuthStore } from '../createAuthStore';

const user: AuthUser = {
  userId: 'user-1',
  username: 'kai',
  profile: { nickname: 'Kai', avatarId: 'pear' },
  wechatLinked: false,
};
const session: AuthSession = { token: 'session-token', expiresAt: Date.now() + 60_000, user };

describe('auth store', () => {
  it('registers with the guest profile, persists the session, and adopts the server user', async () => {
    const storage = createMemoryStorage();
    const requests: Parameters<ConstructorParameters<typeof AuthClient>[0]>[0][] = [];
    const store = createAuthStore(storage, new AuthClient(async request => {
      requests.push(request);
      return session;
    }));

    await store.getState().register('Kai', 'long-password', { nickname: 'Local Kai', avatarId: 'banana' });

    expect(requests[0]).toEqual({
      method: 'POST', path: '/auth/register',
      body: { username: 'Kai', password: 'long-password', initialProfile: { nickname: 'Local Kai', avatarId: 'banana' } },
    });
    await waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(store.getState()).toMatchObject({ user, sessionToken: 'session-token', hydrated: true });
    expect(JSON.parse(storage.values.get('bellfive-auth') ?? 'null')).toMatchObject({
      state: { user, sessionToken: 'session-token' },
    });
  });

  it('replaces the canonical profile after a server profile save', async () => {
    const updatedUser: AuthUser = { ...user, profile: { nickname: 'Mira', avatarId: 'peach' } };
    const store = createAuthStore(createMemoryStorage(), new AuthClient(async request =>
      request.path === '/auth/me/profile' ? updatedUser : session,
    ));
    await store.getState().login('kai', 'long-password');

    await store.getState().updateProfile(updatedUser.profile);

    expect(store.getState().user).toEqual(updatedUser);
    expect(store.getState().sessionToken).toBe('session-token');
  });

  it('clears the local session even when the logout request fails', async () => {
    const store = createAuthStore(createMemoryStorage(), new AuthClient(async request => {
      if (request.path === '/auth/logout') throw new Error('network offline');
      return session;
    }));
    await store.getState().login('kai', 'long-password');

    await store.getState().logout();

    expect(store.getState()).toMatchObject({ user: null, sessionToken: null });
  });

  it('refreshes a persisted session from the canonical server profile before marking auth hydrated', async () => {
    const storage = createMemoryStorage();
    storage.values.set('bellfive-auth', JSON.stringify({
      state: { user, sessionToken: 'saved-token', sessionExpiresAt: Date.now() + 60_000 }, version: 0,
    }));
    const canonicalUser: AuthUser = { ...user, profile: { nickname: 'Server Mira', avatarId: 'peach' } };
    const requests: Parameters<ConstructorParameters<typeof AuthClient>[0]>[0][] = [];
    const store = createAuthStore(storage, new AuthClient(async request => {
      requests.push(request);
      return canonicalUser;
    }));

    await waitFor(() => expect(store.getState().hydrated).toBe(true));

    expect(requests).toEqual([{ method: 'GET', path: '/auth/me', token: 'saved-token' }]);
    expect(store.getState()).toMatchObject({ user: canonicalUser, sessionToken: 'saved-token', profileVerified: true });
  });

  it('clears a persisted session when canonical session refresh is unauthorized', async () => {
    const storage = createMemoryStorage();
    storage.values.set('bellfive-auth', JSON.stringify({
      state: { user, sessionToken: 'saved-token', sessionExpiresAt: Date.now() + 60_000 }, version: 0,
    }));
    const store = createAuthStore(storage, new AuthClient(async () => {
      throw new AuthClientError('UNAUTHORIZED', 'Expired.');
    }));

    await waitFor(() => expect(store.getState().hydrated).toBe(true));

    expect(store.getState()).toMatchObject({ user: null, sessionToken: null, errorCode: 'UNAUTHORIZED', profileVerified: false });
  });

  it('blocks profile writes when canonical refresh failed due to network failure', async () => {
    const storage = createMemoryStorage();
    storage.values.set('bellfive-auth', JSON.stringify({
      state: { user, sessionToken: 'saved-token', sessionExpiresAt: Date.now() + 60_000 }, version: 0,
    }));
    const requests: Parameters<ConstructorParameters<typeof AuthClient>[0]>[0][] = [];
    const store = createAuthStore(storage, new AuthClient(async request => {
      requests.push(request);
      throw new AuthClientError('NETWORK_ERROR', 'Offline.');
    }));

    await waitFor(() => expect(store.getState().hydrated).toBe(true));

    expect(store.getState()).toMatchObject({ user, sessionToken: 'saved-token', profileVerified: false });
    await expect(store.getState().updateProfile({ nickname: 'Stale edit', avatarId: 'banana' }))
      .rejects.toMatchObject({ code: 'PROFILE_REFRESH_REQUIRED' });
    expect(requests).toEqual([{ method: 'GET', path: '/auth/me', token: 'saved-token' }]);
  });
  it('does not restore a session that expired while the app was closed', async () => {
    const storage = createMemoryStorage();
    storage.values.set('bellfive-auth', JSON.stringify({
      state: { user, sessionToken: 'expired-token', sessionExpiresAt: 1 }, version: 0,
    }));
    const store = createAuthStore(storage, new AuthClient(async () => session));

    await waitFor(() => expect(store.getState().hydrated).toBe(true));

    expect(store.getState()).toMatchObject({ user: null, sessionToken: null });
  });

  it('clears a persisted session when a protected account request reports it expired', async () => {
    const store = createAuthStore(createMemoryStorage(), new AuthClient(async request => {
      if (request.path === '/auth/me/profile') throw new AuthClientError('UNAUTHORIZED', 'Expired.');
      return session;
    }));
    await store.getState().login('kai', 'long-password');

    await expect(store.getState().updateProfile(user.profile)).rejects.toThrow('Expired.');

    expect(store.getState()).toMatchObject({ user: null, sessionToken: null, errorCode: 'UNAUTHORIZED' });
  });

  it('does not clear a newer session when an older protected request returns unauthorized', async () => {
    let rejectProfileRequest: (error: AuthClientError) => void = () => undefined;
    const staleRequest = new Promise<never>((_, reject) => { rejectProfileRequest = reject; });
    const secondUser: AuthUser = { ...user, userId: 'user-2', username: 'mira' };
    const secondSession: AuthSession = { ...session, token: 'session-token-2', user: secondUser };
    const store = createAuthStore(createMemoryStorage(), new AuthClient(async request => {
      if (request.path === '/auth/me/profile') return staleRequest;
      if (request.path === '/auth/login' && request.body && (request.body as { username?: string }).username === 'mira') {
        return secondSession;
      }
      return session;
    }));
    await store.getState().login('kai', 'long-password');

    const oldRequest = store.getState().updateProfile(user.profile);
    await store.getState().login('mira', 'long-password');
    rejectProfileRequest(new AuthClientError('UNAUTHORIZED', 'Old session expired.'));
    await expect(oldRequest).rejects.toThrow('Old session expired.');

    expect(store.getState()).toMatchObject({ user: secondUser, sessionToken: 'session-token-2', errorCode: null });
  });
  it('shares the persisted session flow for Mini Program WeChat login and account linking', async () => {
    const wechatUser: AuthUser = { ...user, userId: 'wechat-user', username: null, wechatLinked: true };
    const requests: Parameters<ConstructorParameters<typeof AuthClient>[0]>[0][] = [];
    const store = createAuthStore(createMemoryStorage(), new AuthClient(async request => {
      requests.push(request);
      if (request.path === '/auth/wechat/login') return { ...session, token: 'wechat-token', user: wechatUser };
      return { ...session, token: 'linked-token', user };
    }));

    await store.getState().wechatLogin('fresh-code');
    await store.getState().linkWechat({ code: 'new-code', username: 'kai', password: 'long-password', confirmedTransfer: true });

    expect(requests).toEqual([
      { method: 'POST', path: '/auth/wechat/login', body: { code: 'fresh-code' } },
      { method: 'POST', path: '/auth/wechat/link', token: 'wechat-token', body: {
        code: 'new-code', username: 'kai', password: 'long-password', confirmedTransfer: true,
      } },
    ]);
    expect(store.getState()).toMatchObject({ user, sessionToken: 'linked-token' });
  });
});

function createMemoryStorage() {
  const values = new Map<string, string>();
  const storage: StateStorage = {
    getItem: name => values.get(name) ?? null,
    setItem: (name, value) => { values.set(name, value); },
    removeItem: name => { values.delete(name); },
  };
  return Object.assign(storage, { values });
}
