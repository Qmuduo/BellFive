import type { StateStorage } from 'zustand/middleware';
import type { MiniGameWxApi } from './wxApi';

export function createWxStorage(api: Pick<MiniGameWxApi, 'getStorage' | 'setStorage' | 'removeStorage'>): StateStorage {
  return {
    getItem: name => new Promise<string | null>((resolve, reject) => {
      api.getStorage({ key: name,
        success: result => resolve(typeof result.data === 'string' ? result.data : null),
        fail: error => /data not found/i.test(error.errMsg)
          ? resolve(null) : reject(new Error('Storage could not be read.')),
      });
    }),
    setItem: (name, value) => new Promise<void>((resolve, reject) => {
      api.setStorage({ key: name, data: value, success: () => resolve(), fail: () => reject(new Error('Storage could not be written.')) });
    }),
    removeItem: name => new Promise<void>((resolve, reject) => {
      api.removeStorage({ key: name, success: () => resolve(), fail: () => reject(new Error('Storage could not be removed.')) });
    }),
  };
}
