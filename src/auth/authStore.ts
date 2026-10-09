import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthClient } from './AuthClient';
import { createAuthStore } from './createAuthStore';
import { nativeAuthTransport } from './nativeTransport';

export type { AuthStore } from './createAuthStoreApi';

export const useAuthStore = createAuthStore(AsyncStorage, new AuthClient(nativeAuthTransport));
