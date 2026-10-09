import { bindReactStore } from './reactStoreBinding';
import { createGameStoreApi } from './createGameStoreApi';

export type { GameClientFactory, GameClientPort, GameSessionMode, GameStore } from './createGameStoreApi';

export function createGameStore(...args: Parameters<typeof createGameStoreApi>) {
  return bindReactStore(createGameStoreApi(...args));
}
