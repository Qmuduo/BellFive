jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    connectSocket: jest.fn(),
    getStorage: jest.fn().mockResolvedValue({ data: null }),
    setStorage: jest.fn().mockResolvedValue(undefined),
    removeStorage: jest.fn().mockResolvedValue(undefined),
    request: jest.fn().mockResolvedValue({ statusCode: 204, data: null }),
  },
}), { virtual: true });

import { createAuthStore } from '../../../../src/auth/createAuthStore';
import { AuthClient } from '../../../../src/auth/AuthClient';
import type { GameClientHandlers } from '../../../../src/network/GameClient';
import type { GameClientPort } from '../../../../src/store/createGameStore';
import type { StateStorage } from 'zustand/middleware';

const Taro = jest.requireMock('@tarojs/taro').default as { connectSocket: jest.Mock };
const { createMiniGameStore } = require('../gameStore') as typeof import('../gameStore');

test('uses the current auth token and disconnects the online client when the token changes', async () => {
  const memory = new Map<string, string>();
  const storage: StateStorage = {
    getItem: async key => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
    removeItem: async key => { memory.delete(key); },
  };
  const authStore = createAuthStore(storage, new AuthClient(async () => undefined));
  await waitForHydration(authStore);
  authStore.setState({ sessionToken: 'first-token' });
  const first = createSocketTask();
  const second = createSocketTask();
  Taro.connectSocket.mockResolvedValueOnce(first.task).mockResolvedValueOnce(second.task);
  const gameStore = createMiniGameStore(authStore as typeof authStore, { webSocketUrl: 'wss://game.example.test' });

  gameStore.getState().openLobby();
  await flushPromiseJobs();
  expect(Taro.connectSocket).toHaveBeenCalledWith({ url: 'wss://game.example.test' });
  first.emitOpen();
  first.emitMessage({ data: JSON.stringify({ type: 'session.authenticated', userId: 'user-mini' }) });
  expect(first.sent).toEqual([
    { type: 'session.authenticate', token: 'first-token' },
    { type: 'room.lobby.subscribe' },
  ]);

  authStore.setState({ sessionToken: 'second-token' });
  expect(first.task.close).toHaveBeenCalled();
  expect(gameStore.getState().client).toBeNull();

  gameStore.getState().openLobby();
  await flushPromiseJobs();
  second.emitOpen();
  second.emitMessage({ data: JSON.stringify({ type: 'session.authenticated', userId: 'user-mini' }) });
  expect(second.sent[0]).toEqual({ type: 'session.authenticate', token: 'second-token' });
});

test('routes Mini lobby applications, host decisions, readiness, and leave through the shared game store', async () => {
  const memory = new Map<string, string>();
  const storage: StateStorage = {
    getItem: async key => memory.get(key) ?? null,
    setItem: async (key, value) => { memory.set(key, value); },
    removeItem: async key => { memory.delete(key); },
  };
  const authStore = createAuthStore(storage, new AuthClient(async () => undefined));
  await waitForHydration(authStore);
  authStore.setState({ sessionToken: 'session-token' });
  const handlers: GameClientHandlers[] = [];
  const port: GameClientPort = {
    createRoom: jest.fn(() => 'create-1'),
    joinRoom: jest.fn(() => 'join-1'),
    subscribeLobby: jest.fn(),
    refreshLobby: jest.fn(),
    unsubscribeLobby: jest.fn(),
    applyToRoom: jest.fn(() => 'apply-1'),
    decideApplication: jest.fn(),
    cancelApplication: jest.fn(),
    setReady: jest.fn(() => 'ready-1'),
    flip: jest.fn(() => 'flip-1'),
    ring: jest.fn(() => 'ring-1'),
    rematch: jest.fn(() => 'rematch-1'),
    leaveRoom: jest.fn(),
    disconnect: jest.fn(),
  };
  const gameStore = createMiniGameStore(authStore as typeof authStore, {
    webSocketUrl: 'wss://game.example.test',
    clientFactory: (nextHandlers, token) => {
      expect(token).toBe('session-token');
      handlers.push(nextHandlers);
      return port;
    },
  });

  gameStore.getState().openLobby();
  gameStore.getState().refreshLobby();
  gameStore.getState().applyToRoom(' abcd23 ');
  handlers[0].onApplicationStatus?.({
    type: 'room.application.status', applicationId: 'local-application', status: 'pending', message: 'Waiting.',
  });
  handlers[0].onPendingApplication?.({
    applicationId: 'host-application', roomCode: 'ABCD23', profile: { nickname: 'Mira', avatarId: 'pear' },
  });
  gameStore.getState().cancelApplication();
  gameStore.getState().decideApplication('host-application', true);
  gameStore.getState().setReady(true);
  gameStore.getState().leaveRoom();

  expect(port.subscribeLobby).toHaveBeenCalledTimes(1);
  expect(port.refreshLobby).toHaveBeenCalledTimes(1);
  expect(port.applyToRoom).toHaveBeenCalledWith(' abcd23 ');
  expect(port.cancelApplication).toHaveBeenCalledWith('local-application');
  expect(port.decideApplication).toHaveBeenCalledWith('host-application', true);
  expect(port.setReady).toHaveBeenCalledWith(true);
  expect(port.leaveRoom).toHaveBeenCalledTimes(1);
});

function createSocketTask() {
  const callbacks: {
    open?: () => void;
    message?: (event: { data: unknown }) => void;
  } = {};
  const sent: object[] = [];
  const task = {
    onOpen: (callback: () => void) => { callbacks.open = callback; },
    onMessage: (callback: (event: { data: unknown }) => void) => { callbacks.message = callback; },
    onClose: jest.fn(),
    onError: jest.fn(),
    send: jest.fn(({ data }: { data: string }) => sent.push(JSON.parse(data))),
    close: jest.fn(),
  };
  return {
    task,
    sent,
    emitOpen: () => callbacks.open?.(),
    emitMessage: (event: { data: unknown }) => callbacks.message?.(event),
  };
}

async function flushPromiseJobs(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForHydration(authStore: ReturnType<typeof createAuthStore>): Promise<void> {
  if (authStore.getState().hydrated) return;
  await new Promise<void>(resolve => {
    const unsubscribe = authStore.subscribe(state => {
      if (state.hydrated) {
        unsubscribe();
        resolve();
      }
    });
  });
}
