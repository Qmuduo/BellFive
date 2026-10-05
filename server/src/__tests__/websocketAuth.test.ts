/** @jest-environment node */
import { WebSocket } from 'ws';
import { openAuthDatabase } from '../auth/database';
import { AuthRepository } from '../auth/repository';
import { AuthService } from '../auth/service';
import { WechatCodeExchanger } from '../auth/wechat';
import { RoomManager } from '../roomManager';
import { createWebSocketServer, type RunningRoomServer } from '../websocketServer';

let db: ReturnType<typeof openAuthDatabase>;
let service: AuthService;
let server: RunningRoomServer;
let token: string;
let userId: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  db = openAuthDatabase(':memory:');
  service = new AuthService(new AuthRepository(db), new WechatCodeExchanger());
  const session = await service.register({ username: 'host', password: 'Password123' }, { nickname: 'Trusted', avatarId: 'peach' });
  token = session.token; userId = session.user.userId;
  server = await createWebSocketServer({ roomManager: new RoomManager(), host: '127.0.0.1', port: 0, authService: service });
});
afterEach(async () => { sockets.forEach(socket => socket.terminate()); sockets.length = 0; await server.close(); db.close(); });

async function connect() {
  const socket = new WebSocket(server.webSocketUrl); sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  return socket;
}
function closed(socket: WebSocket) { return new Promise<number>(resolve => socket.once('close', code => resolve(code))); }
function message(socket: WebSocket) { return new Promise<any>(resolve => socket.once('message', raw => resolve(JSON.parse(raw.toString())))); }

test('closes room commands before authentication with 4401 without creating a seat', async () => {
  const socket = await connect();
  const closing = closed(socket);
  const received: any[] = []; socket.on('message', raw => received.push(JSON.parse(raw.toString())));
  socket.send('{"type":"room.create","requestId":"unauthenticated"}');
  expect(await closing).toBe(4401);
  expect(received.some(item => item.type === 'room.session')).toBe(false);
});

test.each(['invalid', 'expired', 'malformed'])('closes %s authentication with 4401', async kind => {
  if (kind === 'expired') db.prepare('UPDATE sessions SET expires_at = 0').run();
  const socket = await connect(); const closing = closed(socket);
  socket.send(JSON.stringify({ type: 'session.authenticate', token: kind === 'invalid' ? 'bad-token' : kind === 'malformed' ? 7 : token }));
  expect(await closing).toBe(4401);
});

test('acknowledges account identity and ignores spoofed profile JSON when allocating the seat', async () => {
  const socket = await connect(); const acknowledgement = message(socket);
  socket.send(JSON.stringify({ type: 'session.authenticate', token }));
  expect(await acknowledgement).toEqual({ type: 'session.authenticated', userId });
  const session = message(socket);
  socket.send(JSON.stringify({ type: 'room.create', requestId: 'create', profile: { nickname: 'Spoofed', avatarId: 'banana' } }));
  expect(await session).toMatchObject({ type: 'room.session', snapshot: { players: { A: { profile: { nickname: 'Trusted', avatarId: 'peach' } } } } });
});

test('closes a socket that has not authenticated by the five second deadline', async () => {
  const socket = await connect();
  expect(await closed(socket)).toBe(4401);
}, 10_000);

test('does not allocate a seat while token authentication is still pending', async () => {
  let resolve!: (value: Awaited<ReturnType<AuthService['authenticateToken']>>) => void;
  const principal = await service.authenticateToken(token);
  jest.spyOn(service, 'authenticateToken').mockImplementation(() => new Promise(done => { resolve = done; }));
  const socket = await connect(); const closing = closed(socket);
  const received: any[] = []; socket.on('message', raw => received.push(JSON.parse(raw.toString())));
  socket.send(JSON.stringify({ type: 'session.authenticate', token }));
  socket.send('{"type":"room.create","requestId":"racing"}');
  expect(await closing).toBe(4401);
  resolve(principal);
  await new Promise(done => setImmediate(done));
  expect(received.some(item => item.type === 'room.session' || item.type === 'session.authenticated')).toBe(false);
});
