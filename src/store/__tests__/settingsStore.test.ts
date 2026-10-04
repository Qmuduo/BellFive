import { waitFor } from '@testing-library/react-native';
import type { StateStorage } from 'zustand/middleware';
import { createSettingsStore } from '../settingsStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('local language settings store', () => {
  it('defaults to Simplified Chinese on a new install', () => {
    const store = createSettingsStore(createMemoryStorage());
    expect(store.getState().language).toBe('zh-CN');
  });

  it('changes language immediately and persists only the language setting', () => {
    const storage = createMemoryStorage();
    const store = createSettingsStore(storage);

    store.getState().setLanguage('en');

    expect(store.getState().language).toBe('en');
    expect(JSON.parse(storage.values.get('bellfive-settings') ?? 'null')).toEqual({
      state: { language: 'en' },
      version: 0,
    });
  });

  it('restores the chosen language after asynchronous hydration', async () => {
    let resolveStoredValue!: (value: string | null) => void;
    const storage: StateStorage = {
      getItem: async () => new Promise(resolve => { resolveStoredValue = resolve; }),
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const store = createSettingsStore(storage);

    expect(store.getState().language).toBe('zh-CN');
    expect(store.getState().hydrated).toBe(false);
    resolveStoredValue(JSON.stringify({ state: { language: 'en' }, version: 0 }));

    await waitFor(() => expect(store.getState()).toMatchObject({ language: 'en', hydrated: true }));
  });

  it('keeps a language choice made while stored settings are still loading', async () => {
    let resolveStoredValue!: (value: string | null) => void;
    const storage: StateStorage = {
      getItem: async () => new Promise(resolve => { resolveStoredValue = resolve; }),
      setItem: async () => undefined,
      removeItem: async () => undefined,
    };
    const store = createSettingsStore(storage);

    store.getState().setLanguage('en');
    resolveStoredValue(JSON.stringify({ state: { language: 'zh-CN' }, version: 0 }));

    await waitFor(() => expect(store.getState()).toMatchObject({ language: 'en', hydrated: true }));
  });

  it('falls back to Chinese for unsupported persisted values and storage errors', async () => {
    const invalid = createSettingsStore(createAsyncMemoryStorage(JSON.stringify({
      state: { language: 'fr' }, version: 0,
    })));
    await waitFor(() => expect(invalid.getState()).toMatchObject({ language: 'zh-CN', hydrated: true }));

    const unavailable = createSettingsStore({
      getItem: async () => { throw new Error('storage unavailable'); },
      setItem: async () => undefined,
      removeItem: async () => undefined,
    });
    await waitFor(() => expect(unavailable.getState()).toMatchObject({ language: 'zh-CN', hydrated: true }));
    unavailable.getState().setLanguage('en');
    expect(unavailable.getState().language).toBe('en');
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
