import { useStore } from 'zustand';
import type { UseBoundStore } from 'zustand';
import type { ExtractState, StoreApi } from 'zustand/vanilla';

// Retain middleware extensions (such as persist) as well as vanilla methods.
export function bindReactStore<S extends StoreApi<unknown>>(api: S): UseBoundStore<S> {
  const bound = ((selector?: (state: ExtractState<S>) => unknown) =>
    useStore(api, selector ?? ((state: ExtractState<S>) => state))) as UseBoundStore<S>;
  return Object.assign(bound, api);
}
