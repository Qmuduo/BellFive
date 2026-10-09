import { bindReactStore } from '../store/reactStoreBinding';
import { createAuthStoreApi } from './createAuthStoreApi';

export type { AuthStore } from './createAuthStoreApi';

export function createAuthStore(...args: Parameters<typeof createAuthStoreApi>) {
  return bindReactStore(createAuthStoreApi(...args));
}
