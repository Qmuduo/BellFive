/** @jest-environment node */
import { request } from 'node:http';
import { openAuthDatabase } from '../auth/database';
import { AuthRepository } from '../auth/repository';
import { AuthService } from '../auth/service';
import { WechatCodeExchanger } from '../auth/wechat';
import { RoomManager } from '../roomManager';
import { createWebSocketServer, type RunningRoomServer } from '../websocketServer';

let db: ReturnType<typeof openAuthDatabase>;
let server: RunningRoomServer;
let service: AuthService;
const password = 'Password123';
const origin = 'http://localhost:8081';

beforeEach(async () => {
  db = openAuthDatabase(':memory:');
  process.env.BELLFIVE_WECHAT_MINI_APP_ID = 'test-app';
  process.env.BELLFIVE_WECHAT_MINI_APP_SECRET = 'private-app-secret';
  const fetcher = (async (input: string | URL | Request) => {
    const code = new URL(String(input)).searchParams.get('js_code');
    return new Response(JSON.stringify(code === 'invalid'
      ? { errcode: 40029, errmsg: 'private-provider-details' }
      : { openid: code, session_key: 'private-session-key' }));
  }) as typeof fetch;
  service = new AuthService(new AuthRepository(db), new WechatCodeExchanger(fetcher));
  server = await createWebSocketServer({
    roomManager: new RoomManager(), host: '127.0.0.1', port: 0,
    authService: service, corsOrigins: [origin],
  });
});

afterEach(async () => {
  await server?.close();
  db.close();
  delete process.env.BELLFIVE_WECHAT_MINI_APP_ID;
  delete process.env.BELLFIVE_WECHAT_MINI_APP_SECRET;
});

async function call(path: string, method = 'GET', payload?: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return raw(path, method, payload === undefined ? [] : [JSON.stringify(payload)], headers);
}

function raw(path: string, method: string, chunks: string[], headers: Record<string, string | string[]> = {}) {
  return new Promise<{ status: number; headers: import('node:http').IncomingHttpHeaders; body: any }>((resolve, reject) => {
    const req = request(new URL(path, server.httpUrl), { method, headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: body ? JSON.parse(body) : null }));
      res.on('error', reject);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test('health remains available and unknown HTTP paths return JSON 404', async () => {
  expect(await call('/health')).toMatchObject({ status: 200, body: { status: 'ok' } });
  expect(await call('/unknown')).toMatchObject({ status: 404, body: { error: 'not_found' } });
});

test('registration, password login and current-account reads return safe persisted account data', async () => {
  const registered = await call('/auth/register', 'POST', {
    username: ' KAI ', password, initialProfile: { nickname: '  Kai  ', avatarId: 'banana' },
  });
  expect(registered.status).toBe(201);
  expect(registered.body).toMatchObject({ token: expect.any(String), expiresAt: expect.any(Number), user: {
    userId: expect.any(String), username: 'kai', wechatLinked: false, profile: { nickname: 'Kai', avatarId: 'banana' },
  } });
  const loggedIn = await call('/auth/login', 'POST', { username: 'kai', password });
  expect(loggedIn.status).toBe(200);
  expect(loggedIn.body.user).toEqual(registered.body.user);
  const me = await call('/auth/me', 'GET', undefined, loggedIn.body.token);
  expect(me).toMatchObject({ status: 200, body: registered.body.user });
  expect(Object.keys(me.body).sort()).toEqual(['profile', 'userId', 'username', 'wechatLinked']);
  expect(await call('/auth/register', 'POST', { username: 'kai', password }))
    .toMatchObject({ status: 409, body: { error: { code: 'USERNAME_TAKEN', message: expect.any(String) } } });
  expect(await call('/auth/login', 'POST', { username: 'kai', password: 'incorrect' }))
    .toMatchObject({ status: 401, body: { error: { code: 'INVALID_CREDENTIALS' } } });
});

test('profile changes return AuthUser and logout revokes the bearer session', async () => {
  const session = await service.register({ username: 'kai', password }, {});
  const profile = await call('/auth/me/profile', 'PATCH', { profile: { nickname: ' New ', avatarId: 'bad' } }, session.token);
  expect(profile).toMatchObject({ status: 200, body: {
    userId: session.user.userId, username: 'kai', wechatLinked: false,
    profile: { nickname: 'New', avatarId: 'strawberry' },
  } });
  expect((await call('/auth/me', 'GET', undefined, session.token)).body).toEqual(profile.body);
  expect(await call('/auth/logout', 'POST', undefined, session.token)).toMatchObject({ status: 204, body: null });
  expect(await call('/auth/me', 'GET', undefined, session.token)).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHORIZED' } } });
});

test('native clients can update profile through authenticated POST using the same PATCH semantics', async () => {
  const session = await service.register({ username: 'native_player', password }, {});
  const payload = { profile: { nickname: ' Mini Game ', avatarId: 'bad' } };
  expect(await call('/auth/me/profile', 'POST', payload)).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHORIZED' } } });
  const updated = await call('/auth/me/profile', 'POST', payload, session.token);
  expect(updated).toMatchObject({ status: 200, body: {
    userId: session.user.userId, username: 'native_player', wechatLinked: false,
    profile: { nickname: 'Mini Game', avatarId: 'strawberry' },
  } });
  expect(await call('/auth/me/profile', 'PATCH', payload, session.token)).toMatchObject({ status: 200, body: updated.body });
  expect(await call('/auth/me/profile', 'POST', {}, session.token)).toMatchObject({ status: 400, body: { error: { code: 'INVALID_INPUT' } } });
});

test('WeChat-only accounts can add credentials and reset through their linked identity', async () => {
  const wechat = await call('/auth/wechat/login', 'POST', { code: 'identity' });
  expect(wechat).toMatchObject({ status: 200, body: { user: { username: null, wechatLinked: true } } });
  const credentials = await call('/auth/credentials', 'POST', { username: 'kai', password }, wechat.body.token);
  expect(credentials).toMatchObject({ status: 200, body: { username: 'kai', wechatLinked: true } });
  const reset = await call('/auth/password/reset/wechat', 'POST', { code: 'identity', newPassword: 'Changed123' });
  expect(reset).toMatchObject({ status: 200, body: { token: expect.any(String), user: { username: 'kai' } } });
  expect(await call('/auth/me', 'GET', undefined, wechat.body.token)).toMatchObject({ status: 401 });
  expect(await call('/auth/login', 'POST', { username: 'kai', password: 'Changed123' })).toMatchObject({ status: 200 });
});

test('WeChat binding preserves conflicts until explicit transfer confirmation', async () => {
  const temporary = await service.loginWithWechat('identity');
  const target = await service.register({ username: 'kai', password }, { nickname: 'Target', avatarId: 'banana' });
  const input = { code: 'identity', username: 'kai', password, confirmedTransfer: false };
  expect(await call('/auth/wechat/link', 'POST', input, temporary.token))
    .toMatchObject({ status: 409, body: { error: { code: 'WECHAT_IDENTITY_CONFLICT' } } });
  const linked = await call('/auth/wechat/link', 'POST', { ...input, confirmedTransfer: true }, temporary.token);
  expect(linked).toMatchObject({ status: 200, body: { user: { userId: target.user.userId, wechatLinked: true } } });
  expect(await call('/auth/me', 'GET', undefined, temporary.token)).toMatchObject({ status: 401 });
});

test.each([
  ['/auth/me', 'GET', undefined], ['/auth/me/profile', 'PATCH', { profile: {} }],
  ['/auth/credentials', 'POST', { username: 'kai', password }],
  ['/auth/wechat/link', 'POST', { code: 'identity', username: 'kai', password, confirmedTransfer: false }],
  ['/auth/logout', 'POST', undefined],
])('requires a valid bearer for %s', async (path, method, payload) => {
  expect(await call(path, method, payload)).toMatchObject({ status: 401, body: { error: { code: 'UNAUTHORIZED' } } });
  expect(await call(path, method, payload, 'unknown')).toMatchObject({ status: 401 });
});

test.each(['Basic token', 'Bearer ', 'Bearer one,two', 'Bearer one two'])('rejects malformed authorization %s', async authorization => {
  expect(await raw('/auth/me', 'GET', [], { Authorization: authorization })).toMatchObject({ status: 401 });
});

test('rejects duplicate Authorization even when Node exposes only its first value', async () => {
  const session = await service.register({ username: 'kai', password }, {});
  expect(await raw('/auth/me', 'GET', [], { Authorization: [`Bearer ${session.token}`, `Bearer ${session.token}`] }))
    .toMatchObject({ status: 401 });
});

test('preflight and browser responses use only configured exact origins', async () => {
  const preflight = await raw('/auth/login', 'OPTIONS', [], { Origin: origin, 'Access-Control-Request-Method': 'POST' });
  expect(preflight).toMatchObject({ status: 204, headers: { 'access-control-allow-origin': origin } });
  expect(preflight.headers['access-control-allow-headers']).toMatch(/authorization/i);
  expect(preflight.headers.vary).toBe('Origin');
  const allowed = await raw('/auth/me', 'GET', [], { Origin: origin });
  expect(allowed).toMatchObject({ status: 401, headers: { 'access-control-allow-origin': origin } });
  const denied = await raw('/auth/register', 'POST', [JSON.stringify({ username: 'kai', password })], {
    Origin: 'http://localhost:8081.evil.example', 'Content-Type': 'application/json',
  });
  expect(denied).toMatchObject({ status: 403, body: { error: { code: 'CORS_ORIGIN_DENIED' } } });
  expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 0 });
});

test('malformed JSON and non-object payloads fail without creating users', async () => {
  expect(await raw('/auth/register', 'POST', ['{bad'], { 'Content-Type': 'application/json' }))
    .toMatchObject({ status: 400, body: { error: { code: 'INVALID_JSON' } } });
  for (const value of [null, [], {}, { username: 1, password }, { username: 'kai', password: 1 }]) {
    expect(await call('/auth/register', 'POST', value)).toMatchObject({ status: 400, body: { error: { code: 'INVALID_INPUT' } } });
  }
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 0 });
});

test('enforces 16 KiB by actual bytes for chunked bodies while accepting the exact boundary', async () => {
  const valid = JSON.stringify({ username: 'kai', password });
  const boundary = valid + ' '.repeat(16 * 1024 - Buffer.byteLength(valid));
  expect(await raw('/auth/register', 'POST', [boundary], { 'Content-Type': 'application/json' })).toMatchObject({ status: 201 });
  expect(await raw('/auth/login', 'POST', [boundary, ' '], { 'Content-Type': 'application/json' }))
    .toMatchObject({ status: 413, body: { error: { code: 'BODY_TOO_LARGE' } } });
  expect(await raw('/auth/login', 'POST', ['😀'.repeat(5000)], { 'Content-Type': 'application/json' }))
    .toMatchObject({ status: 413 });
});

test('missing WeChat configuration does not stop health or password accounts', async () => {
  delete process.env.BELLFIVE_WECHAT_MINI_APP_ID;
  delete process.env.BELLFIVE_WECHAT_MINI_APP_SECRET;
  expect(await call('/health')).toMatchObject({ status: 200 });
  expect(await call('/auth/register', 'POST', { username: 'kai', password })).toMatchObject({ status: 201 });
  expect(await call('/auth/login', 'POST', { username: 'kai', password })).toMatchObject({ status: 200 });
  expect(await call('/auth/wechat/login', 'POST', { code: 'identity' }))
    .toMatchObject({ status: 503, body: { error: { code: 'WECHAT_NOT_CONFIGURED', message: expect.any(String) } } });
});

test('logout also rejects an oversized chunked body before revoking the session', async () => {
  const session = await service.register({ username: 'kai', password }, {});
  expect(await raw('/auth/logout', 'POST', [' '.repeat(16384), ' '], {
    Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json',
  })).toMatchObject({ status: 413, body: { error: { code: 'BODY_TOO_LARGE' } } });
  expect(await call('/auth/me', 'GET', undefined, session.token)).toMatchObject({ status: 200 });
});

test('an aborted chunked JSON upload leaves the listener available', async () => {
  await new Promise<void>(resolve => {
    const req = request(new URL('/auth/register', server.httpUrl), { method: 'POST' });
    req.on('error', () => resolve());
    req.on('socket', socket => socket.on('connect', () => {
      req.write('{"username":');
      // Give the server time to begin consuming the body before disconnecting.
      setTimeout(() => req.destroy(), 30);
    }));
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(await call('/health')).toMatchObject({ status: 200, body: { status: 'ok' } });
});

test('provider details and unexpected internal failures stay out of HTTP errors', async () => {
  const invalid = await call('/auth/wechat/login', 'POST', { code: 'invalid' });
  expect(invalid).toMatchObject({ status: 400, body: { error: { code: 'WECHAT_CODE_INVALID' } } });
  expect(JSON.stringify(invalid.body)).not.toMatch(/private|openid|session_key|secret/i);
  db.close();
  const internal = await call('/auth/login', 'POST', { username: 'kai', password });
  expect(internal).toMatchObject({ status: 500, body: { error: { code: 'SERVER_ERROR' } } });
  expect(JSON.stringify(internal.body)).not.toMatch(/database|sqlite|password|digest/i);
  db = openAuthDatabase(':memory:');
});
