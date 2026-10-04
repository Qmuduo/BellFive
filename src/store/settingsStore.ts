import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import type { Language } from '../i18n/types';

export type SettingsStore = Readonly<{
  language: Language;
  hydrated: boolean;
  setLanguage: (language: Language) => void;
  markHydrated: () => void;
}>;

type PersistedSettings = Pick<SettingsStore, 'language'>;

function isLanguage(value: unknown): value is Language {
  return value === 'zh-CN' || value === 'en';
}

export function createSettingsStore(storage: StateStorage = AsyncStorage) {
  let languageWasChanged = false;
  return create<SettingsStore>()(persist(
    set => ({
      language: 'zh-CN',
      hydrated: false,
      setLanguage: language => {
        languageWasChanged = true;
        set({ language });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'bellfive-settings',
      storage: createJSONStorage(() => storage),
      partialize: state => ({ language: state.language }) as PersistedSettings,
      merge: (persistedState, currentState) => {
        const language = (persistedState as Partial<PersistedSettings> | undefined)?.language;
        return {
          ...currentState,
          language: languageWasChanged ? currentState.language : isLanguage(language) ? language : 'zh-CN',
        };
      },
      onRehydrateStorage: initialState => () => initialState.markHydrated(),
    },
  ));
}

export const useSettingsStore = createSettingsStore();
