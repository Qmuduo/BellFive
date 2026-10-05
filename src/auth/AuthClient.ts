import type { PlayerProfileInput } from '../profile';
import type { AuthSession, AuthTransport, AuthUser, RegistrationInput, WechatLinkInput } from './contracts';

export class AuthClient {
  constructor(private readonly transport: AuthTransport) {}

  register(input: RegistrationInput): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/register', body: input });
  }

  login(input: Readonly<{ username: string; password: string }>): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/login', body: input });
  }

  wechatLogin(code: string): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/wechat/login', body: { code } });
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

  resetPasswordWithWechat(code: string, newPassword: string): Promise<AuthSession> {
    return this.send({ method: 'POST', path: '/auth/password/reset/wechat', body: { code, newPassword } });
  }

  logout(token: string): Promise<void> {
    return this.send({ method: 'POST', path: '/auth/logout', token });
  }

  private async send<T>(request: Parameters<AuthTransport>[0]): Promise<T> {
    return await this.transport(request) as T;
  }
}
