import { createStore } from 'zustand/vanilla';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { normalizeNickname, sanitizePlayerProfile } from '../profile';
import type { PlayerProfileInput } from '../profile';
import { AuthClient } from './AuthClient';
import { AuthClientError } from './contracts';
import type { AuthPrivacyMetadata, AuthSession, AuthUser, WechatLinkInput } from './contracts';

export type AuthStore = Readonly<{
  user: AuthUser | null;
  sessionToken: string | null;
  sessionExpiresAt: number | null;
  profileVerified: boolean;
  hydrated: boolean;
  pending: boolean;
  errorCode: string | null;
  markHydrated: () => void;
  refreshSession: () => Promise<void>;
  login: (username: string, password: string, privacy?: AuthPrivacyMetadata) => Promise<void>;
  register: (username: string, password: string, initialProfile?: PlayerProfileInput, privacy?: AuthPrivacyMetadata) => Promise<void>;
  wechatLogin: (code: string, privacy?: AuthPrivacyMetadata) => Promise<void>;
  linkWechat: (input: WechatLinkInput) => Promise<void>;
  updateProfile: (profile: PlayerProfileInput) => Promise<void>;
  addCredentials: (username: string, password: string) => Promise<void>;
  resetPasswordWithWechat: (code: string, newPassword: string, privacy?: AuthPrivacyMetadata) => Promise<void>;
  logout: () => Promise<void>;
  recordPrivacyConsent: (privacyPolicyVersion: string) => Promise<void>;
  recordGuardianConsent: (guardianGrant: string, privacyPolicyVersion: string) => Promise<void>;
  deleteAccount: (reauthentication: Readonly<{ password?: string; wechatCode?: string }>) => Promise<void>;
  clearError: () => void;
}>;

type PersistedAuthState = Pick<AuthStore, 'user' | 'sessionToken' | 'sessionExpiresAt'>;

function errorCode(error: unknown): string {
  return error instanceof AuthClientError
    ? error.code
    : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'NETWORK_ERROR';
}

function normalizedUser(user: AuthUser): AuthUser {
  return {
    userId: user.userId,
    username: typeof user.username === 'string' || user.username === null ? user.username : null,
    wechatLinked: user.wechatLinked === true,
    profile: sanitizePlayerProfile(user.profile, 'A'),
  };
}

export function createAuthStoreApi(storage: StateStorage, client: AuthClient, options: { autoRefreshOnHydrate?: boolean } = {}) {
  return createStore<AuthStore>()(persist(
    (set, get) => {
      const acceptSession = (session: AuthSession) => set({
        user: normalizedUser(session.user),
        sessionToken: session.token,
        sessionExpiresAt: session.expiresAt,
        profileVerified: true,
        errorCode: null,
      });

      const acceptUserForToken = (token: string, user: AuthUser) => {
        if (get().sessionToken === token) {
          set({ user: normalizedUser(user), profileVerified: true, errorCode: null });
        }
      };

      const perform = async (operation: () => Promise<void>, requestToken?: string | null) => {
        set({ pending: true, errorCode: null });
        try {
          await operation();
        } catch (error) {
          const code = errorCode(error);
          const staleUnauthorized = code === 'UNAUTHORIZED'
            && requestToken !== undefined
            && get().sessionToken !== requestToken;
          if (!staleUnauthorized) {
            const shouldInvalidateSession = code === 'UNAUTHORIZED'
              && requestToken !== undefined
              && requestToken !== null
              && get().sessionToken === requestToken;
            set({
              errorCode: code,
              ...(shouldInvalidateSession
                ? { user: null, sessionToken: null, sessionExpiresAt: null, profileVerified: false }
                : {}),
            });
          }
          throw error;
        } finally {
          set({ pending: false });
        }
      };

      return {
        user: null,
        sessionToken: null,
        sessionExpiresAt: null,
        profileVerified: false,
        hydrated: false,
        pending: false,
        errorCode: null,
        markHydrated: () => set({ hydrated: true }),
        refreshSession: async () => {
          const token = get().sessionToken;
          if (!token) {
            set({ profileVerified: true, hydrated: true });
            return;
          }
          try {
            const user = await client.me(token);
            if (get().sessionToken === token) {
              set({ user: normalizedUser(user), profileVerified: true, errorCode: null });
            }
          } catch (error) {
            if (get().sessionToken === token) {
              const code = errorCode(error);
              set({
                errorCode: code,
                profileVerified: false,
                ...(code === 'UNAUTHORIZED' ? { user: null, sessionToken: null, sessionExpiresAt: null } : {}),
              });
            }
          } finally {
            set({ hydrated: true });
          }
        },
        login: (username, password, privacy) => perform(async () => {
          acceptSession(await client.login({ username, password, ...privacy }));
        }),
        register: (username, password, initialProfile, privacy) => perform(async () => {
          acceptSession(await client.register({
            username,
            password,
            ...privacy,
            ...(initialProfile ? { initialProfile: {
              ...sanitizePlayerProfile(initialProfile, 'A'),
              nickname: normalizeNickname(initialProfile.nickname),
            } } : {}),
          }));
        }),
        wechatLogin: (code, privacy) => perform(async () => {
          acceptSession(await client.wechatLogin(code, privacy));
        }),
        linkWechat: input => {
          const token = get().sessionToken;
          return perform(async () => {
            if (!token) throw new AuthClientError('UNAUTHORIZED', 'Sign in to link WeChat.');
            const session = await client.linkWechat(token, input);
            if (get().sessionToken === token) acceptSession(session);
          }, token);
        },
        updateProfile: profile => {
          const token = get().sessionToken;
          return perform(async () => {
            if (!token) throw new AuthClientError('UNAUTHORIZED', 'Sign in to update your profile.');
            if (!get().profileVerified) {
              throw new AuthClientError('PROFILE_REFRESH_REQUIRED', 'Refresh the account profile before saving.');
            }
            const user = await client.updateProfile(token, profile);
            acceptUserForToken(token, user);
          }, token);
        },
        addCredentials: (username, password) => {
          const token = get().sessionToken;
          return perform(async () => {
            if (!token) throw new AuthClientError('UNAUTHORIZED', 'Sign in to add account credentials.');
            const user = await client.addCredentials(token, username, password);
            acceptUserForToken(token, user);
          }, token);
        },
        resetPasswordWithWechat: (code, newPassword, privacy) => perform(async () => {
          acceptSession(await client.resetPasswordWithWechat(code, newPassword, privacy));
        }),
        logout: async () => {
          const token = get().sessionToken;
          set({ user: null, sessionToken: null, sessionExpiresAt: null, profileVerified: false, pending: true, errorCode: null });
          try {
            if (token) await client.logout(token);
          } catch (error) {
            set({ errorCode: errorCode(error) });
          } finally {
            set({ pending: false });
          }
        },
        recordPrivacyConsent: async privacyPolicyVersion => {
          const token = get().sessionToken;
          if (!token) throw new AuthClientError('UNAUTHORIZED', 'Sign in to record privacy consent.');
          await perform(async () => { await client.recordPrivacyConsent(token, privacyPolicyVersion); }, token);
        },
        recordGuardianConsent: async (guardianGrant, privacyPolicyVersion) => {
          const token = get().sessionToken;
          if (!token) throw new AuthClientError('UNAUTHORIZED', 'Sign in to record guardian consent.');
          await perform(async () => { await client.recordGuardianConsent(token, guardianGrant, privacyPolicyVersion); }, token);
        },
        deleteAccount: async reauthentication => {
          const token = get().sessionToken;
          if (!token) throw new AuthClientError('UNAUTHORIZED', 'Sign in to delete this account.');
          await perform(async () => {
            await client.deleteAccount(token, reauthentication);
            set({ user: null, sessionToken: null, sessionExpiresAt: null, profileVerified: false, errorCode: null });
          }, token);
        },
        clearError: () => set({ errorCode: null }),
      };
    },
    {
      name: 'bellfive-auth',
      storage: createJSONStorage(() => storage),
      partialize: state => ({ user: state.user, sessionToken: state.sessionToken, sessionExpiresAt: state.sessionExpiresAt }) as PersistedAuthState,
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<PersistedAuthState> | undefined;
        const user = persisted?.user && typeof persisted.user.userId === 'string'
          ? normalizedUser(persisted.user)
          : null;
        const expiresAt = typeof persisted?.sessionExpiresAt === 'number' ? persisted.sessionExpiresAt : null;
        const sessionToken = typeof persisted?.sessionToken === 'string' ? persisted.sessionToken : null;
        const sessionIsValid = Boolean(user && sessionToken && expiresAt !== null && expiresAt > Date.now());
        return {
          ...currentState,
          user: sessionIsValid ? user : null,
          sessionToken: sessionIsValid ? sessionToken : null,
          sessionExpiresAt: sessionIsValid ? expiresAt : null,
          profileVerified: false,
        };
      },
      onRehydrateStorage: initialState => () => {
        if (options.autoRefreshOnHydrate !== false) void initialState.refreshSession();
        else initialState.markHydrated();
      },
    },
  ));
}
