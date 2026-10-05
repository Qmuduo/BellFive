import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import {
  DEFAULT_PLAYER_PROFILE,
  normalizeNickname,
  sanitizePlayerProfile,
} from '../profile';
import type { PlayerProfile, PlayerProfileInput } from '../profile';

export type PlayerProfileStore = Readonly<{
  profile: PlayerProfile;
  hydrated: boolean;
  setProfile: (profile: PlayerProfileInput) => void;
  markHydrated: () => void;
}>;

type PersistedProfileState = Pick<PlayerProfileStore, 'profile'>;

export function createProfileStore(storage: StateStorage) {
  return create<PlayerProfileStore>()(persist(
    set => ({
      profile: DEFAULT_PLAYER_PROFILE,
      hydrated: false,
      setProfile: profile => {
        const sanitized = sanitizePlayerProfile(profile, 'A');
        set({
          profile: {
            ...sanitized,
            nickname: normalizeNickname(profile.nickname),
          },
        });
      },
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'bellfive-player-profile',
      storage: createJSONStorage(() => storage),
      partialize: state => ({ profile: state.profile }) as PersistedProfileState,
      merge: (persistedState, currentState) => {
        const persistedProfile = (persistedState as Partial<PersistedProfileState> | undefined)?.profile;
        if (!persistedProfile) return currentState;
        const sanitized = sanitizePlayerProfile(persistedProfile, 'A');
        return {
          ...currentState,
          profile: {
            ...sanitized,
            nickname: normalizeNickname(
              typeof persistedProfile === 'object' && persistedProfile !== null
                ? (persistedProfile as { nickname?: unknown }).nickname
                : undefined,
            ),
          },
        };
      },
      onRehydrateStorage: initialState => () => initialState.markHydrated(),
    },
  ));
}
