/** @jest-environment node */
import { createSettingsStoreApi } from '../createSettingsStoreApi';

function memory(value?: string) {
  const values = new Map(value ? [['bellfive-settings', value]] : []);
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, data: string) => { values.set(key, data); }, removeItem: (key: string) => { values.delete(key); } };
}

test('old settings restore their music switch with a quiet default volume', () => {
  const store = createSettingsStoreApi(memory(JSON.stringify({ state: { language: 'en', musicEnabled: false }, version: 0 })));
  expect(store.getState()).toMatchObject({ musicEnabled: false, musicVolume: 0.15, hydrated: true });
});

test('volume and switch survive reopening independently', () => {
  const storage = memory(); const store = createSettingsStoreApi(storage);
  (store.getState() as any).setMusicVolume(0.65);
  store.getState().setMusicEnabled(false);
  const reopened = createSettingsStoreApi(storage);
  expect(reopened.getState()).toMatchObject({ musicEnabled: false, musicVolume: 0.65 });
  reopened.getState().setMusicEnabled(true);
  expect((reopened.getState() as any).musicVolume).toBe(0.65);
});

test('volume is clamped to the audio range and invalid input preserves the last choice', () => {
  const store = createSettingsStoreApi(memory());
  (store.getState() as any).setMusicVolume(2);
  expect((store.getState() as any).musicVolume).toBe(1);
  (store.getState() as any).setMusicVolume(-1);
  expect((store.getState() as any).musicVolume).toBe(0);
  (store.getState() as any).setMusicVolume(0.65);
  (store.getState() as any).setMusicVolume(NaN);
  expect((store.getState() as any).musicVolume).toBe(0.65);
});

test('a volume chosen during async hydration wins over the saved value', async () => {
  let resolve!: (value: string | null) => void;
  const store = createSettingsStoreApi({ getItem: () => new Promise<string | null>(done => { resolve = done; }),
    setItem: () => {}, removeItem: () => {} });
  (store.getState() as any).setMusicVolume(0.7);
  const hydrated = new Promise<void>(done => {
    const stop = store.subscribe(state => { if (state.hydrated) { stop(); done(); } });
  });
  resolve(JSON.stringify({ state: { musicVolume: 0.2 }, version: 0 }));
  await hydrated;
  expect(store.getState()).toMatchObject({ musicVolume: 0.7, hydrated: true });
});
