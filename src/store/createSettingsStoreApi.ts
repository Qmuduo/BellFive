import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { Language } from '../i18n/types';

export type SettingsStore = Readonly<{
  language: Language;
  musicEnabled: boolean;
  musicVolume: number;
  hydrated: boolean;
  setLanguage: (language: Language) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  markHydrated: () => void;
}>;

type PersistedSettings = Pick<SettingsStore, 'language' | 'musicEnabled' | 'musicVolume'>;
export const DEFAULT_MUSIC_VOLUME = 0.15;

function normalizeVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : DEFAULT_MUSIC_VOLUME;
}

function isLanguage(value: unknown): value is Language {
  return value === 'zh-CN' || value === 'en';
}

export function createSettingsStoreApi(storage: StateStorage) {
  let languageWasChanged = false;
  let musicEnabledWasChanged = false;
  let musicVolumeWasChanged = false;
  return createStore<SettingsStore>()(persist(
    set => ({
      language: 'zh-CN',
      musicEnabled: true,
      musicVolume: DEFAULT_MUSIC_VOLUME,
      hydrated: false,
      setLanguage: language => {
        languageWasChanged = true;
        set({ language });
      },
      setMusicEnabled: musicEnabled => {
        musicEnabledWasChanged = true;
        set({ musicEnabled });
      },
      setMusicVolume: volume => {
        if (!Number.isFinite(volume)) return;
        musicVolumeWasChanged = true;
        set({ musicVolume: normalizeVolume(volume) });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'bellfive-settings',
      storage: createJSONStorage(() => storage),
      partialize: state => ({ language: state.language, musicEnabled: state.musicEnabled, musicVolume: state.musicVolume }),
      merge: (persistedState, currentState) => {
        const language = (persistedState as Partial<PersistedSettings> | undefined)?.language;
        return {
          ...currentState,
          language: languageWasChanged ? currentState.language : isLanguage(language) ? language : 'zh-CN',
          musicVolume: musicVolumeWasChanged ? currentState.musicVolume
            : normalizeVolume((persistedState as Partial<PersistedSettings> | undefined)?.musicVolume),
          musicEnabled: musicEnabledWasChanged
            ? currentState.musicEnabled
            : typeof (persistedState as Partial<PersistedSettings> | undefined)?.musicEnabled === 'boolean'
              ? (persistedState as Partial<PersistedSettings>).musicEnabled!
              : true,
        };
      },
      onRehydrateStorage: initialState => () => initialState.markHydrated(),
    },
  ));
}
