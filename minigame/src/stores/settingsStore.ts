import { createSettingsStoreApi } from '../../../src/store/createSettingsStoreApi';
import { createWxStorage } from '../platform/storage';
import type { MiniGameWxApi } from '../platform/wxApi';

export function createMiniSettingsStore(api: MiniGameWxApi) {
  return createSettingsStoreApi(createWxStorage(api));
}
