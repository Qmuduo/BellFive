/** @jest-environment node */
import { AuthClient } from '../../../../src/auth/AuthClient';
import { AuthClientError } from '../../../../src/auth/contracts';
import { createWxStorage } from '../storage';
import { createWxAuthTransport } from '../authTransport';
import { getWechatLoginCode } from '../wechatLogin';
import { createWxSocket } from '../socket';
import { createWxKeyboard } from '../keyboard';
import { createWxFeedback, shareMiniGame } from '../feedback';
import { createWxRuntimePlatform } from '../wxApi';

test('storage round-trips JSON strings without adding a second serialization layer', async () => {
  const values = new Map<string, unknown>();
  const storage = createWxStorage({
    getStorage: ({ key, success, fail }: any) => values.has(key) ? success({ data: values.get(key) }) : fail({ errMsg: 'getStorage:fail data not found' }),
    setStorage: ({ key, data, success }: any) => { values.set(key, data); success({ errMsg: 'setStorage:ok' }); },
    removeStorage: ({ key, success }: any) => { values.delete(key); success({ errMsg: 'removeStorage:ok' }); },
  } as any);
  expect(await storage.getItem('missing')).toBeNull();
  await storage.setItem('profile', '{"nickname":"Player"}');
  expect(await storage.getItem('profile')).toBe('{"nickname":"Player"}');
  await storage.removeItem('profile'); expect(await storage.getItem('profile')).toBeNull();
  const unavailable = createWxStorage({ getStorage: ({ fail }: any) => fail({ errMsg: 'device storage unavailable' }) } as any);
  await expect(unavailable.getItem('key')).rejects.toThrow('Storage');
});

test('WeChat login returns only the code and sanitizes failed or empty responses', async () => {
  expect(await getWechatLoginCode({ login: ({ success }: any) => success({ code: 'temporary-code', errMsg: 'login:ok', extra: 'ignored' }) } as any)).toBe('temporary-code');
  for (const login of [({ success }: any) => success({ code: '', errMsg: 'login:ok' }), ({ fail }: any) => fail({ errMsg: 'private provider text' })]) {
    await expect(getWechatLoginCode({ login } as any)).rejects.toBeInstanceOf(AuthClientError);
    await expect(getWechatLoginCode({ login } as any)).rejects.not.toThrow('private provider text');
  }
});

test('shared AuthClient profile PATCH uses the native POST alias with bearer and JSON headers', async () => {
  let outbound: any;
  const transport = createWxAuthTransport({ request: (options: any) => {
    outbound = options; options.success({ statusCode: 200, data: { userId: 'user', username: 'player', profile: { nickname: 'Hi', avatarId: 'banana' }, wechatLinked: true }, header: {}, cookies: [] });
  } } as any, 'https://accounts.example.test/');
  const result = await new AuthClient(transport).updateProfile('test-session', { nickname: 'Hi', avatarId: 'banana' });
  expect(result.userId).toBe('user');
  expect(outbound).toMatchObject({ url: 'https://accounts.example.test/auth/me/profile', method: 'POST',
    header: { Authorization: 'Bearer test-session', 'Content-Type': 'application/json', Accept: 'application/json' },
    data: '{"profile":{"nickname":"Hi","avatarId":"banana"}}',
  });
});

test('other account requests keep their methods and unsupported PATCH paths are rejected', async () => {
  const outbound: any[] = [];
  const transport = createWxAuthTransport({ request: (options: any) => {
    outbound.push(options); options.success({ statusCode: 200, data: { ok: true }, header: {}, cookies: [] });
  } } as any, 'https://accounts.example.test');
  await transport({ method: 'GET', path: '/auth/me', token: 'test-session' });
  await transport({ method: 'POST', path: '/auth/login', body: { username: 'player', password: 'test-password' } });
  expect(outbound.map(request => [request.method, request.url])).toEqual([
    ['GET', 'https://accounts.example.test/auth/me'], ['POST', 'https://accounts.example.test/auth/login'],
  ]);
  await expect(transport({ method: 'PATCH', path: '/auth/unknown' })).rejects.toMatchObject({ code: 'UNSUPPORTED_METHOD' });
  expect(outbound).toHaveLength(2);
});

test('auth transport handles no-content, server JSON errors, malformed responses and network failures', async () => {
  const cases = [
    { statusCode: 204, data: '', expected: undefined },
    { statusCode: 401, data: '{"error":{"code":"UNAUTHORIZED","message":"Session expired"}}', code: 'UNAUTHORIZED' },
    { statusCode: 200, data: 'not-json', code: 'INVALID_RESPONSE' },
  ];
  for (const fixture of cases) {
    const transport = createWxAuthTransport({ request: ({ success }: any) => success({ ...fixture, header: {}, cookies: [] }) } as any, 'https://accounts.example.test');
    const result = transport({ method: 'GET', path: '/auth/me' });
    if (fixture.code) await expect(result).rejects.toMatchObject({ code: fixture.code });
    else await expect(result).resolves.toBeUndefined();
  }
  const failing = createWxAuthTransport({ request: ({ fail }: any) => fail({ errMsg: 'private transport text' }) } as any, 'https://accounts.example.test');
  await expect(failing({ method: 'GET', path: '/auth/me' })).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  await expect(failing({ method: 'GET', path: '/auth/me' })).rejects.not.toThrow('private transport text');
});

test('socket task maps all events, replaces handlers without duplicating listeners and sends text frames', () => {
  const listeners: Record<string, (data?: any) => void> = {};
  const sent: string[] = []; let closes = 0;
  const task = {
    onOpen: (fn: any) => { listeners.open = fn; }, onMessage: (fn: any) => { listeners.message = fn; },
    onClose: (fn: any) => { listeners.close = fn; }, onError: (fn: any) => { listeners.error = fn; },
    send: ({ data }: any) => sent.push(data), close: () => { closes++; },
  };
  const socket = createWxSocket({ connectSocket: () => task } as any, 'wss://rooms.example.test');
  const events: string[] = [];
  const handlers = { onOpen: () => events.push('open'), onMessage: (data: string) => events.push(data), onClose: (code?: number) => events.push(`close:${code}`), onError: () => events.push('error') };
  listeners.open(); // An early event must reach the subsequently supplied handlers.
  socket.setHandlers(handlers); socket.setHandlers(handlers);
  listeners.message({ data: '{"type":"session.authenticated"}' }); listeners.error({ errMsg: 'ignored' });
  socket.send('hello'); socket.close(); socket.close(); listeners.close({ code: 4401, reason: 'closed' });
  listeners.message({ data: 'stale' });
  expect(events).toEqual(['open', '{"type":"session.authenticated"}', 'error', 'close:4401']);
  expect(sent).toEqual(['hello']); expect(closes).toBe(1);
});

test('keyboard focus updates only the current field, confirms once and releases subscriptions', () => {
  const events: Record<string, (event: any) => void> = {};
  const shown: any[] = []; const detached: string[] = [];
  const api: any = { showKeyboard: (options: any) => shown.push(options), hideKeyboard: () => {} };
  for (const name of ['Input', 'Confirm', 'Complete']) {
    api[`onKeyboard${name}`] = (fn: any) => { events[name] = fn; };
    api[`offKeyboard${name}`] = (fn: any) => { if (events[name] === fn) detached.push(name); };
  }
  const keyboard = createWxKeyboard(api);
  const values: string[] = []; let confirms = 0;
  keyboard.focus({ value: '', maxLength: 24, onInput: (value: string) => values.push(`old:${value}`) });
  keyboard.focus({ value: 'Player', onInput: (value: string) => values.push(value), onConfirm: () => { confirms++; } });
  events.Input({ value: 'Player1' }); events.Confirm({ value: 'Player1' }); events.Complete({ value: 'Player1' });
  events.Input({ value: 'late' });
  expect(values).toEqual(['Player1']); expect(confirms).toBe(1);
  expect(shown[1]).toMatchObject({ defaultValue: 'Player', multiple: false, confirmType: 'done' });
  keyboard.dispose(); keyboard.dispose(); expect(detached).toEqual(['Input', 'Confirm', 'Complete']);
});

test('feedback obeys disabled settings, tolerates unavailable capabilities and releases audio', () => {
  let played = 0; let vibrated = 0; let destroyed = 0; const shared: unknown[] = [];
  const feedback = createWxFeedback({
    createInnerAudioContext: () => ({ src: '', play: () => { played++; }, stop: () => {}, destroy: () => { destroyed++; }, onError: () => {} }),
    vibrateShort: () => { vibrated++; },
  } as any);
  feedback.play('audio/ring.mp3', false); feedback.vibrate(false);
  expect(played).toBe(0); expect(vibrated).toBe(0);
  feedback.play('audio/ring.mp3'); feedback.vibrate();
  expect(played).toBe(1); expect(vibrated).toBe(1);
  feedback.dispose(); feedback.dispose(); expect(destroyed).toBe(1);
  const absent = createWxFeedback({} as any);
  expect(() => { absent.play('audio/ring.mp3'); absent.vibrate(); absent.dispose(); }).not.toThrow();
  shareMiniGame({ shareAppMessage: (options: unknown) => shared.push(options) } as any, 'Join BellFive', 'room=ABC123');
  expect(shared).toEqual([{ title: 'Join BellFive', query: 'room=ABC123' }]);
});

test('runtime wx adapter normalizes safe-area insets, native logical touches and back key without leaking wx events', () => {
  const callbacks: Record<string, (event: any) => void> = {};
  const removed: string[] = [];
  const api: any = {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => ({}) }),
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 810, left: 0, right: 390 } }),
  };
  for (const name of ['TouchStart', 'TouchEnd', 'TouchCancel', 'WindowResize', 'Hide', 'Show', 'KeyDown']) {
    api[`on${name}`] = (fn: any) => { callbacks[name] = fn; };
    api[`off${name}`] = (fn: any) => { if (callbacks[name] === fn) removed.push(name); };
  }
  const platform = createWxRuntimePlatform(api, { requestFrame: () => 1, cancelFrame: () => {} });
  expect(platform.getViewport()).toEqual({ width: 390, height: 844, pixelRatio: 3, safeArea: { top: 44, bottom: 34, left: 0, right: 0 } });
  const touches: unknown[] = []; let back = 0;
  const stopTouch = platform.subscribe('touchend', event => touches.push(event));
  const stopBack = platform.subscribe('back', () => { back++; });
  callbacks.TouchEnd({ changedTouches: [{ identifier: 5, clientX: 195, clientY: 740 }], touches: [], timeStamp: 100 });
  callbacks.KeyDown({ key: 'a', code: 'KeyA' }); callbacks.KeyDown({ key: 'Escape', code: 'Escape' });
  expect(touches).toEqual([{ points: [{ identifier: 5, x: 195, y: 740 }], space: 'logical' }]);
  expect(back).toBe(1); stopTouch(); stopBack(); expect(removed).toEqual(['TouchEnd', 'KeyDown']);
});
