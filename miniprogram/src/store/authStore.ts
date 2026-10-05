import { AuthClient } from '../../../src/auth/AuthClient';
import { createAuthStore } from '../../../src/auth/createAuthStore';
import { createTaroAuthTransport } from '../platform/authTransport';
import { createTaroStorage } from '../platform/storage';

export const miniAuthClient = new AuthClient(createTaroAuthTransport());
export const useMiniAuthStore = createAuthStore(createTaroStorage(), miniAuthClient);
