import { getDefaultStorage } from './defaultStorage';
import { createProfileStore } from './createProfileStore';

export { createProfileStore } from './createProfileStore';
export type { PlayerProfileStore } from './createProfileStore';

export const usePlayerProfileStore = createProfileStore(getDefaultStorage());
