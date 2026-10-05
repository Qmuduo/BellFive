import { waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';
import { sanitizePlayerProfile } from '../../profile';
import { createProfileStore } from '../createProfileStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('local player profile store', () => {
  it('starts with an empty nickname and the strawberry avatar', () => {
    const store = createProfileStore(createMemoryStorage());

    expect(store.getState().profile).toEqual({ nickname: '', avatarId: 'strawberry' });
  });

  it('trims the nickname and limits it to twelve Unicode code points', () => {
    const store = createProfileStore(createMemoryStorage());

    store.getState().setProfile({ nickname: '  🍐ABCDEFGHIJKLM  ', avatarId: 'pear' });

    expect(store.getState().profile).toEqual({ nickname: '🍐ABCDEFGHIJK', avatarId: 'pear' });
  });

  it.each(['A', 'B'] as const)('keeps an empty nickname empty at seat %s for localized display', playerId => {
    expect(sanitizePlayerProfile({ nickname: '   ', avatarId: 'bell' }, playerId)).toEqual({
      nickname: '',
      avatarId: 'bell',
    });
  });

  it('falls back to the default avatar for an unknown avatar id', () => {
    expect(sanitizePlayerProfile({ nickname: 'Mira', avatarId: 'upload' }, 'A')).toEqual({
      nickname: 'Mira',
      avatarId: 'strawberry',
    });
  });

  it('hydrates asynchronously and marks the profile ready after loading', async () => {
    let resolveStoredValue!: (value: string | null) => void;
    const storage: StateStorage = {
      getItem: async () => new Promise(resolve => { resolveStoredValue = resolve; }),
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const store = createProfileStore(storage);

    expect(store.getState().hydrated).toBe(false);
    resolveStoredValue(JSON.stringify({
      state: { profile: { nickname: 'Mira', avatarId: 'peach' } },
      version: 0,
    }));

    await waitFor(() => expect(store.getState()).toMatchObject({
      hydrated: true,
      profile: { nickname: 'Mira', avatarId: 'peach' },
    }));
  });

  it('recovers from malformed persisted profile fields and completes hydration', async () => {
    const storage = createAsyncMemoryStorage(JSON.stringify({
      state: { profile: { nickname: 42, avatarId: null } },
      version: 0,
    }));
    const store = createProfileStore(storage);

    await waitFor(() => expect(store.getState()).toMatchObject({
      hydrated: true,
      profile: { nickname: '', avatarId: 'strawberry' },
    }));
  });

  it('completes hydration when local storage cannot be read', async () => {
    const storage: StateStorage = {
      getItem: async () => { throw new Error('storage unavailable'); },
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const store = createProfileStore(storage);

    await waitFor(() => expect(store.getState().hydrated).toBe(true));
    expect(store.getState().profile).toEqual({ nickname: '', avatarId: 'strawberry' });
  });

  it('persists profile edits without persisting hydration state', () => {
    const storage = createMemoryStorage();
    const store = createProfileStore(storage);

    store.getState().setProfile({ nickname: '  Kai  ', avatarId: 'banana' });

    expect(JSON.parse(storage.values.get('bellfive-player-profile') ?? 'null')).toEqual({
      state: { profile: { nickname: 'Kai', avatarId: 'banana' } },
      version: 0,
    });
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

function createAsyncMemoryStorage(value: string): StateStorage {
  return {
    getItem: async () => value,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  };
}
