import { AuthClientError } from '../../../src/auth/contracts';
import type { MiniGameWxApi } from './wxApi';

export function getWechatLoginCode(api: Pick<MiniGameWxApi, 'login'>): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = () => reject(new AuthClientError('WECHAT_CODE_INVALID', 'A fresh WeChat login code could not be obtained.'));
    try {
      api.login({ timeout: 10_000, success: result => typeof result.code === 'string' && result.code.trim() ? resolve(result.code) : fail(), fail });
    } catch { fail(); }
  });
}
