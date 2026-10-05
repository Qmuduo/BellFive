jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorage: jest.fn(),
    setStorage: jest.fn(),
    removeStorage: jest.fn(),
    connectSocket: jest.fn(),
    vibrateShort: jest.fn(),
  },
}), { virtual: true });

const Taro = jest.requireMock('@tarojs/taro').default as {
  getStorage: jest.Mock;
  setStorage: jest.Mock;
  removeStorage: jest.Mock;
  connectSocket: jest.Mock;
  vibrateShort: jest.Mock;
};

const { createTaroStorage } = require('../storage') as typeof import('../storage');
const { createTaroSocket } = require('../socket') as typeof import('../socket');
const { playMiniFeedback } = require('../feedback') as typeof import('../feedback');

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

test('maps supported Mini feedback to short vibration and tolerates API failures', async () => {
  Taro.vibrateShort.mockResolvedValue(undefined);
  playMiniFeedback('correct');
  expect(Taro.vibrateShort).toHaveBeenCalledWith({ type: 'medium' });

  Taro.vibrateShort.mockRejectedValue(new Error('unavailable'));
  expect(() => playMiniFeedback('finish')).not.toThrow();
});
