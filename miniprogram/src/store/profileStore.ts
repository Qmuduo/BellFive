import { createProfileStore } from '../../../src/store/createProfileStore';
import { createTaroStorage } from '../platform/storage';

export const useMiniProfileStore = createProfileStore(createTaroStorage());
