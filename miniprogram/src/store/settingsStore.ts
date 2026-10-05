import { createSettingsStore } from '../../../src/store/createSettingsStore';
import { createTaroStorage } from '../platform/storage';

export const useMiniSettingsStore = createSettingsStore(createTaroStorage());
