/** @jest-environment node */
import { createMiniGameStores } from '../../stores/gameStore';
import { createMiniGameApp } from '../../runtime/navigation';
import { dispatchScreenAction, getScreenSnapshot, renderHome } from '../home';
import { renderAccount } from '../account';
import { renderLobby } from '../lobby';
import { layoutForScreen } from '../../runtime/layout';
import { startMiniGame } from '../../entry';

const user = { userId: 'server-user', username: null, wechatLinked: true,
  profile: { nickname: 'Server name', avatarId: 'banana' } };
const session = { token: 'fixture-session', expiresAt: Date.now() + 3600000, user };
const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
function fixture(saved?: unknown) {
  const values = new Map<string, string>();
  if (saved) values.set('bellfive-auth', JSON.stringify({ state: saved, version: 0 }));
  const requests: any[] = []; const sockets: any[] = []; const loginCallbacks: any[] = [];
  const api = {
    getStorage: ({ key, success, fail }: any) => values.has(key) ? success({ data: values.get(key) }) : fail({ errMsg: 'data not found' }),
    setStorage: ({ key, data, success }: any) => { values.set(key, data); success({}); },
    removeStorage: ({ key, success }: any) => { values.delete(key); success({}); },
    login: jest.fn((callbacks: any) => loginCallbacks.push(callbacks)),
    request: jest.fn((request: any) => { requests.push(request); }),
    connectSocket: jest.fn(() => {
      const listeners: any = {}; const sent: any[] = [];
      const socket = { listeners, sent, close: jest.fn(),
        onOpen: (fn: any) => { listeners.open = fn; }, onMessage: (fn: any) => { listeners.message = fn; },
        onClose: (fn: any) => { listeners.close = fn; }, onError: (fn: any) => { listeners.error = fn; },
        send: ({ data }: any) => sent.push(JSON.parse(data)),
      }; sockets.push(socket); return socket;
    }),
  };
  const stores = createMiniGameStores(api as any, { authUrl: 'https://accounts.example.test', socketUrl: 'wss://rooms.example.test' });
  const keyboard = { focus: jest.fn(), blur: jest.fn(), dispose: jest.fn() };
  const app = createMiniGameApp(keyboard);
  const respond = (data: unknown, statusCode = 200) => requests.shift().success({ data, statusCode });
  const authorize = async () => { await flush(); loginCallbacks.shift().success({ code: 'fixture-code' }); await flush(); respond(session); await flush(); };
  const message = (data: unknown) => sockets[0].listeners.message({ data: JSON.stringify(data) });
  const connect = () => { sockets[0].listeners.open(); message({ type: 'session.authenticated', userId: user.userId }); };
  const dispose = () => { stores.game.getState().leaveRoom(); stores.dispose(); };
  return { api, stores, app, values, requests, sockets, loginCallbacks, keyboard, respond, authorize, message, connect, dispose };
}

test('guest online intent authenticates on the server, persists session, and resumes once after socket acknowledgement', async () => {
  const f = fixture(); await f.stores.ready;
  const pending = dispatchScreenAction('home.create', f.app, f.stores);
  await flush(); expect(f.api.login).toHaveBeenCalledTimes(1); expect(f.api.connectSocket).not.toHaveBeenCalled();
  await dispatchScreenAction('home.lobby', f.app, f.stores);
  await f.authorize(); await pending;
  expect(JSON.parse(f.values.get('bellfive-auth')!).state.sessionToken).toBe(session.token);
  expect(f.api.connectSocket).toHaveBeenCalledTimes(1);
  expect(f.sockets[0].sent).toEqual([]);
  f.connect(); expect(f.sockets[0].sent.map((item: any) => item.type)).toEqual(['session.authenticate', 'room.create']);
  expect(f.app.getState().pendingIntent).toBeNull(); f.dispose();
});

test('login API failure retains only the requested intent for retry and keeps guest solo available without a socket', async () => {
  const f = fixture(); await f.stores.ready;
  const pending = dispatchScreenAction('home.lobby', f.app, f.stores); await flush();
  f.loginCallbacks.shift().success({ code: 'expired-code' }); await flush();
  f.respond({ error: { code: 'WECHAT_CODE_INVALID', message: 'Expired' } }, 400); await pending;
  expect(f.app.navigation.current).toBe('home'); expect(f.app.getState().errorCode).toBe('WECHAT_CODE_INVALID');
  expect(f.app.getState().pendingIntent).toEqual({ type: 'open-lobby' });
  await dispatchScreenAction('home.solo.normal', f.app, f.stores);
  expect(f.stores.game.getState().sessionMode).toBe('single-player'); expect(f.app.getState().pendingIntent).toBeNull();
  expect(f.api.connectSocket).not.toHaveBeenCalled(); f.dispose();
});

test('retry obtains a fresh WeChat code and resumes the retained lobby intent exactly once', async () => {
  const f = fixture(); await f.stores.ready;
  const first = dispatchScreenAction('home.lobby', f.app, f.stores); await flush();
  f.loginCallbacks.shift().fail({ errMsg: 'private text' }); await first;
  const retry = dispatchScreenAction('auth.retry', f.app, f.stores); await f.authorize(); await retry;
  f.connect(); expect(f.api.login).toHaveBeenCalledTimes(2);
  expect(f.app.navigation.current).toBe('lobby');
  expect(f.sockets[0].sent.filter((item: any) => item.type === 'room.lobby.subscribe')).toHaveLength(1); f.dispose();
});

test('cancel or choosing solo while login is in flight prevents late authentication from opening any socket', async () => {
  for (const action of ['auth.cancel', 'home.solo.easy']) {
    const f = fixture(); await f.stores.ready;
    const pending = dispatchScreenAction('home.create', f.app, f.stores); await flush();
    await dispatchScreenAction(action, f.app, f.stores); await f.authorize(); await pending;
    expect(f.api.connectSocket).not.toHaveBeenCalled(); expect(f.app.getState().pendingIntent).toBeNull(); f.dispose();
  }
});

test('persisted session must refresh server profile before any online connection; profile refresh preserves client identity', async () => {
  const f = fixture({ user: { ...user, profile: { nickname: 'Stale', avatarId: 'pear' } }, sessionToken: session.token, sessionExpiresAt: session.expiresAt });
  const pending = dispatchScreenAction('home.lobby', f.app, f.stores); await flush();
  expect(f.requests[0].url).toBe('https://accounts.example.test/auth/me');
  expect(f.api.login).not.toHaveBeenCalled(); expect(f.api.connectSocket).not.toHaveBeenCalled();
  f.respond(user); await pending; f.connect();
  const client = f.stores.game.getState().client;
  const refresh = dispatchScreenAction('account.refresh', f.app, f.stores); await flush();
  f.respond({ ...user, profile: { nickname: 'Updated', avatarId: 'bell' } }); await refresh;
  expect(f.stores.auth.getState().user?.profile.nickname).toBe('Updated');
  expect(f.stores.game.getState().client).toBe(client); expect(f.api.connectSocket).toHaveBeenCalledTimes(1); f.dispose();
});

test('unverified persisted session after a network failure is gated until a successful refresh', async () => {
  const f = fixture({ user, sessionToken: session.token, sessionExpiresAt: session.expiresAt }); await flush();
  f.requests.shift().fail({ errMsg: 'offline' }); await f.stores.ready;
  const pending = dispatchScreenAction('home.create', f.app, f.stores); await flush();
  expect(f.api.connectSocket).not.toHaveBeenCalled(); expect(f.api.login).not.toHaveBeenCalled();
  f.respond(user); await pending; expect(f.api.connectSocket).toHaveBeenCalledTimes(1); f.dispose();
});

test('expired persisted token is discarded and guest solo starts without account or socket requests', async () => {
  const f = fixture({ user, sessionToken: session.token, sessionExpiresAt: Date.now() - 1 }); await f.stores.ready;
  await dispatchScreenAction('home.solo.hard', f.app, f.stores);
  expect(f.stores.auth.getState().sessionToken).toBeNull(); expect(f.api.request).not.toHaveBeenCalled();
  expect(f.api.login).not.toHaveBeenCalled(); expect(f.api.connectSocket).not.toHaveBeenCalled(); f.dispose();
});

test('room code validation runs before login; normalized valid code is the sole resumed join request', async () => {
  const f = fixture(); await f.stores.ready; f.app.setField('roomCode', 'invalid!');
  await dispatchScreenAction('home.join', f.app, f.stores); expect(f.api.login).not.toHaveBeenCalled();
  expect(f.app.getState().errorCode).toBe('INVALID_ROOM_CODE'); f.app.setField('roomCode', ' abc234 ');
  const pending = dispatchScreenAction('home.join', f.app, f.stores); await f.authorize(); await pending; f.connect();
  expect(f.sockets[0].sent.find((item: any) => item.type === 'room.join').roomCode).toBe('ABC234'); f.dispose();
});

test('lobby uses only server room/profile and application status, and cancellation does not locally approve or remove it', async () => {
  const f = fixture(); await f.stores.ready;
  const pending = dispatchScreenAction('home.lobby', f.app, f.stores); await f.authorize(); await pending; f.connect();
  expect(f.stores.game.getState().lobbySnapshotReceived).toBe(false);
  f.message({ type: 'room.lobby.snapshot', rooms: [{ roomCode: 'ABC234', hostProfile: user.profile }] });
  await dispatchScreenAction('lobby.apply.ABC234', f.app, f.stores);
  f.message({ type: 'room.application.status', applicationId: 'application', status: 'pending', message: 'Waiting for host' });
  await dispatchScreenAction('lobby.cancel', f.app, f.stores);
  expect(f.stores.game.getState().localApplicationStatus?.status).toBe('pending');
  expect(f.sockets[0].sent.at(-1)).toEqual({ type: 'room.application.cancel', applicationId: 'application' });
  f.message({ type: 'room.application.status', applicationId: 'application', status: 'cancelled', message: 'Cancelled' });
  expect(f.stores.game.getState().localApplicationStatus?.status).toBe('cancelled');
  f.message({ type: 'error', code: 'NETWORK_ERROR', message: 'Connection unavailable' });
  await dispatchScreenAction('lobby.refresh', f.app, f.stores);
  expect(f.stores.game.getState().lobbySnapshotReceived).toBe(false);
  expect(f.stores.game.getState().error).toBeNull(); f.dispose();
});

test('account keyboard buffers mask password glyphs and clear immediately on submit, failure, and navigation', async () => {
  const f = fixture(); await f.stores.ready; await dispatchScreenAction('home.account', f.app, f.stores);
  await dispatchScreenAction('account.mode.login', f.app, f.stores);
  await dispatchScreenAction('field.password', f.app, f.stores);
  f.keyboard.focus.mock.calls[0][0].onInput('fixture-password'); f.app.setField('username', 'player');
  const context = canvasContext(); renderAccount(context as any, geometry, getScreenSnapshot(f.app, f.stores));
  expect(context.texts.join(' ')).not.toContain('fixture-password'); expect(context.texts.join(' ')).toContain('••');
  const submit = dispatchScreenAction('account.submit', f.app, f.stores); await flush();
  expect(f.app.getState().fields.password).toBe('');
  f.respond({ error: { code: 'INVALID_CREDENTIALS', message: 'private' } }, 401); await submit;
  expect(f.app.getState().errorCode).toBe('INVALID_CREDENTIALS');
  f.app.setField('password', 'another-password'); await dispatchScreenAction('nav.home', f.app, f.stores);
  expect(f.app.getState().fields.password).toBe(''); f.dispose();
});

test('profile save sanitizes guest data locally and authenticated profile uses server response', async () => {
  const f = fixture(); await f.stores.ready;
  await dispatchScreenAction('account.mode.profile', f.app, f.stores);
  f.app.setField('nickname', '  Guest  '); await dispatchScreenAction('account.avatar.bell', f.app, f.stores);
  await dispatchScreenAction('account.submit', f.app, f.stores);
  expect(f.stores.profile.getState().profile).toEqual({ nickname: 'Guest', avatarId: 'bell' }); expect(f.api.request).not.toHaveBeenCalled();
  const login = dispatchScreenAction('account.wechat', f.app, f.stores); await f.authorize(); await login;
  await dispatchScreenAction('account.mode.profile', f.app, f.stores); f.app.setField('nickname', ' New name ');
  const save = dispatchScreenAction('account.submit', f.app, f.stores); await flush();
  expect(JSON.parse(f.requests[0].data).profile.nickname).toBe('New name');
  f.respond({ ...user, profile: { nickname: 'Canonical', avatarId: 'pear' } }); await save;
  expect(f.stores.auth.getState().user?.profile.nickname).toBe('Canonical'); f.dispose();
});

test('existing-account link requires explicit transfer confirmation and a fresh WeChat code', async () => {
  const f = fixture(); await f.stores.ready;
  const login = dispatchScreenAction('account.wechat', f.app, f.stores); await f.authorize(); await login;
  await dispatchScreenAction('account.mode.link', f.app, f.stores); f.app.setField('username', 'existing'); f.app.setField('password', 'fixture-password');
  await dispatchScreenAction('account.submit', f.app, f.stores);
  expect(f.api.login).toHaveBeenCalledTimes(1); expect(f.app.getState().confirmTransfer).toBe(false);
  expect(f.app.getState().errorCode).toBe('TRANSFER_CONFIRMATION_REQUIRED');
  await dispatchScreenAction('account.confirmTransfer', f.app, f.stores);
  f.app.setField('password', 'fixture-password');
  const link = dispatchScreenAction('account.submit', f.app, f.stores); await flush();
  f.loginCallbacks.shift().success({ code: 'fresh-link-code' }); await flush();
  expect(JSON.parse(f.requests[0].data)).toEqual({ code: 'fresh-link-code', username: 'existing', password: 'fixture-password', confirmedTransfer: true });
  f.respond({ ...session, token: 'replacement-session' }); await link;
  expect(f.stores.auth.getState().sessionToken).toBe('replacement-session'); expect(f.app.getState().fields.password).toBe(''); f.dispose();
});

test('credentials, WeChat password recovery, language, and logout use shared account contracts', async () => {
  const f = fixture(); await f.stores.ready;
  const login = dispatchScreenAction('account.wechat', f.app, f.stores); await f.authorize(); await login;
  await dispatchScreenAction('account.mode.credentials', f.app, f.stores); f.app.setField('username', 'new_player'); f.app.setField('password', 'fixture-password');
  const setup = dispatchScreenAction('account.submit', f.app, f.stores); await flush();
  expect(f.requests[0].url).toContain('/auth/credentials'); f.respond({ ...user, username: 'new_player' }); await setup;
  await dispatchScreenAction('account.mode.reset', f.app, f.stores); f.app.setField('password', 'replacement-password');
  const reset = dispatchScreenAction('account.submit', f.app, f.stores); await flush(); f.loginCallbacks.shift().success({ code: 'reset-code' }); await flush();
  expect(f.requests[0].url).toContain('/auth/password/reset/wechat'); f.respond(session); await reset;
  await dispatchScreenAction('settings.language', f.app, f.stores); expect(f.stores.settings.getState().language).toBe('en');
  f.app.setField('password', 'clear-me'); const logout = dispatchScreenAction('account.logout', f.app, f.stores); await flush();
  expect(f.stores.auth.getState().sessionToken).toBeNull(); expect(f.app.getState().fields.password).toBe(''); f.respond(undefined, 204); await logout; f.dispose();
});

const geometry = layoutForScreen(320, 568, { top: 20, bottom: 20 });
function canvasContext() {
  const texts: string[] = []; return { texts, fillRect: jest.fn(), fillText: (text: string) => texts.push(text),
    save: jest.fn(), restore: jest.fn(), beginPath: jest.fn(), rect: jest.fn(), clip: jest.fn(), measureText: (text: string) => ({ width: text.length * 8 }) };
}
test('renderers return enabled targets within the safe content and preserve solo after an account error', async () => {
  const f = fixture(); await f.stores.ready;
  for (const render of [renderHome, renderAccount, renderLobby]) {
    const targets = render(canvasContext() as any, geometry, getScreenSnapshot(f.app, f.stores));
    for (const { rect } of targets) { expect(rect.y).toBeGreaterThanOrEqual(20); expect(rect.y + rect.height).toBeLessThanOrEqual(548); }
  }
  const targets = renderHome(canvasContext() as any, geometry, getScreenSnapshot(f.app, f.stores));
  expect(targets.some(target => target.id === 'home.solo.normal')).toBe(true); f.dispose();
});

test('leaving the lobby during reauthentication cancels the refresh intent before a late login can reconnect', async () => {
  const f = fixture(); await f.stores.ready;
  const login = dispatchScreenAction('home.lobby', f.app, f.stores); await f.authorize(); await login; f.connect();
  const logout = f.stores.auth.getState().logout(); await flush(); f.respond(undefined, 204); await logout;
  const refresh = dispatchScreenAction('lobby.refresh', f.app, f.stores); await flush();
  await dispatchScreenAction('nav.home', f.app, f.stores); await f.authorize(); await refresh;
  expect(f.app.navigation.current).toBe('home'); expect(f.api.connectSocket).toHaveBeenCalledTimes(1); f.dispose();
});

test('4401 clears the session and client; next online action obtains a fresh session while solo remains available', async () => {
  const f = fixture(); await f.stores.ready;
  const login = dispatchScreenAction('home.lobby', f.app, f.stores); await f.authorize(); await login; f.connect();
  f.sockets[0].listeners.close({ code: 4401 }); await flush();
  expect(f.stores.auth.getState().sessionToken).toBeNull(); expect(f.stores.game.getState().client).toBeNull();
  f.respond(undefined, 204); await flush();
  await dispatchScreenAction('home.solo.easy', f.app, f.stores);
  expect(f.stores.game.getState().sessionMode).toBe('single-player'); expect(f.api.connectSocket).toHaveBeenCalledTimes(1); f.dispose();
});

test('username registration uses the shared sanitized guest profile and never opens an online client', async () => {
  const f = fixture(); await f.stores.ready; f.stores.profile.getState().setProfile({ nickname: ' Guest ', avatarId: 'bell' });
  await dispatchScreenAction('account.mode.register', f.app, f.stores);
  f.app.setField('username', 'new_player'); f.app.setField('password', 'fixture-password');
  const submit = dispatchScreenAction('account.submit', f.app, f.stores); await flush();
  expect(JSON.parse(f.requests[0].data)).toEqual({ username: 'new_player', password: 'fixture-password', initialProfile: { nickname: 'Guest', avatarId: 'bell' } });
  f.respond(session); await submit; expect(f.api.connectSocket).not.toHaveBeenCalled(); expect(f.app.getState().fields.password).toBe(''); f.dispose();
});

test('native entry renders home, dispatches one solo tap, and clears keyboard buffers on hide and destroy', async () => {
  const f = fixture(); await f.stores.ready;
  const events: any = {}; const frames = new Map<number, (time: number) => void>(); let next = 0;
  const context = { ...canvasContext(), clearRect: jest.fn(), setTransform: jest.fn() };
  const nativeApi: any = { ...f.api,
    createCanvas: () => ({ getContext: () => context, width: 0, height: 0 }),
    getSystemInfoSync: () => ({ windowWidth: 320, windowHeight: 568, pixelRatio: 2 }),
    showKeyboard: jest.fn(), hideKeyboard: jest.fn(),
  };
  for (const [method, event] of [['TouchStart', 'start'], ['TouchEnd', 'end'], ['TouchCancel', 'cancel'], ['WindowResize', 'resize'],
    ['Hide', 'hide'], ['Show', 'show'], ['KeyDown', 'key'], ['KeyboardInput', 'input'], ['KeyboardConfirm', 'confirm'], ['KeyboardComplete', 'complete']]) {
    nativeApi[`on${method}`] = (fn: any) => { events[event] = fn; };
    nativeApi[`off${method}`] = jest.fn();
  }
  const boot = startMiniGame(nativeApi, { scheduler: { requestFrame: callback => { frames.set(++next, callback); return next; }, cancelFrame: handle => { frames.delete(handle); } } });
  await boot.stores.ready; const frame = [...frames.values()][0]; frames.clear(); frame(0);
  expect(context.texts).toContain('BellFive');
  const target = renderHome(context as any, boot.runtime.layout, getScreenSnapshot(boot.app, boot.stores)).find(item => item.id === 'home.solo.normal')!;
  const touch = { changedTouches: [{ identifier: 1, clientX: target.rect.x + 1, clientY: target.rect.y + 1 }] };
  events.start(touch); events.end(touch);
  expect(boot.stores.game.getState().sessionMode).toBe('single-player'); expect(boot.app.navigation.current).toBe('solo');
  expect(f.api.request).not.toHaveBeenCalled(); expect(f.api.connectSocket).not.toHaveBeenCalled();
  boot.app.setField('password', 'clear-on-hide'); events.hide(); expect(boot.app.getState().fields.password).toBe('');
  boot.destroy(); expect(frames.size).toBe(0); expect(nativeApi.offKeyboardInput).toHaveBeenCalledTimes(1); f.dispose();
});
