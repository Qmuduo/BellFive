import { getDefaultStorage } from './defaultStorage';
import { createSettingsStore } from './createSettingsStore';

export { createSettingsStore } from './createSettingsStore';
export type { SettingsStore } from './createSettingsStore';

export const useSettingsStore = createSettingsStore(getDefaultStorage());
