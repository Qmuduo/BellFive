import { randomBytes, randomUUID } from 'node:crypto';
import { hashSessionToken } from './crypto';
import { AuthRepository } from './repository';
import { AuthServiceError } from './types';
import type { GuardianMailer } from './mail';

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000;
const GRANT_TTL_MS = 30 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validPolicyVersion(value: string): boolean { return /^bellfive-privacy-v[0-9]{1,6}$/.test(value); }
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
function page(title: string, body: string): string {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="font:16px system-ui,sans-serif;max-width:38rem;margin:3rem auto;padding:0 1rem;color:#34214f"><h1>${title}</h1>${body}</body></html>`;
}

export class GuardianConsentService {
  private readonly requests = new Map<string, number[]>();
  constructor(private readonly repository: AuthRepository, private readonly mailer: GuardianMailer | null,
    private readonly publicBaseUrl: string, private readonly now: () => number = Date.now) {}

  isSameOrigin(origin: string): boolean {
    try { return new URL(this.publicBaseUrl).origin === origin; }
    catch { return false; }
  }

  pruneExpiredRateLimitEntries(now = this.now()): void {
    for (const [key, times] of this.requests) {
      const recent = times.filter(time => now - time < 60 * 60 * 1000);
      if (recent.length) this.requests.set(key, recent);
      else this.requests.delete(key);
    }
  }

  async requestConfirmation(emailInput: string, policyVersion: string, requesterAddress: string): Promise<void> {
    if (typeof emailInput !== 'string' || emailInput.length > 254 || !EMAIL_PATTERN.test(emailInput.trim())
      || !validPolicyVersion(policyVersion)) throw new AuthServiceError('INVALID_INPUT');
    const email = emailInput.trim().toLowerCase();
    this.enforceRateLimit(requesterAddress, email);
    let publicOrigin: string;
    try {
      const baseUrl = new URL(this.publicBaseUrl);
      if (!this.mailer || baseUrl.protocol !== 'https:' || baseUrl.pathname !== '/' || baseUrl.search || baseUrl.hash
        || baseUrl.username || baseUrl.password) throw new Error('Invalid public URL');
      publicOrigin = baseUrl.origin;
    } catch { throw new AuthServiceError('GUARDIAN_MAIL_UNAVAILABLE'); }
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = createdAt + REQUEST_TTL_MS;
    const id = randomUUID();
    this.repository.createGuardianRequest({ id, email, tokenHash: hashSessionToken(token), policyVersion,
      createdAt, expiresAt });
    const confirmationUrl = `${publicOrigin}/guardian/confirm?token=${encodeURIComponent(token)}`;
    try { await this.mailer.sendConfirmation({ email, confirmationUrl, expiresAt }); }
    catch {
      this.repository.deleteGuardianRequest(id);
      throw new AuthServiceError('GUARDIAN_MAIL_UNAVAILABLE');
    }
  }

  confirmationPage(token: string): string {
    const tokenHash = this.tokenHash(token);
    const request = this.repository.findGuardianRequest(tokenHash);
    if (!request) return page('链接无效', '<p>确认链接无效或已使用。请回到小游戏重新发送确认邮件。</p>');
    if (request.expiresAt <= this.now()) {
      this.repository.deleteGuardianRequestByTokenHash(tokenHash);
      return page('链接已过期', '<p>确认链接已过期。请回到小游戏重新发送确认邮件。</p>');
    }
    const safeToken = escapeHtml(token);
    return page('BellFive 监护人确认', `<p>此操作将允许未满 14 周岁的用户创建 BellFive 账号、使用个性化资料并参与在线游戏。该账号服务与 BellFive 的 Web、Expo 和 Taro 微信小程序等客户端共用；账号资料可能用于同一账号在这些客户端登录。确认后会生成一次性授权码，需由你交给该用户。</p><p>适用隐私规则版本：${escapeHtml(request.policyVersion)}。请确认你是该用户的监护人，并同意按此版本的隐私规则处理其账号、游戏资料和联机所需数据。</p><p>本次确认邮箱只用于验证监护人邮箱，确认成功后删除。BellFive 不收集出生日期。</p><form method="post" action="/guardian/confirm"><input type="hidden" name="token" value="${safeToken}"><label><input required type="checkbox" name="guardianAttested" value="yes"> 我是该用户的监护人，已阅读并同意以上说明</label><p><button type="submit">确认并生成一次性授权码</button></p></form>`);
  }

  confirm(token: string, guardianAttested: boolean): string {
    if (guardianAttested !== true) throw new AuthServiceError('INVALID_INPUT');
    const tokenHash = this.tokenHash(token);
    const grant = randomBytes(32).toString('base64url');
    const now = this.now();
    this.repository.consumeGuardianRequest(tokenHash, hashSessionToken(grant), now, now + GRANT_TTL_MS);
    return page('监护人确认已完成', `<p>请将以下一次性授权码交给小游戏使用者。它将在 30 分钟后过期，且只能使用一次。</p><p style="font:700 1.25rem ui-monospace,monospace;word-break:break-all;background:#f2edf8;padding:1rem;border-radius:.5rem">${escapeHtml(grant)}</p><p>请勿通过公开渠道分享。关闭本页后将无法再次查看此码。</p>`);
  }

  private tokenHash(token: string): string {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
      throw new AuthServiceError('GUARDIAN_CONFIRMATION_INVALID');
    }
    return hashSessionToken(token);
  }

  private enforceRateLimit(address: string, email: string): void {
    const now = this.now();
    this.pruneExpiredRateLimitEntries(now);
    const normalizedAddress = address.slice(0, 96) || 'unknown';
    const keys = [`ip:${hashSessionToken(normalizedAddress)}`, `email:${hashSessionToken(email)}`];
    if (this.requests.size >= 20_000 && keys.some(key => !this.requests.has(key))) {
      throw new AuthServiceError('GUARDIAN_MAIL_UNAVAILABLE');
    }
    for (const key of keys) {
      const recent = (this.requests.get(key) ?? []).filter(time => now - time < 60 * 60 * 1000);
      if (recent.length >= 3) throw new AuthServiceError('GUARDIAN_MAIL_UNAVAILABLE');
      recent.push(now);
      this.requests.set(key, recent);
    }
  }
}
