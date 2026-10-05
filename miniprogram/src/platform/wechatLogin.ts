import Taro from '@tarojs/taro';
import { AuthClientError } from '../../../src/auth/contracts';

export async function getWechatLoginCode(): Promise<string> {
  let result: Awaited<ReturnType<typeof Taro.login>>;
  try {
    result = await Taro.login();
  } catch {
    throw new AuthClientError('WECHAT_CODE_INVALID', 'WeChat login did not return a usable code.');
  }
  if (!result.code) {
    throw new AuthClientError('WECHAT_CODE_INVALID', 'WeChat login did not return a usable code.');
  }
  return result.code;
}
