import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { Language } from '../i18n/types';

export type SettingsStore = Readonly<{
  language: Language;
  musicEnabled: boolean;
  hydrated: boolean;
  setLanguage: (language: Language) => void;
  setMusicEnabled: (enabled: boolean) => void;
  markHydrated: () => void;
}>;

type PersistedSettings = Pick<SettingsStore, 'language' | 'musicEnabled'>;

function isLanguage(value: unknown): value is Language {
  return value === 'zh-CN' || value === 'en';
}

export function createSettingsStore(storage: StateStorage) {
  let languageWasChanged = false;
  let musicEnabledWasChanged = false;
  return create<SettingsStore>()(persist(
    set => ({
      language: 'zh-CN',
      musicEnabled: true,
      hydrated: false,
      setLanguage: language => {
        languageWasChanged = true;
        set({ language });
      },
      setMusicEnabled: musicEnabled => {
        musicEnabledWasChanged = true;
        set({ musicEnabled });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'bellfive-settings',
      storage: createJSONStorage(() => storage),
      partialize: state => ({ language: state.language, musicEnabled: state.musicEnabled }),
      merge: (persistedState, currentState) => {
        const language = (persistedState as Partial<PersistedSettings> | undefined)?.language;
        return {
          ...currentState,
          language: languageWasChanged ? currentState.language : isLanguage(language) ? language : 'zh-CN',
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
