import { createProfileStoreApi } from '../../../src/store/createProfileStoreApi';
import { createWxStorage } from '../platform/storage';
import type { MiniGameWxApi } from '../platform/wxApi';

export function createMiniProfileStore(api: MiniGameWxApi) {
  return createProfileStoreApi(createWxStorage(api));
}
