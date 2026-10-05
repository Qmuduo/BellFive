import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import type { StateStorage } from 'zustand/middleware';

const serverStorage: StateStorage = {
  getItem: async () => null,
  setItem: async () => undefined,
  removeItem: async () => undefined,
};

export function getDefaultStorage(): StateStorage {
  return Platform.OS === 'web' && typeof window === 'undefined' ? serverStorage : AsyncStorage;
}
