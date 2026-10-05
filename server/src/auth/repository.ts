import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { PlayerProfile } from '../../../src/profile';
import { isSessionExpired } from './crypto';
import type { AuthUser, PasswordCredential, StoredAuthSession } from './types';

type UserRow = { id: string; username_normalized: string | null; nickname: string; avatar_id: PlayerProfile['avatarId']; wechat_linked: number };
const USER_SELECT = `SELECT u.id, p.username_normalized, u.nickname, u.avatar_id,
  EXISTS(SELECT 1 FROM wechat_identities w WHERE w.user_id = u.id) AS wechat_linked
  FROM users u LEFT JOIN password_credentials p ON p.user_id = u.id`;

export function normalizeUsername(username: string): string { return username.trim().toLowerCase(); }

export class AuthRepository {
  constructor(private readonly db: Database.Database) {}

  createPasswordUser(input: PasswordCredential & { username: string; profile: PlayerProfile }): AuthUser {
    return this.db.transaction(() => {
      const userId = this.insertUser(input.profile);
      this.addPasswordCredential(userId, input);
      return this.requireUser(userId);
    })();
  }

  createWechatUser(input: { appId: string; openid: string; profile: PlayerProfile }): AuthUser {
    return this.db.transaction(() => {
      const userId = this.insertUser(input.profile);
      this.attachWechatIdentity(userId, input.appId, input.openid);
      return this.requireUser(userId);
    })();
  }

  findById(userId: string): AuthUser | null {
    return this.readUser(`${USER_SELECT} WHERE u.id = ?`, userId);
  }

  findByUsername(username: string): AuthUser | null {
    return this.readUser(`${USER_SELECT} WHERE p.username_normalized = ?`, normalizeUsername(username));
  }

  findByWechatIdentity(appId: string, openid: string): AuthUser | null {
    return this.readUser(`${USER_SELECT} WHERE u.id = (SELECT user_id FROM wechat_identities WHERE app_id = ? AND openid = ?)`, appId, openid);
  }

  findPasswordCredential(userId: string): PasswordCredential | null {
    return this.db.prepare(`SELECT password_salt AS passwordSalt, password_digest AS passwordDigest
      FROM password_credentials WHERE user_id = ?`).get(userId) as PasswordCredential | undefined ?? null;
  }

  attachWechatIdentity(userId: string, appId: string, openid: string): void {
    this.db.prepare('INSERT INTO wechat_identities (user_id, app_id, openid) VALUES (?, ?, ?)').run(userId, appId, openid);
  }

  transferWechatIdentity(fromUserId: string, toUserId: string, appId: string, openid: string): void {
    if (fromUserId === toUserId) throw new Error('Identity transfer requires distinct users');
    this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE wechat_identities SET user_id = ?
        WHERE user_id = ? AND app_id = ? AND openid = ?`).run(toUserId, fromUserId, appId, openid);
      if (result.changes !== 1) throw new Error('WeChat identity does not belong to source user');
      this.revokeUserSessions(fromUserId);
    })();
  }

  addPasswordCredential(userId: string, input: PasswordCredential & { username: string }): void {
    this.db.prepare(`INSERT INTO password_credentials
      (user_id, username_normalized, password_salt, password_digest) VALUES (?, ?, ?, ?)`)
      .run(userId, normalizeUsername(input.username), input.passwordSalt, input.passwordDigest);
  }

  updatePasswordCredential(userId: string, passwordSalt: string, passwordDigest: string): void {
    const result = this.db.prepare(`UPDATE password_credentials SET password_salt = ?, password_digest = ?
      WHERE user_id = ?`).run(passwordSalt, passwordDigest, userId);
    if (result.changes !== 1) throw new Error('Password credential does not exist');
  }

  updateProfile(userId: string, profile: PlayerProfile): void {
    const result = this.db.prepare('UPDATE users SET nickname = ?, avatar_id = ? WHERE id = ?')
      .run(profile.nickname, profile.avatarId, userId);
    if (result.changes !== 1) throw new Error('User does not exist');
  }

  createSession(input: { userId: string; tokenHash: string; expiresAt: number }): void {
    this.db.prepare('INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(input.userId, input.tokenHash, input.expiresAt);
  }

  findSessionByTokenHash(tokenHash: string, now = Date.now()): StoredAuthSession | null {
    const row = this.db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(tokenHash) as
      { user_id: string; expires_at: number } | undefined;
    if (!row || isSessionExpired(row.expires_at, now)) return null;
    const user = this.findById(row.user_id);
    return user ? { user, expiresAt: row.expires_at } : null;
  }

  revokeSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  revokeUserSessions(userId: string): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  private insertUser(profile: PlayerProfile): string {
    const userId = randomUUID();
    this.db.prepare('INSERT INTO users (id, nickname, avatar_id) VALUES (?, ?, ?)')
      .run(userId, profile.nickname, profile.avatarId);
    return userId;
  }

  private requireUser(userId: string): AuthUser {
    const user = this.findById(userId);
    if (!user) throw new Error('User does not exist');
    return user;
  }

  private readUser(sql: string, ...parameters: string[]): AuthUser | null {
    const row = this.db.prepare(sql).get(...parameters) as UserRow | undefined;
    return row ? { userId: row.id, username: row.username_normalized,
      profile: { nickname: row.nickname, avatarId: row.avatar_id }, wechatLinked: row.wechat_linked === 1 } : null;
  }
}
