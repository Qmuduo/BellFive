import { GameClient, type SocketHandlers, type SocketLike } from '../../network/GameClient';
import { createGameStore } from '../createGameStore';

test('reports the token rejected by the server through the injected platform callback', () => {
  let socketHandlers!: SocketHandlers;
  const socket: SocketLike = {
    setHandlers: handlers => { socketHandlers = handlers; },
    send: () => undefined,
    close: () => undefined,
  };
  const rejectedTokens: string[] = [];
  const store = createGameStore(
    (handlers, authToken) => new GameClient({
      url: 'wss://portable.test',
      authToken,
      handlers,
      webSocketFactory: () => socket,
    }),
    () => 'mini-session-token',
    token => rejectedTokens.push(token),
  );

  store.getState().createRoom();
  socketHandlers.onOpen();
  socketHandlers.onClose(4401);

  expect(rejectedTokens).toEqual(['mini-session-token']);
  expect(store.getState()).toMatchObject({ client: null, error: { code: 'AUTH_REQUIRED' } });
});

test('keeps the injected auth rejection callback optional for existing two-argument callers', () => {
  let socketHandlers!: SocketHandlers;
  const socket: SocketLike = {
    setHandlers: handlers => { socketHandlers = handlers; },
    send: () => undefined,
    close: () => undefined,
  };
  const store = createGameStore(
    (handlers, authToken) => new GameClient({ url: 'wss://portable.test', authToken, handlers, webSocketFactory: () => socket }),
    () => 'session-token',
  );

  store.getState().createRoom();
  socketHandlers.onOpen();
  socketHandlers.onClose(4401);

  expect(store.getState().error?.code).toBe('AUTH_REQUIRED');
});
