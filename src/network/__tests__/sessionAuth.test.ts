import { GameClient, type SocketHandlers, type SocketLike } from '../GameClient';
import { createRoomSnapshot, decodeClientMessage, decodeServerMessage } from '../protocol';

class Socket implements SocketLike {
  handlers!: SocketHandlers;
  messages: unknown[] = [];
  setHandlers(handlers: SocketHandlers) { this.handlers = handlers; }
  send(raw: string) { this.messages.push(JSON.parse(raw)); }
  close() { this.handlers.onClose(); }
  open() { this.handlers.onOpen(); }
  authenticate() { this.handlers.onMessage(JSON.stringify({ type: 'session.authenticated', userId: 'user-a' })); }
}

test('decodes authentication messages and rejects missing or malformed credentials', () => {
  expect(decodeClientMessage('{"type":"session.authenticate","token":"secret"}')).toEqual({ type: 'session.authenticate', token: 'secret' });
  expect(decodeServerMessage('{"type":"session.authenticated","userId":"user-a"}')).toEqual({ type: 'session.authenticated', userId: 'user-a' });
  for (const token of [undefined, '', '   ', 12, null]) {
    expect(decodeClientMessage(JSON.stringify({ type: 'session.authenticate', token }))).toBeNull();
  }
  for (const userId of [undefined, '', '   ', 12, null]) {
    expect(decodeServerMessage(JSON.stringify({ type: 'session.authenticated', userId }))).toBeNull();
  }
});

test('discards client supplied profile fields from online room messages', () => {
  expect(decodeClientMessage(JSON.stringify({ type: 'room.create', requestId: 'create', profile: { nickname: 'Spoofed', avatarId: 'banana' } })))
    .toEqual({ type: 'room.create', requestId: 'create' });
  expect(decodeClientMessage(JSON.stringify({ type: 'room.join', requestId: 'join', roomCode: 'ABCD23', profile: 'spoof' })))
    .toEqual({ type: 'room.join', requestId: 'join', roomCode: 'ABCD23' });
});

test('buffers lobby and room requests until authentication acknowledgement on every connection', () => {
  jest.useFakeTimers();
  const sockets: Socket[] = [];
  const client = new GameClient({ url: 'ws://test', authToken: 'secret', reconnectDelayMs: 10, webSocketFactory: () => {
    const socket = new Socket(); sockets.push(socket); return socket;
  } });
  client.subscribeLobby();
  sockets[0].open();
  const requestId = client.applyToRoom('ABCD23');
  client.refreshLobby();
  expect(sockets[0].messages).toEqual([{ type: 'session.authenticate', token: 'secret' }]);
  sockets[0].authenticate();
  expect(sockets[0].messages).toEqual([
    { type: 'session.authenticate', token: 'secret' }, { type: 'room.lobby.subscribe' },
    { type: 'room.join', requestId, roomCode: 'ABCD23' },
  ]);
  sockets[0].handlers.onClose();
  jest.advanceTimersByTime(10);
  sockets[1].open();
  expect(sockets[1].messages).toEqual([{ type: 'session.authenticate', token: 'secret' }]);
  sockets[1].authenticate();
  expect(sockets[1].messages).toContainEqual({ type: 'room.lobby.subscribe' });
  client.disconnect();
  jest.useRealTimers();
});

test('4401 clears pending work and stops reconnecting with AUTH_REQUIRED', () => {
  jest.useFakeTimers();
  const socket = new Socket();
  const errors: string[] = [];
  let connections = 0;
  const client = new GameClient({ url: 'ws://test', authToken: 'expired', webSocketFactory: () => {
    connections += 1; return socket;
  }, handlers: { onError: error => errors.push(error.code) } });
  client.subscribeLobby();
  client.createRoom();
  socket.open();
  socket.authenticate();
  socket.handlers.onMessage(JSON.stringify(roomSession()));
  expect(client.getRoomCode()).toBe('ABCD23');
  client.flip();
  socket.handlers.onClose(4401);
  jest.advanceTimersByTime(30_000);
  expect(connections).toBe(1);
  expect(errors).toEqual(['AUTH_REQUIRED']);
  expect(client.getStatus()).toBe('error');
  expect(client.getRoomCode()).toBeNull();
  expect(client.getLocalPlayerId()).toBeNull();
  jest.useRealTimers();
});

test('authenticates the replacement socket before reconnecting a seat or retrying pending game actions', () => {
  jest.useFakeTimers();
  const sockets: Socket[] = [];
  const client = new GameClient({ url: 'ws://test', authToken: 'secret', reconnectDelayMs: 10, webSocketFactory: () => {
    const socket = new Socket(); sockets.push(socket); return socket;
  } });
  client.createRoom(); sockets[0].open(); sockets[0].authenticate();
  sockets[0].handlers.onMessage(JSON.stringify(roomSession()));
  const actionId = client.flip();
  sockets[0].handlers.onClose(); jest.advanceTimersByTime(10);
  sockets[1].open();
  expect(sockets[1].messages).toEqual([{ type: 'session.authenticate', token: 'secret' }]);
  sockets[1].authenticate();
  expect(sockets[1].messages).toEqual([
    { type: 'session.authenticate', token: 'secret' },
    expect.objectContaining({ type: 'room.reconnect', roomCode: 'ABCD23', seatToken: 'seat-secret' }),
  ]);
  sockets[1].handlers.onMessage(JSON.stringify(roomSession()));
  expect(sockets[1].messages.slice(-1)).toEqual([{ type: 'game.flip', actionId }]);
  client.disconnect(); jest.useRealTimers();
});

function roomSession() {
  return {
    type: 'room.session', requestId: 'session', roomCode: 'ABCD23', localPlayerId: 'A', seatToken: 'seat-secret',
    snapshot: createRoomSnapshot({ roomCode: 'ABCD23', phase: 'waiting', game: null,
      connected: { A: true, B: false }, profiles: { A: { nickname: 'Host', avatarId: 'peach' }, B: { nickname: '', avatarId: 'strawberry' } },
      tableVersion: 0, remainingSeconds: null, lastRingEvent: null, lastFlipEvent: null,
      ready: { A: false, B: false }, ringHistory: [],
    }, 'A'),
  };
}
