jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}), { virtual: true });

const Taro = jest.requireMock('@tarojs/taro').default as { request: jest.Mock };
const { createTaroAuthTransport } = require('../authTransport') as typeof import('../authTransport');
const { AuthClientError } = require('../../../../src/auth/contracts') as typeof import('../../../../src/auth/contracts');

beforeEach(() => jest.clearAllMocks());

test('sends shared AuthClient requests through Taro with bearer auth and JSON data', async () => {
  Taro.request.mockResolvedValue({ statusCode: 200, data: { token: 'session' } });
  const transport = createTaroAuthTransport('https://auth.example.test');

  await expect(transport({ method: 'POST', path: '/auth/wechat/link', token: 'mini-token', body: { code: 'wx-code' } }))
    .resolves.toEqual({ token: 'session' });

  expect(Taro.request).toHaveBeenCalledWith({
    url: 'https://auth.example.test/auth/wechat/link',
    method: 'POST',
    data: { code: 'wx-code' },
    header: { 'content-type': 'application/json', authorization: 'Bearer mini-token' },
  });
});

test('preserves structured server error codes for binding conflicts', async () => {
  Taro.request.mockResolvedValue({ statusCode: 409, data: { error: {
    code: 'WECHAT_IDENTITY_CONFLICT', message: 'That WeChat identity belongs to another account.',
  } } });
  const transport = createTaroAuthTransport('https://auth.example.test');

  await expect(transport({ method: 'POST', path: '/auth/wechat/link', body: {} }))
    .rejects.toMatchObject({ name: AuthClientError.name, code: 'WECHAT_IDENTITY_CONFLICT' });
});

test('turns Taro transport failures into a typed retryable network error', async () => {
  Taro.request.mockRejectedValue(new Error('offline'));
  const transport = createTaroAuthTransport('https://auth.example.test');

  await expect(transport({ method: 'GET', path: '/auth/me' }))
    .rejects.toMatchObject({ name: AuthClientError.name, code: 'NETWORK_ERROR' });
});
