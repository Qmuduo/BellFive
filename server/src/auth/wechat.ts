import { AuthServiceError, type WechatIdentity } from './types';

export class WechatCodeExchanger {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async exchange(code: string): Promise<WechatIdentity> {
    if (typeof code !== 'string' || !code.trim()) throw new AuthServiceError('WECHAT_CODE_INVALID');
    const appId = process.env.BELLFIVE_WECHAT_MINI_APP_ID;
    const secret = process.env.BELLFIVE_WECHAT_MINI_APP_SECRET;
    if (!appId?.trim() || !secret?.trim()) throw new AuthServiceError('WECHAT_NOT_CONFIGURED');
    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.search = new URLSearchParams({ appid: appId, secret, js_code: code, grant_type: 'authorization_code' }).toString();
    try {
      const response = await this.fetcher(url);
      if (!response.ok) throw new Error();
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error();
      const fields = payload as Record<string, unknown>;
      if ((fields.errcode !== undefined && fields.errcode !== 0)
        || typeof fields.openid !== 'string' || !fields.openid.trim()) throw new Error();
      return { appId, openid: fields.openid };
    } catch {
      // Do not surface transport errors or provider fields containing secrets.
      throw new AuthServiceError('WECHAT_CODE_INVALID');
    }
  }
}
