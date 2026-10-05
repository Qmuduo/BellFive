import { useLocalSearchParams, useRouter } from 'expo-router';
import { AuthScreen } from '../src/components/AuthScreen';
import { useAuthStore } from '../src/auth/authStore';
import { usePlayerProfileStore } from '../src/store/profileStore';

export default function AuthRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; roomCode?: string }>();
  const login = useAuthStore(state => state.login);
  const register = useAuthStore(state => state.register);
  const pending = useAuthStore(state => state.pending);
  const errorCode = useAuthStore(state => state.errorCode);
  const clearError = useAuthStore(state => state.clearError);
  const initialProfile = usePlayerProfileStore(state => state.profile);
  const roomCode = typeof params.roomCode === 'string' ? params.roomCode : undefined;

  const finishAuth = () => {
    if (params.returnTo === 'account') {
      router.replace('/account');
      return;
    }
    router.replace(roomCode ? { pathname: '/', params: { roomCode } } : '/');
  };

  return (
    <AuthScreen
      initialProfile={initialProfile}
      pending={pending}
      errorCode={errorCode}
      onClearError={clearError}
      onLogin={async (username, password) => {
        await login(username, password);
        finishAuth();
      }}
      onRegister={async (username, password) => {
        await register(username, password, initialProfile);
        finishAuth();
      }}
      onBack={() => router.back()}
    />
  );
}
