import { useRouter } from 'expo-router';
import { AccountSettings } from '../src/components/AccountSettings';
import type { PlayerProfileInput } from '../src/profile';
import { useAuthStore } from '../src/auth/authStore';
import { useGameStore } from '../src/store/gameStore';
import { usePlayerProfileStore } from '../src/store/profileStore';

export default function AccountRoute() {
  const router = useRouter();
  const user = useAuthStore(state => state.user);
  const pending = useAuthStore(state => state.pending);
  const authHydrated = useAuthStore(state => state.hydrated);
  const profileVerified = useAuthStore(state => state.profileVerified);
  const refreshSession = useAuthStore(state => state.refreshSession);
  const errorCode = useAuthStore(state => state.errorCode);
  const updateProfile = useAuthStore(state => state.updateProfile);
  const addCredentials = useAuthStore(state => state.addCredentials);
  const logout = useAuthStore(state => state.logout);
  const profile = usePlayerProfileStore(state => state.profile);
  const profileHydrated = usePlayerProfileStore(state => state.hydrated);
  const setLocalProfile = usePlayerProfileStore(state => state.setProfile);

  const saveProfile = async (nextProfile: PlayerProfileInput) => {
    if (!user) {
      setLocalProfile(nextProfile);
      return;
    }
    await updateProfile(nextProfile);
    setLocalProfile(useAuthStore.getState().user?.profile ?? nextProfile);
    const game = useGameStore.getState();
    if (game.sessionMode === 'none' && game.client) game.refreshLobby();
  };

  const signOut = async () => {
    await logout();
    router.replace('/');
  };

  return (
    <AccountSettings
      user={user}
      profile={user?.profile ?? profile}
      profileHydrated={profileHydrated}
      authHydrated={authHydrated}
      profileVerified={profileVerified}
      pending={pending}
      errorCode={errorCode}
      onSaveProfile={saveProfile}
      onAddCredentials={addCredentials}
      onLogin={() => router.push({ pathname: '/auth', params: { returnTo: 'account' } })}
      onRefreshProfile={user ? refreshSession : undefined}
      onLogout={user ? signOut : undefined}
      onBack={() => router.back()}
    />
  );
}
