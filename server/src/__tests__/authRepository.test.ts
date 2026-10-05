/** @jest-environment node */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAuthDatabase } from '../auth/database';
import { AuthRepository } from '../auth/repository';
import { hashPassword, verifyPassword, generateSessionToken, hashSessionToken, sessionExpiresAt } from '../auth/crypto';

const profile = { nickname: 'Kai', avatarId: 'banana' as const };
const credential = { passwordSalt: 'salt', passwordDigest: 'digest' };
let directory: string;
let db: ReturnType<typeof openAuthDatabase>;
let repository: AuthRepository;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'bellfive-auth-'));
  db = openAuthDatabase(join(directory, 'nested', 'auth.sqlite'));
  repository = new AuthRepository(db);
});
afterEach(() => { db?.close(); rmSync(directory, { recursive: true, force: true }); });

test('persists normalized password accounts across database reopen', () => {
  const user = repository.createPasswordUser({ username: '  Kai  ', profile, ...credential });
  db.close();
  db = openAuthDatabase(join(directory, 'nested', 'auth.sqlite'));
  repository = new AuthRepository(db);
  expect(repository.findByUsername('KAI')).toEqual({ userId: user.userId, username: 'kai', profile, wechatLinked: false });
  expect(repository.findPasswordCredential(user.userId)).toEqual(credential);
  expect(repository.findById('missing')).toBeNull();
});

test('duplicate username leaves no orphan user', () => {
  repository.createPasswordUser({ username: 'Kai', profile, ...credential });
  expect(() => repository.createPasswordUser({ username: 'KAI', profile, ...credential })).toThrow();
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 1 });
});

test('creates WeChat-only accounts and refuses identity overwrite', () => {
  const user = repository.createWechatUser({ appId: 'app', openid: 'openid', profile });
  expect(user.username).toBeNull();
  expect(user.wechatLinked).toBe(true);
  expect(repository.findPasswordCredential(user.userId)).toBeNull();
  expect(repository.findByWechatIdentity('app', 'openid')).toEqual(user);
  expect(repository.findByWechatIdentity('other-app', 'openid')).toBeNull();
  expect(() => repository.createWechatUser({ appId: 'app', openid: 'openid', profile })).toThrow();
  expect(db.prepare('SELECT COUNT(*) AS count FROM users').get()).toEqual({ count: 1 });
  const other = repository.createPasswordUser({ username: 'other', profile, ...credential });
  expect(() => repository.attachWechatIdentity(other.userId, 'app', 'openid')).toThrow();
  expect(repository.findByWechatIdentity('app', 'openid')?.userId).toBe(user.userId);
});

test('attaches identity and adds a password to a WeChat account', () => {
  const user = repository.createWechatUser({ appId: 'app', openid: 'openid', profile });
  repository.addPasswordCredential(user.userId, { username: ' Kai ', ...credential });
  expect(repository.findByUsername('kai')?.userId).toBe(user.userId);
  expect(() => repository.addPasswordCredential(user.userId, { username: 'replacement', ...credential })).toThrow();
  expect(repository.findByUsername('replacement')).toBeNull();
  const other = repository.createPasswordUser({ username: 'other', profile, ...credential });
  repository.attachWechatIdentity(other.userId, 'app', 'other-openid');
  expect(repository.findById(other.userId)?.wechatLinked).toBe(true);
});

test('transfers an identity and revokes only the temporary account sessions', () => {
  const temporary = repository.createWechatUser({ appId: 'app', openid: 'openid', profile });
  const target = repository.createPasswordUser({ username: 'kai', profile, ...credential });
  repository.createSession({ userId: temporary.userId, tokenHash: 'temp', expiresAt: 100 });
  repository.createSession({ userId: target.userId, tokenHash: 'target', expiresAt: 100 });
  repository.transferWechatIdentity(temporary.userId, target.userId, 'app', 'openid');
  expect(repository.findByWechatIdentity('app', 'openid')?.userId).toBe(target.userId);
  expect(repository.findSessionByTokenHash('temp', 50)).toBeNull();
  expect(repository.findSessionByTokenHash('target', 50)?.user.userId).toBe(target.userId);
  expect(repository.findById(temporary.userId)?.wechatLinked).toBe(false);
});

test('updates an existing password without changing its username or creating a credential', () => {
  const user = repository.createPasswordUser({ username: 'kai', profile, ...credential });
  repository.updatePasswordCredential(user.userId, 'new-salt', 'new-digest');
  expect(repository.findPasswordCredential(user.userId)).toEqual({ passwordSalt: 'new-salt', passwordDigest: 'new-digest' });
  expect(repository.findByUsername('kai')?.userId).toBe(user.userId);
  const wechat = repository.createWechatUser({ appId: 'app', openid: 'openid', profile });
  expect(() => repository.updatePasswordCredential(wechat.userId, 'salt', 'digest')).toThrow();
  expect(repository.findPasswordCredential(wechat.userId)).toBeNull();
});

test('failed identity transfer rolls back identity and preserves sessions', () => {
  const temporary = repository.createWechatUser({ appId: 'app', openid: 'openid', profile });
  repository.createSession({ userId: temporary.userId, tokenHash: 'temp', expiresAt: 100 });
  expect(() => repository.transferWechatIdentity(temporary.userId, 'missing', 'app', 'openid')).toThrow();
  expect(repository.findByWechatIdentity('app', 'openid')?.userId).toBe(temporary.userId);
  expect(repository.findSessionByTokenHash('temp', 50)).not.toBeNull();
  expect(() => repository.transferWechatIdentity('wrong-owner', temporary.userId, 'app', 'openid')).toThrow();
});

test('session lookups enforce expiry boundary, profile updates and revocation', () => {
  const user = repository.createPasswordUser({ username: 'kai', profile, ...credential });
  repository.createSession({ userId: user.userId, tokenHash: 'one', expiresAt: 100 });
  repository.createSession({ userId: user.userId, tokenHash: 'two', expiresAt: 200 });
  expect(repository.findSessionByTokenHash('one', 99)?.user.userId).toBe(user.userId);
  expect(repository.findSessionByTokenHash('one', 100)).toBeNull();
  repository.updateProfile(user.userId, { nickname: 'New', avatarId: 'bell' });
  expect(repository.findSessionByTokenHash('two', 100)?.user.profile).toEqual({ nickname: 'New', avatarId: 'bell' });
  repository.revokeSession('one');
  expect(repository.findSessionByTokenHash('one', 0)).toBeNull();
  repository.revokeUserSessions(user.userId);
  expect(repository.findSessionByTokenHash('two', 0)).toBeNull();
});

test('password hashing uses fresh salts and rejects wrong or malformed digests', async () => {
  const first = await hashPassword('Secret password');
  const second = await hashPassword('Secret password');
  expect(first.passwordSalt).not.toBe(second.passwordSalt);
  expect(first.passwordDigest).not.toBe(second.passwordDigest);
  expect(await verifyPassword('Secret password', first)).toBe(true);
  expect(await verifyPassword('wrong', first)).toBe(false);
  expect(await verifyPassword('Secret password', { ...first, passwordDigest: 'bad' })).toBe(false);
});

test('issues opaque tokens and hashes them without persisting the raw token', () => {
  const first = generateSessionToken();
  expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(first.tokenHash).toHaveLength(64);
  expect(first.token).not.toBe(generateSessionToken().token);
  expect(hashSessionToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  expect(sessionExpiresAt(1000)).toBe(2592001000);
  const user = repository.createPasswordUser({ username: 'kai', profile, ...credential });
  repository.createSession({ userId: user.userId, tokenHash: first.tokenHash, expiresAt: 100 });
  expect(repository.findSessionByTokenHash(first.token, 0)).toBeNull();
  expect(repository.findSessionByTokenHash(first.tokenHash, 0)).not.toBeNull();
});
