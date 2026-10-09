import { bindReactStore } from './reactStoreBinding';
import { createProfileStoreApi } from './createProfileStoreApi';

export type { PlayerProfileStore } from './createProfileStoreApi';

export function createProfileStore(...args: Parameters<typeof createProfileStoreApi>) {
  return bindReactStore(createProfileStoreApi(...args));
}
