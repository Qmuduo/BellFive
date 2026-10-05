jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { login: jest.fn() },
}), { virtual: true });

const Taro = jest.requireMock('@tarojs/taro').default as { login: jest.Mock };
const { getWechatLoginCode } = require('../wechatLogin') as typeof import('../wechatLogin');

beforeEach(() => jest.clearAllMocks());

test('returns a fresh code from the Mini Program login API', async () => {
  Taro.login.mockResolvedValue({ code: 'fresh-mini-code' });
  await expect(getWechatLoginCode()).resolves.toBe('fresh-mini-code');
  expect(Taro.login).toHaveBeenCalledTimes(1);
});

test('rejects a missing WeChat code with a retryable typed error', async () => {
  Taro.login.mockResolvedValue({ errMsg: 'login:fail cancel' });
  await expect(getWechatLoginCode()).rejects.toMatchObject({ code: 'WECHAT_CODE_INVALID' });
});
