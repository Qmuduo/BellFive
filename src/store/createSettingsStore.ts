import { bindReactStore } from './reactStoreBinding';
import { createSettingsStoreApi } from './createSettingsStoreApi';

export type { SettingsStore } from './createSettingsStoreApi';

export function createSettingsStore(...args: Parameters<typeof createSettingsStoreApi>) {
  return bindReactStore(createSettingsStoreApi(...args));
}
