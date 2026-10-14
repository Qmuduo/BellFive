import type Database from 'better-sqlite3';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { PlayerProfile } from '../../../src/profile';
import { isSessionExpired } from './crypto';
import { AuthServiceError, type AuthUser, type PasswordCredential, type StoredAuthSession } from './types';

type UserRow = { id: string; username_normalized: string | null; nickname: string; avatar_id: PlayerProfile['avatarId']; wechat_linked: number };
const USER_SELECT = `SELECT u.id, p.username_normalized, u.nickname, u.avatar_id,
  EXISTS(SELECT 1 FROM wechat_identities w WHERE w.user_id = u.id) AS wechat_linked
  FROM users u LEFT JOIN password_credentials p ON p.user_id = u.id`;

export function normalizeUsername(username: string): string { return username.trim().toLowerCase(); }

export interface AuthPrivacyRecord {
  privacyPolicyVersion?: string;
  guardianGrantHash?: string;
  now?: number;
}

export interface GuardianRequestRecord {
  id: string;
  email: string;
  tokenHash: string;
  policyVersion: string;
  createdAt: number;
  expiresAt: number;
}

export class AuthRepository {
  constructor(private readonly db: Database.Database) {}

  createPasswordUser(input: PasswordCredential & { username: string; profile: PlayerProfile }): AuthUser {
    return this.db.transaction(() => {
      const userId = this.insertUser(input.profile);
      this.addPasswordCredential(userId, input);
      return this.requireUser(userId);
    })();
  }

  createPasswordUserWithPrivacy(input: PasswordCredential & { username: string; profile: PlayerProfile }, privacy: AuthPrivacyRecord): AuthUser {
    return this.db.transaction(() => {
      const consent = this.consumePrivacy(privacy);
      const userId = this.insertUser(input.profile, consent);
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

  createWechatUserWithPrivacy(input: { appId: string; openid: string; profile: PlayerProfile }, privacy: AuthPrivacyRecord): AuthUser {
    return this.db.transaction(() => {
      const consent = this.consumePrivacy(privacy);
      const userId = this.insertUser(input.profile, consent);
      this.attachWechatIdentity(userId, input.appId, input.openid);
      return this.requireUser(userId);
    })();
  }

  applyPrivacy(userId: string, privacy: AuthPrivacyRecord): void {
    this.db.transaction(() => {
      const consent = this.consumePrivacy(privacy);
      if (consent.guardianConsentVersion) {
        this.db.prepare(`UPDATE users SET privacy_policy_version = ?, privacy_consent_at = ?, is_minor = 1,
          guardian_consent_version = ?, guardian_consent_at = ? WHERE id = ?`)
          .run(consent.privacyPolicyVersion, consent.privacyConsentAt, consent.guardianConsentVersion, consent.guardianConsentAt, userId);
      } else if (consent.privacyPolicyVersion) {
        this.db.prepare('UPDATE users SET privacy_policy_version = ?, privacy_consent_at = ? WHERE id = ?')
          .run(consent.privacyPolicyVersion, consent.privacyConsentAt, userId);
      }
      if (!this.findById(userId)) throw new AuthServiceError('INVALID_INPUT');
    })();
  }

  recordGuardianConsent(userId: string, privacyPolicyVersion: string, guardianGrantHash: string, now = Date.now()): void {
    this.db.transaction(() => {
      const grant = this.consumeGuardianGrant(guardianGrantHash, privacyPolicyVersion, now);
      const result = this.db.prepare(`UPDATE users SET privacy_policy_version = ?, privacy_consent_at = ?, is_minor = 1,
        guardian_consent_version = ?, guardian_consent_at = ? WHERE id = ?`)
        .run(privacyPolicyVersion, now, grant.policy_version, grant.created_at, userId);
      if (result.changes !== 1) throw new AuthServiceError('INVALID_INPUT');
    })();
  }

  createGuardianRequest(input: GuardianRequestRecord): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM guardian_requests WHERE email = ?').run(input.email);
      this.db.prepare(`INSERT INTO guardian_requests (id, email, token_hash, policy_version, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?)`)
        .run(input.id, input.email, input.tokenHash, input.policyVersion, input.createdAt, input.expiresAt);
    })();
  }

  deleteGuardianRequest(id: string): void {
    this.db.prepare('DELETE FROM guardian_requests WHERE id = ?').run(id);
  }

  deleteGuardianRequestByTokenHash(tokenHash: string): void {
    this.db.prepare('DELETE FROM guardian_requests WHERE token_hash = ?').run(tokenHash);
  }

  findGuardianRequest(tokenHash: string): Omit<GuardianRequestRecord, 'tokenHash'> | null {
    const row = this.db.prepare(`SELECT id, email, policy_version AS policyVersion, created_at AS createdAt, expires_at AS expiresAt
      FROM guardian_requests WHERE token_hash = ?`).get(tokenHash) as Omit<GuardianRequestRecord, 'tokenHash'> | undefined;
    return row ?? null;
  }

  consumeGuardianRequest(tokenHash: string, grantHash: string, now: number, grantExpiresAt: number): void {
    const result = this.db.transaction(() => {
      const row = this.db.prepare('SELECT policy_version AS policyVersion, expires_at AS expiresAt FROM guardian_requests WHERE token_hash = ?')
        .get(tokenHash) as { policyVersion: string; expiresAt: number } | undefined;
      if (!row) return 'invalid' as const;
      if (row.expiresAt <= now) {
        this.db.prepare('DELETE FROM guardian_requests WHERE token_hash = ?').run(tokenHash);
        return 'expired' as const;
      }
      this.db.prepare('DELETE FROM guardian_requests WHERE token_hash = ?').run(tokenHash);
      this.db.prepare(`INSERT INTO guardian_grants (token_hash, policy_version, created_at, expires_at, consumed_at)
        VALUES (?, ?, ?, ?, NULL)`).run(grantHash, row.policyVersion, now, grantExpiresAt);
      return 'ok' as const;
    })();
    if (result === 'invalid') throw new AuthServiceError('GUARDIAN_CONFIRMATION_INVALID');
    if (result === 'expired') throw new AuthServiceError('GUARDIAN_CONFIRMATION_EXPIRED');
  }

  deleteExpiredSessions(now = Date.now()): number {
    return this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now).changes;
  }

  deleteExpiredGuardianRequests(now = Date.now()): number {
    return this.db.prepare('DELETE FROM guardian_requests WHERE expires_at <= ?').run(now).changes;
  }

  deleteExpiredGuardianGrants(now = Date.now()): number {
    return this.db.prepare('DELETE FROM guardian_grants WHERE expires_at <= ?').run(now).changes;
  }

  deleteUser(userId: string): boolean {
    return this.db.transaction(() => this.db.prepare('DELETE FROM users WHERE id = ?').run(userId).changes === 1)();
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

  resetPasswordAndSession(
    userId: string,
    credential: PasswordCredential,
    session: { tokenHash: string; expiresAt: number },
  ): void {
    this.db.transaction(() => {
      this.updatePasswordCredential(userId, credential.passwordSalt, credential.passwordDigest);
      this.revokeUserSessions(userId);
      this.createSession({ userId, ...session });
    })();
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

  private consumePrivacy(privacy: AuthPrivacyRecord): { privacyPolicyVersion: string | null; privacyConsentAt: number | null;
    guardianConsentVersion: string | null; guardianConsentAt: number | null } {
    const now = privacy.now ?? Date.now();
    if (!privacy.guardianGrantHash) return {
      privacyPolicyVersion: privacy.privacyPolicyVersion ?? null,
      privacyConsentAt: privacy.privacyPolicyVersion ? now : null,
      guardianConsentVersion: null,
      guardianConsentAt: null,
    };
    if (!privacy.privacyPolicyVersion) throw new AuthServiceError('GUARDIAN_GRANT_INVALID');
    const grant = this.consumeGuardianGrant(privacy.guardianGrantHash, privacy.privacyPolicyVersion, now);
    return { privacyPolicyVersion: privacy.privacyPolicyVersion, privacyConsentAt: now,
      guardianConsentVersion: grant.policy_version, guardianConsentAt: grant.created_at };
  }

  private consumeGuardianGrant(tokenHash: string, policyVersion: string, now: number): { policy_version: string; created_at: number } {
    const row = this.db.prepare('SELECT token_hash, policy_version, created_at, expires_at, consumed_at FROM guardian_grants WHERE token_hash = ?')
      .get(tokenHash) as { token_hash: string; policy_version: string; created_at: number; expires_at: number; consumed_at: number | null } | undefined;
    if (!row) throw new AuthServiceError('GUARDIAN_GRANT_INVALID');
    const suppliedDigest = Buffer.from(tokenHash, 'hex');
    const storedDigest = Buffer.from(row.token_hash, 'hex');
    if (suppliedDigest.length !== 32 || storedDigest.length !== 32 || !timingSafeEqual(suppliedDigest, storedDigest)) {
      throw new AuthServiceError('GUARDIAN_GRANT_INVALID');
    }
    if (row.expires_at <= now) throw new AuthServiceError('GUARDIAN_GRANT_EXPIRED');
    if (row.consumed_at !== null) throw new AuthServiceError('GUARDIAN_GRANT_USED');
    if (row.policy_version !== policyVersion) throw new AuthServiceError('GUARDIAN_GRANT_INVALID');
    const result = this.db.prepare('UPDATE guardian_grants SET consumed_at = ? WHERE token_hash = ? AND consumed_at IS NULL')
      .run(now, tokenHash);
    if (result.changes !== 1) throw new AuthServiceError('GUARDIAN_GRANT_USED');
    return row;
  }

  private insertUser(profile: PlayerProfile, consent?: { privacyPolicyVersion: string | null; privacyConsentAt: number | null;
    guardianConsentVersion: string | null; guardianConsentAt: number | null }): string {
    const userId = randomUUID();
    this.db.prepare(`INSERT INTO users (id, nickname, avatar_id, privacy_policy_version, privacy_consent_at, is_minor,
      guardian_consent_version, guardian_consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, profile.nickname, profile.avatarId, consent?.privacyPolicyVersion ?? null,
        consent?.privacyConsentAt ?? null, consent?.guardianConsentVersion ? 1 : 0,
        consent?.guardianConsentVersion ?? null, consent?.guardianConsentAt ?? null);
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
