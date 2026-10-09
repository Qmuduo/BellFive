import { AuthClient } from '../../../src/auth/AuthClient';
import { createAuthStoreApi } from '../../../src/auth/createAuthStoreApi';
import { createWxAuthTransport } from '../platform/authTransport';
import { createWxStorage } from '../platform/storage';
import type { MiniGameWxApi } from '../platform/wxApi';

export function createMiniAuthStore(api: MiniGameWxApi, authUrl: string) {
  return createAuthStoreApi(createWxStorage(api), new AuthClient(createWxAuthTransport(api, authUrl)));
}
