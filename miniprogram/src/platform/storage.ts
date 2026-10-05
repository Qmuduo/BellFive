import Taro from '@tarojs/taro';
import type { StateStorage } from 'zustand/middleware';

export function createTaroStorage(): StateStorage {
  return {
    getItem: async name => {
      try {
        const result = await Taro.getStorage({ key: name });
        return typeof result.data === 'string' ? result.data : null;
      } catch {
        return null;
      }
    },
    setItem: async (name, value) => {
      await Taro.setStorage({ key: name, data: value });
    },
    removeItem: async name => {
      await Taro.removeStorage({ key: name });
    },
  };
}
