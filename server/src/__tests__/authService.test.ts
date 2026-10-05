/** @jest-environment node */
import { openAuthDatabase } from '../auth/database';
import { AuthRepository } from '../auth/repository';
import { AuthService } from '../auth/service';
import { WechatCodeExchanger } from '../auth/wechat';

let db: ReturnType<typeof openAuthDatabase>;
let repository: AuthRepository;
let service: AuthService;
const password = 'Password123';
const profile = { nickname: 'Target', avatarId: 'banana' };
beforeEach(() => {
  db = openAuthDatabase(':memory:');
  repository = new AuthRepository(db);
  process.env.BELLFIVE_WECHAT_MINI_APP_ID = 'test-app';
  process.env.BELLFIVE_WECHAT_MINI_APP_SECRET = 'test-secret';
  const fetcher = (async (input: string | URL | Request) => {
    const code = new URL(String(input)).searchParams.get('js_code');
    return new Response(JSON.stringify({ openid: code, session_key: 'private-session-key' }));
  }) as typeof fetch;
  service = new AuthService(repository, new WechatCodeExchanger(fetcher));
});
afterEach(() => { db.close(); delete process.env.BELLFIVE_WECHAT_MINI_APP_ID; delete process.env.BELLFIVE_WECHAT_MINI_APP_SECRET; });

test('registers normalized accounts with sanitized profile and authenticates opaque persisted sessions', async () => {
  const session = await service.register({ username: '  KAI_1 ', password }, { nickname: '  Hello  ', avatarId: 'bad' });
  expect(session.user).toMatchObject({ username: 'kai_1', profile: { nickname: 'Hello', avatarId: 'strawberry' }, wechatLinked: false });
  expect(await service.authenticateToken(session.token)).toEqual({ userId: session.user.userId, username: 'kai_1', profile: session.user.profile });
  expect(await service.authenticateToken('unknown')).toBeNull();
  const row = db.prepare('SELECT token_hash FROM sessions').get() as { token_hash: string };
  expect(row.token_hash).not.toBe(session.token);
  expect(session.expiresAt).toBeGreaterThan(Date.now());
  expect((await service.login(' KAI_1 ', password)).user.userId).toBe(session.user.userId);
});

test.each(['ab', 'a'.repeat(25), '用户abc', 'a-b', 'a b'])('rejects invalid username %s before creating records', async username => {
  await expect(service.register({ username, password }, profile)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 0 });
});

test.each(['😀'.repeat(7), 'a'.repeat(129)])('rejects password outside Unicode code point limits', async invalid => {
  await expect(service.register({ username: 'kai', password: invalid }, profile)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

test.each(['😀'.repeat(8), '😀'.repeat(128)])('accepts passwords at Unicode code point boundaries', async valid => {
  await service.register({ username: 'kai', password: valid }, profile);
  expect((await service.login('kai', valid)).user.username).toBe('kai');
});

test('rejects normalized username collisions without orphan users', async () => {
  await service.register({ username: 'kai', password }, profile);
  await expect(service.register({ username: ' KAI ', password }, profile)).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 1 });
});

test('missing usernames and wrong passwords share the credential error', async () => {
  await service.register({ username: 'kai', password }, profile);
  await expect(service.login('missing', password)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  await expect(service.login('kai', 'wrong-password')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
});

test('WeChat login automatically creates a default profile and reuses identity within its app', async () => {
  const first = await service.loginWithWechat('identity');
  expect(first.user).toMatchObject({ username: null, wechatLinked: true, profile: { nickname: '', avatarId: 'strawberry' } });
  expect((await service.loginWithWechat('identity')).user.userId).toBe(first.user.userId);
  process.env.BELLFIVE_WECHAT_MINI_APP_ID = 'other-app';
  expect((await service.loginWithWechat('identity')).user.userId).not.toBe(first.user.userId);
  expect(JSON.stringify(db.prepare('SELECT * FROM wechat_identities').all())).not.toContain('private-session-key');
});

test('binding verifies target credentials before attaching an unbound identity', async () => {
  const target = await service.register({ username: 'kai', password }, profile);
  await expect(service.bindWechat({ code: 'identity', username: 'kai', password: 'wrong', confirmedTransfer: false })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect(repository.findByWechatIdentity('test-app', 'identity')).toBeNull();
  const linked = await service.bindWechat({ code: 'identity', username: 'kai', password, confirmedTransfer: false });
  expect(linked.user).toMatchObject({ userId: target.user.userId, wechatLinked: true, profile });
  expect((await service.bindWechat({ code: 'identity', username: 'kai', password, confirmedTransfer: false })).user.userId).toBe(target.user.userId);
});

test('temporary identity transfer needs explicit confirmation and revokes its sessions while retaining target profile', async () => {
  const temporary = await service.loginWithWechat('identity');
  const target = await service.register({ username: 'kai', password }, profile);
  const input = { code: 'identity', username: 'kai', password, confirmedTransfer: false };
  await expect(service.bindWechat(input)).rejects.toMatchObject({ code: 'WECHAT_IDENTITY_CONFLICT' });
  expect(repository.findByWechatIdentity('test-app', 'identity')?.userId).toBe(temporary.user.userId);
  expect(await service.authenticateToken(temporary.token)).not.toBeNull();
  const transferred = await service.bindWechat({ ...input, confirmedTransfer: true });
  expect(transferred.user).toMatchObject({ userId: target.user.userId, profile, wechatLinked: true });
  expect(await service.authenticateToken(temporary.token)).toBeNull();
  expect(await service.authenticateToken(target.token)).not.toBeNull();
});

test('confirmed binding cannot steal an identity from an account with a username', async () => {
  const owner = await service.loginWithWechat('identity');
  await service.addPasswordCredential(owner.user.userId, 'owner', password);
  const target = await service.register({ username: 'target', password }, profile);
  await expect(service.bindWechat({ code: 'identity', username: 'target', password, confirmedTransfer: true })).rejects.toMatchObject({ code: 'WECHAT_IDENTITY_CONFLICT' });
  expect(repository.findByWechatIdentity('test-app', 'identity')?.userId).toBe(owner.user.userId);
  expect(repository.findById(target.user.userId)?.wechatLinked).toBe(false);
  expect(await service.authenticateToken(owner.token)).not.toBeNull();
});

test('target already linked to another identity rejects binding without overwriting either identity', async () => {
  const target = await service.register({ username: 'target', password }, profile);
  await service.bindWechat({ code: 'first', username: 'target', password, confirmedTransfer: false });
  const temporary = await service.loginWithWechat('second');
  await expect(service.bindWechat({ code: 'second', username: 'target', password, confirmedTransfer: true })).rejects.toMatchObject({ code: 'WECHAT_IDENTITY_CONFLICT' });
  expect(repository.findByWechatIdentity('test-app', 'first')?.userId).toBe(target.user.userId);
  expect(repository.findByWechatIdentity('test-app', 'second')?.userId).toBe(temporary.user.userId);
  expect(await service.authenticateToken(temporary.token)).not.toBeNull();
});

test('adds normalized password credentials to WeChat users without replacing existing credentials', async () => {
  const account = await service.loginWithWechat('identity');
  await service.register({ username: 'taken', password }, profile);
  await expect(service.addPasswordCredential(account.user.userId, ' TAKEN ', password)).rejects.toMatchObject({ code: 'USERNAME_TAKEN' });
  expect(repository.findPasswordCredential(account.user.userId)).toBeNull();
  expect(await service.addPasswordCredential(account.user.userId, ' NEW_USER ', password)).toMatchObject({ username: 'new_user', wechatLinked: true });
  await expect(service.addPasswordCredential(account.user.userId, 'replacement', password)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  expect((await service.login('new_user', password)).user.userId).toBe(account.user.userId);
  await expect(service.addPasswordCredential('missing', 'another', password)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

test('reset is available only for a linked password account and replaces password while revoking old sessions', async () => {
  await expect(service.resetPasswordWithWechat('unknown', 'NewPassword123')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  const account = await service.loginWithWechat('identity');
  await expect(service.resetPasswordWithWechat('identity', 'NewPassword123')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  await service.addPasswordCredential(account.user.userId, 'kai', password);
  const other = await service.register({ username: 'other', password }, profile);
  const reset = await service.resetPasswordWithWechat('identity', 'NewPassword123');
  expect(reset.user.userId).toBe(account.user.userId);
  await expect(service.login('kai', password)).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  expect((await service.login('kai', 'NewPassword123')).user.userId).toBe(account.user.userId);
  expect(await service.authenticateToken(account.token)).toBeNull();
  expect(await service.authenticateToken(reset.token)).not.toBeNull();
  expect(await service.authenticateToken(other.token)).not.toBeNull();
});

test('profile update sanitizes Unicode nickname and invalid avatar and is reflected by existing sessions', async () => {
  const session = await service.register({ username: 'kai', password }, profile);
  expect(await service.updateProfile(session.user.userId, { nickname: '  😀'.repeat(15), avatarId: 'invalid' })).toEqual({ nickname: '😀  😀  😀  😀  ', avatarId: 'strawberry' });
  expect((await service.authenticateToken(session.token))?.profile.avatarId).toBe('strawberry');
  await expect(service.updateProfile('missing', profile)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
});

test('logout revokes only the presented session and expired sessions fail authentication', async () => {
  const first = await service.register({ username: 'kai', password }, profile);
  const second = await service.login('kai', password);
  await service.logout(first.token);
  await service.logout(first.token);
  expect(await service.authenticateToken(first.token)).toBeNull();
  expect(await service.authenticateToken(second.token)).not.toBeNull();
  db.prepare('UPDATE sessions SET expires_at = ?').run(Date.now());
  expect(await service.authenticateToken(second.token)).toBeNull();
});
