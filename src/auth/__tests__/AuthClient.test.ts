import { AuthClient } from '../AuthClient';
import type { AuthTransport } from '../contracts';

const user = {
  userId: 'user-1',
  username: 'kai',
  profile: { nickname: 'Kai', avatarId: 'pear' as const },
  wechatLinked: false,
};

describe('AuthClient', () => {
  it('maps username registration and login to the account endpoints', async () => {
    const requests: Parameters<AuthTransport>[0][] = [];
    const transport: AuthTransport = async request => {
      requests.push(request);
      return { token: 'session-token', expiresAt: 123, user };
    };
    const client = new AuthClient(transport);

    await client.register({ username: 'Kai', password: 'long-password', initialProfile: user.profile });
    await client.login({ username: 'kai', password: 'long-password' });

    expect(requests).toEqual([
      { method: 'POST', path: '/auth/register', body: { username: 'Kai', password: 'long-password', initialProfile: user.profile } },
      { method: 'POST', path: '/auth/login', body: { username: 'kai', password: 'long-password' } },
    ]);
  });

  it('uses bearer auth for account and profile operations', async () => {
    const requests: Parameters<AuthTransport>[0][] = [];
    const client = new AuthClient(async request => {
      requests.push(request);
      return user;
    });

    await client.me('session-token');
    await client.updateProfile('session-token', user.profile);
    await client.addCredentials('session-token', 'kai', 'long-password');
    await client.logout('session-token');

    expect(requests).toEqual([
      { method: 'GET', path: '/auth/me', token: 'session-token' },
      { method: 'PATCH', path: '/auth/me/profile', token: 'session-token', body: { profile: user.profile } },
      { method: 'POST', path: '/auth/credentials', token: 'session-token', body: { username: 'kai', password: 'long-password' } },
      { method: 'POST', path: '/auth/logout', token: 'session-token' },
    ]);
  });
});
