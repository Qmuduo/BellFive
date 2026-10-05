/** @jest-environment node */
import { WechatCodeExchanger } from '../auth/wechat';

const oldAppId = process.env.BELLFIVE_WECHAT_MINI_APP_ID;
const oldSecret = process.env.BELLFIVE_WECHAT_MINI_APP_SECRET;
beforeEach(() => {
  process.env.BELLFIVE_WECHAT_MINI_APP_ID = 'app-id';
  process.env.BELLFIVE_WECHAT_MINI_APP_SECRET = 'server-only-secret';
});
afterEach(() => {
  if (oldAppId === undefined) delete process.env.BELLFIVE_WECHAT_MINI_APP_ID; else process.env.BELLFIVE_WECHAT_MINI_APP_ID = oldAppId;
  if (oldSecret === undefined) delete process.env.BELLFIVE_WECHAT_MINI_APP_SECRET; else process.env.BELLFIVE_WECHAT_MINI_APP_SECRET = oldSecret;
});
const fetchResponse = (payload: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(payload), { status })) as typeof fetch;

test('exchanges a code at the server endpoint and returns only app ID and openid', async () => {
  let requested: URL | undefined;
  const fetcher = (async (input: string | URL | Request) => {
    requested = new URL(String(input));
    return new Response(JSON.stringify({ openid: 'openid', session_key: 'secret-key', unionid: 'union-id' }));
  }) as typeof fetch;
  expect(await new WechatCodeExchanger(fetcher).exchange('code & spaces')).toEqual({ appId: 'app-id', openid: 'openid' });
  expect(requested?.origin + requested?.pathname).toBe('https://api.weixin.qq.com/sns/jscode2session');
  expect(Object.fromEntries(requested!.searchParams)).toEqual({ appid: 'app-id', secret: 'server-only-secret', js_code: 'code & spaces', grant_type: 'authorization_code' });
});
test.each(['BELLFIVE_WECHAT_MINI_APP_ID', 'BELLFIVE_WECHAT_MINI_APP_SECRET'])('requires server configuration %s', async name => {
  delete process.env[name];
  await expect(new WechatCodeExchanger(fetchResponse({ openid: 'openid' })).exchange('code')).rejects.toMatchObject({ code: 'WECHAT_NOT_CONFIGURED' });
});
test.each([{ errcode: 40029, errmsg: 'invalid code' }, { openid: '' }, {}, null, { openid: 123 }, { errcode: 40125, openid: 'openid' }])('maps invalid WeChat response %j to a safe error', async payload => {
  await expect(new WechatCodeExchanger(fetchResponse(payload)).exchange('code')).rejects.toMatchObject({ code: 'WECHAT_CODE_INVALID' });
});
test('maps HTTP, transport, and JSON failures without exposing secrets', async () => {
  const transport = (async () => { throw new Error('server-only-secret'); }) as typeof fetch;
  const malformed = (async () => new Response('not json')) as typeof fetch;
  for (const fetcher of [transport, malformed, fetchResponse({ openid: 'openid' }, 500)]) {
    await expect(new WechatCodeExchanger(fetcher).exchange('code')).rejects.toMatchObject({ code: 'WECHAT_CODE_INVALID' });
    await expect(new WechatCodeExchanger(fetcher).exchange('code')).rejects.not.toThrow('server-only-secret');
  }
});
test.each(['', '   '])('rejects empty codes before making a request', async code => {
  await expect(new WechatCodeExchanger(fetchResponse({ openid: 'openid' })).exchange(code)).rejects.toMatchObject({ code: 'WECHAT_CODE_INVALID' });
});
