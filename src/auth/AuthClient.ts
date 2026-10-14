import type { PlayerProfileInput } from '../profile';
import type { AuthPrivacyMetadata, AuthSession, AuthTransport, AuthUser, RegistrationInput, WechatLinkInput } from './contracts';

export class AuthClient {
  constructor(private readonly transport: AuthTransport) {}

  register(input: RegistrationInput): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/register', body: input });
  }

  login(input: Readonly<{ username: string; password: string }> & AuthPrivacyMetadata): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/login', body: input });
  }

  wechatLogin(code: string, privacy?: AuthPrivacyMetadata): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/wechat/login', body: { code, ...privacy } });
  }

  linkWechat(token: string, input: WechatLinkInput): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/wechat/link', token, body: input });
  }

  addCredentials(token: string, username: string, password: string): Promise<AuthUser> {
    return this.send({ method: 'POST', path: '/auth/credentials', token, body: { username, password } });
  }

  me(token: string): Promise<AuthUser> {
    return this.send({ method: 'GET', path: '/auth/me', token });
  }

  updateProfile(token: string, profile: PlayerProfileInput): Promise<AuthUser> {
    return this.send({ method: 'PATCH', path: '/auth/me/profile', token, body: { profile } });
  }

  resetPasswordWithWechat(code: string, newPassword: string, privacy?: AuthPrivacyMetadata): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/password/reset/wechat', body: { code, newPassword, ...privacy } });
  }

  logout(token: string): Promise<void> {
    return this.send({ method: 'POST', path: '/auth/logout', token });
  }

  recordPrivacyConsent(token: string, privacyPolicyVersion: string): Promise<void> {
    return this.send({ method: 'POST', path: '/auth/me/privacy-consent', token, body: { privacyPolicyVersion } });
  }

  recordGuardianConsent(token: string, guardianGrant: string, privacyPolicyVersion: string): Promise<void> {
    return this.send({ method: 'POST', path: '/auth/me/guardian-consent', token, body: { guardianGrant, privacyPolicyVersion } });
  }

  deleteAccount(token: string, input: Readonly<{ password?: string; wechatCode?: string }>): Promise<void> {
    return this.send({ method: 'DELETE', path: '/auth/me', token, body: input });
  }

  private async send<T>(request: Parameters<AuthTransport>[0]): Promise<T> {
    return await this.transport(request) as T;
  }
}
