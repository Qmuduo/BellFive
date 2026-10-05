jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorage: jest.fn(),
    setStorage: jest.fn(),
    removeStorage: jest.fn(),
    connectSocket: jest.fn(),
    vibrateShort: jest.fn(),
    createInnerAudioContext: jest.fn(),
  },
}), { virtual: true });

const Taro = jest.requireMock('@tarojs/taro').default as {
  getStorage: jest.Mock;
  setStorage: jest.Mock;
  removeStorage: jest.Mock;
  connectSocket: jest.Mock;
  vibrateShort: jest.Mock;
  createInnerAudioContext: jest.Mock;
};

const { createTaroStorage } = require('../storage') as typeof import('../storage');
const { createTaroSocket } = require('../socket') as typeof import('../socket');
const { playMiniFeedback } = require('../feedback') as typeof import('../feedback');
const { GameClient } = require('../../../../src/network/GameClient') as typeof import('../../../../src/network/GameClient');

beforeEach(() => {
  jest.clearAllMocks();
});

test('maps Zustand storage calls to Taro async storage APIs', async () => {
  Taro.getStorage.mockResolvedValue({ data: '{"ready":true}' });
  Taro.setStorage.mockResolvedValue(undefined);
  Taro.removeStorage.mockResolvedValue(undefined);
  const storage = createTaroStorage();

  await expect(storage.getItem('bellfive-settings')).resolves.toBe('{"ready":true}');
  await storage.setItem('bellfive-settings', '{"ready":false}');
  await storage.removeItem('bellfive-settings');

  expect(Taro.getStorage).toHaveBeenCalledWith({ key: 'bellfive-settings' });
  expect(Taro.setStorage).toHaveBeenCalledWith({ key: 'bellfive-settings', data: '{"ready":false}' });
  expect(Taro.removeStorage).toHaveBeenCalledWith({ key: 'bellfive-settings' });
});

test('translates Taro socket events and forwards only string message bodies', async () => {
  let callbacks: Record<string, (event?: any) => void> = {};
  const task = {
    onOpen: (callback: (event?: any) => void) => { callbacks.open = callback; },
    onMessage: (callback: (event: { data: unknown }) => void) => { callbacks.message = callback; },
    onClose: (callback: (event: { code?: number }) => void) => { callbacks.close = callback; },
    onError: (callback: (event?: any) => void) => { callbacks.error = callback; },
    send: jest.fn(),
    close: jest.fn(),
  };
  Taro.connectSocket.mockResolvedValue(task);
  const socket = createTaroSocket('wss://bellfive.test/socket');
  const received: string[] = [];
  const events: string[] = [];
  socket.setHandlers({
    onOpen: () => events.push('open'),
    onMessage: value => received.push(value),
    onClose: code => events.push(`close:${code}`),
    onError: () => events.push('error'),
  });
  await Promise.resolve();

  callbacks.open?.();
  callbacks.message?.({ data: 'valid frame' });
  callbacks.message?.({ data: new ArrayBuffer(2) });
  callbacks.close?.({ code: 4401 });
  callbacks.error?.();
  socket.send('{"type":"session.authenticate"}');
  socket.close();

  expect(Taro.connectSocket).toHaveBeenCalledWith({ url: 'wss://bellfive.test/socket' });
  expect(received).toEqual(['valid frame']);
  expect(events).toEqual(['open', 'close:4401', 'error']);
  expect(task.send).toHaveBeenCalledWith({ data: '{"type":"session.authenticate"}' });
  expect(task.close).toHaveBeenCalled();
});

test('reconnects a lobby when Taro rejects the socket connection promise', async () => {
  jest.useFakeTimers();
  const task = createSocketTask();
  Taro.connectSocket.mockRejectedValueOnce(new Error('connection unavailable')).mockResolvedValueOnce(task.task);
  const errors: string[] = [];
  const client = new GameClient({
    url: 'wss://bellfive.test/socket',
    authToken: 'session-token',
    reconnectDelayMs: 25,
    maxReconnectDelayMs: 25,
    webSocketFactory: createTaroSocket,
    handlers: { onError: error => errors.push(error.code) },
  });

  try {
    client.subscribeLobby();
    await flushPromiseJobs();

    expect(client.getStatus()).toBe('reconnecting');
    expect(errors).toEqual(['NETWORK_ERROR']);

    jest.advanceTimersByTime(25);
    await flushPromiseJobs();
    expect(Taro.connectSocket).toHaveBeenCalledTimes(2);

    task.emitOpen();
    task.emitMessage({ data: '{"type":"session.authenticated","userId":"user-mini"}' });

    expect(client.getStatus()).toBe('connected');
    expect(task.sent).toEqual([
      { type: 'session.authenticate', token: 'session-token' },
      { type: 'room.lobby.subscribe' },
    ]);
  } finally {
    client.disconnect();
    jest.useRealTimers();
  }
});

test('ignores a rejected socket connection promise after intentional close', async () => {
  let rejectConnection!: (reason: Error) => void;
  const pendingTask = new Promise((_resolve, reject) => { rejectConnection = reject; });
  Taro.connectSocket.mockReturnValue(pendingTask);
  const socket = createTaroSocket('wss://bellfive.test/socket');
  const events: string[] = [];
  socket.setHandlers({
    onOpen: () => events.push('open'),
    onMessage: () => events.push('message'),
    onClose: () => events.push('close'),
    onError: () => events.push('error'),
  });

  socket.close();
  rejectConnection(new Error('connection unavailable'));
  await flushPromiseJobs();

  expect(events).toEqual([]);
});

test('maps supported Mini feedback to short vibration and tolerates API failures', async () => {
  Taro.vibrateShort.mockResolvedValue(undefined);
  playMiniFeedback('correct');
  expect(Taro.vibrateShort).toHaveBeenCalledWith({ type: 'medium' });

  Taro.vibrateShort.mockRejectedValue(new Error('unavailable'));
  expect(() => playMiniFeedback('finish')).not.toThrow();
});

test('respects the persisted audio setting and plays bundled Mini feedback when enabled', () => {
  const context = { src: '', volume: 1, play: jest.fn(), destroy: jest.fn(), onEnded: jest.fn() };
  Taro.createInnerAudioContext.mockReturnValue(context);

  playMiniFeedback('flip', false);
  expect(Taro.vibrateShort).not.toHaveBeenCalled();
  expect(Taro.createInnerAudioContext).not.toHaveBeenCalled();

  playMiniFeedback('flip', true);
  expect(Taro.createInnerAudioContext).toHaveBeenCalledTimes(1);
  expect(context.src).toContain('card-flip.wav');
  expect(context.play).toHaveBeenCalledTimes(1);
});

function createSocketTask() {
  const callbacks: {
    open?: () => void;
    message?: (event: { data: unknown }) => void;
    close?: (event: { code?: number }) => void;
    error?: () => void;
  } = {};
  const sent: object[] = [];
  const task = {
    onOpen: (callback: () => void) => { callbacks.open = callback; },
    onMessage: (callback: (event: { data: unknown }) => void) => { callbacks.message = callback; },
    onClose: (callback: (event: { code?: number }) => void) => { callbacks.close = callback; },
    onError: (callback: () => void) => { callbacks.error = callback; },
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
}
