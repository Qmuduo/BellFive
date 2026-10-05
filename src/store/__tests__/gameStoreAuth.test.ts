import { GameClient, type SocketHandlers, type SocketLike } from '../../network/GameClient';
import { createGameStore } from '../gameStore';

test.each(['createRoom', 'openLobby', 'refreshLobby', 'joinRoom', 'applyToRoom'] as const)('%s reports AUTH_REQUIRED without constructing a client when no token exists', action => {
  let constructed = 0;
  const store = createGameStore(() => { constructed += 1; throw new Error('must not construct'); }, () => null);
  if (action === 'joinRoom' || action === 'applyToRoom') store.getState()[action]('ABCD23');
  else store.getState()[action]();
  expect(constructed).toBe(0);
  expect(store.getState()).toMatchObject({ client: null, applyingRoomCode: null, error: { code: 'AUTH_REQUIRED' } });
});

test('injects the provider token into the transport and clears online state after 4401', () => {
  let handlers!: SocketHandlers;
  const sent: unknown[] = [];
  const socket: SocketLike = {
    setHandlers: value => { handlers = value; }, send: raw => sent.push(JSON.parse(raw)), close: () => handlers.onClose(),
  };
  const store = createGameStore((callbacks, authToken) => new GameClient({ url: 'ws://test', authToken, handlers: callbacks, webSocketFactory: () => socket }), () => 'provider-token');
  const requestId = store.getState().createRoom();
  handlers.onOpen();
  expect(sent).toEqual([{ type: 'session.authenticate', token: 'provider-token' }]);
  handlers.onMessage('{"type":"session.authenticated","userId":"user-a"}');
  expect(sent).toContainEqual({ type: 'room.create', requestId });
  store.setState({ roomCode: 'ABCD23', localPlayerId: 'A', sessionMode: 'online', openRooms: [{ roomCode: 'ABCD23', hostProfile: { nickname: 'Host', avatarId: 'banana' } }] });
  handlers.onClose(4401);
  expect(store.getState()).toMatchObject({ sessionMode: 'none', roomCode: null, localPlayerId: null, roomSnapshot: null, client: null, openRooms: [], error: { code: 'AUTH_REQUIRED' } });
});

test.each(['setReady', 'flip', 'ring', 'rematch', 'cancelApplication'] as const)('%s reports AUTH_REQUIRED without a token', action => {
  let constructed = 0;
  const store = createGameStore(() => { constructed += 1; throw new Error('must not construct'); }, () => null);
  if (action === 'setReady') store.getState().setReady(true);
  else store.getState()[action]();
  expect(constructed).toBe(0);
  expect(store.getState().error?.code).toBe('AUTH_REQUIRED');
});

test('stops using the existing authenticated transport when the provider loses its token', () => {
  let token: string | null = 'signed-in';
  let handlers!: SocketHandlers;
  const sent: unknown[] = [];
  const socket: SocketLike = { setHandlers: value => { handlers = value; }, send: raw => sent.push(JSON.parse(raw)), close: () => handlers.onClose() };
  const store = createGameStore((callbacks, authToken) => new GameClient({ url: 'ws://test', authToken, handlers: callbacks, webSocketFactory: () => socket }), () => token);
  store.getState().createRoom();
  handlers.onOpen(); handlers.onMessage('{"type":"session.authenticated","userId":"user-a"}');
  const previous = sent.length;
  token = null;
  store.getState().flip();
  expect(sent).toHaveLength(previous);
  expect(store.getState()).toMatchObject({ client: null, error: { code: 'AUTH_REQUIRED' } });
});

test('disposes the online client and clears its room state when the account changes', () => {
  const client = {
    createRoom: jest.fn(() => 'create-request'),
    disconnect: jest.fn(),
  };
  const store = createGameStore(() => client as never, () => 'signed-in');
  store.getState().createRoom();
  store.setState({ sessionMode: 'online', roomCode: 'ABCD23', localPlayerId: 'A' });

  store.getState().resetClient();

  expect(client.disconnect).toHaveBeenCalledTimes(1);
  expect(store.getState()).toMatchObject({
    client: null,
    sessionMode: 'none',
    roomCode: null,
    localPlayerId: null,
    connectionStatus: 'disconnected',
  });
});

test('closing an unused online lobby preserves a single player game without an account', () => {
  jest.useFakeTimers();
  const store = createGameStore(() => { throw new Error('must not construct'); }, () => null);
  store.getState().startSinglePlayer({ nickname: 'Solo', avatarId: 'peach' }, 'easy');
  const snapshot = store.getState().roomSnapshot;
  store.getState().closeLobby();
  expect(store.getState().sessionMode).toBe('single-player');
  expect(store.getState().roomSnapshot).toBe(snapshot);
  store.getState().leaveRoom();
  jest.useRealTimers();
});
