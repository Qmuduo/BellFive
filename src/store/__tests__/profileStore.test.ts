import { waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';
import { sanitizePlayerProfile } from '../../profile';
import { createProfileStore } from '../profileStore';

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

  it.each([
    ['A', 'Player A'],
    ['B', 'Player B'],
  ] as const)('uses the seat label for an empty nickname at seat %s', (playerId, fallback) => {
    expect(sanitizePlayerProfile({ nickname: '   ', avatarId: 'bell' }, playerId)).toEqual({
      nickname: fallback,
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
