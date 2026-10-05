import { DEFAULT_PLAYER_PROFILE, sanitizePlayerProfile, type PlayerProfile } from '../../../src/profile';
import { generateSessionToken, hashPassword, hashSessionToken, sessionExpiresAt, verifyPassword } from './crypto';
import { AuthRepository, normalizeUsername } from './repository';
import { AuthServiceError, type AuthPrincipal, type AuthSession, type AuthUser, type BindWechatInput, type PasswordCredential, type RegisterInput } from './types';
import { WechatCodeExchanger } from './wechat';

function validatedUsername(username: string): string {
  if (typeof username !== 'string') throw new AuthServiceError('INVALID_INPUT');
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9_]{3,24}$/.test(normalized)) throw new AuthServiceError('INVALID_INPUT');
  return normalized;
}

function validatePassword(password: string): void {
  if (typeof password !== 'string') throw new AuthServiceError('INVALID_INPUT');
  const length = Array.from(password).length;
  if (length < 8 || length > 128) throw new AuthServiceError('INVALID_INPUT');
}

function isUniqueConstraint(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly exchanger: Pick<WechatCodeExchanger, 'exchange'> = new WechatCodeExchanger(),
  ) {}

  async register(input: RegisterInput, initialProfile: unknown): Promise<AuthSession> {
    const username = validatedUsername(input?.username);
    validatePassword(input?.password);
    if (this.repository.findByUsername(username)) throw new AuthServiceError('USERNAME_TAKEN');
    const credential = await hashPassword(input.password);
    try {
      const user = this.repository.createPasswordUser({ username, ...credential, profile: sanitizePlayerProfile(initialProfile, 'A') });
      return this.issueSession(user);
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AuthServiceError('USERNAME_TAKEN');
      throw error;
    }
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const verified = await this.verifyCredentials(username, password);
    this.requireCurrentCredential(verified.user.userId, verified.credential);
    return this.issueSession(this.requireUser(verified.user.userId));
  }

  async loginWithWechat(code: string): Promise<AuthSession> {
    const identity = await this.exchanger.exchange(code);
    const user = this.repository.findByWechatIdentity(identity.appId, identity.openid)
      ?? this.repository.createWechatUser({ ...identity, profile: DEFAULT_PLAYER_PROFILE });
    return this.issueSession(user);
  }

  async bindWechat(input: BindWechatInput): Promise<AuthSession> {
    const verified = await this.verifyCredentials(input?.username, input?.password);
    const { appId, openid } = await this.exchanger.exchange(input.code);
    const target = verified.user;
    this.requireCurrentCredential(target.userId, verified.credential);
    const owner = this.repository.findByWechatIdentity(appId, openid);
    if (owner && owner.userId !== target.userId && (owner.username !== null || input.confirmedTransfer !== true)) {
      throw new AuthServiceError('WECHAT_IDENTITY_CONFLICT');
    }
    try {
      if (!owner) this.repository.attachWechatIdentity(target.userId, appId, openid);
      else if (owner.userId !== target.userId) this.repository.transferWechatIdentity(owner.userId, target.userId, appId, openid);
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AuthServiceError('WECHAT_IDENTITY_CONFLICT');
      throw error;
    }
    return this.issueSession(this.requireUser(target.userId));
  }

  async addPasswordCredential(userId: string, usernameInput: string, password: string): Promise<AuthUser> {
    const username = validatedUsername(usernameInput);
    validatePassword(password);
    this.requireWechatOnlyUser(userId);
    if (this.repository.findByUsername(username)) throw new AuthServiceError('USERNAME_TAKEN');
    const credential = await hashPassword(password);
    // Hashing yields: recheck so concurrent additions cannot replace credentials.
    this.requireWechatOnlyUser(userId);
    try {
      this.repository.addPasswordCredential(userId, { username, ...credential });
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AuthServiceError('USERNAME_TAKEN');
      throw error;
    }
    return this.requireUser(userId);
  }

  async resetPasswordWithWechat(code: string, newPassword: string): Promise<AuthSession> {
    validatePassword(newPassword);
    const { appId, openid } = await this.exchanger.exchange(code);
    const owner = this.repository.findByWechatIdentity(appId, openid);
    if (!owner || owner.username === null) throw new AuthServiceError('INVALID_CREDENTIALS');
    const credential = await hashPassword(newPassword);
    if (this.repository.findByWechatIdentity(appId, openid)?.userId !== owner.userId) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }
    const { token, tokenHash } = generateSessionToken();
    const expiresAt = sessionExpiresAt();
    this.repository.resetPasswordAndSession(owner.userId, credential, { tokenHash, expiresAt });
    return { token, expiresAt, user: this.requireUser(owner.userId) };
  }

  async authenticateToken(token: string): Promise<AuthPrincipal | null> {
    if (typeof token !== 'string' || !token) return null;
    const session = this.repository.findSessionByTokenHash(hashSessionToken(token));
    if (!session) return null;
    const { userId, username, profile } = session.user;
    return { userId, username, profile };
  }

  async updateProfile(userId: string, profile: unknown): Promise<PlayerProfile> {
    this.requireUser(userId);
    const sanitized = sanitizePlayerProfile(profile, 'A');
    this.repository.updateProfile(userId, sanitized);
    return sanitized;
  }

  async logout(token: string): Promise<void> {
    if (typeof token === 'string' && token) this.repository.revokeSession(hashSessionToken(token));
  }

  private async verifyCredentials(username: string, password: string): Promise<{ user: AuthUser; credential: PasswordCredential }> {
    if (typeof username !== 'string' || typeof password !== 'string') throw new AuthServiceError('INVALID_CREDENTIALS');
    const user = this.repository.findByUsername(username);
    const credential = user && this.repository.findPasswordCredential(user.userId);
    if (!user || !credential || !await verifyPassword(password, credential)) throw new AuthServiceError('INVALID_CREDENTIALS');
    return { user, credential };
  }

  private requireCurrentCredential(userId: string, verified: PasswordCredential): void {
    const current = this.repository.findPasswordCredential(userId);
    if (!current || current.passwordSalt !== verified.passwordSalt || current.passwordDigest !== verified.passwordDigest) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }
  }

  private requireUser(userId: string): AuthUser {
    const user = this.repository.findById(userId);
    if (!user) throw new AuthServiceError('INVALID_INPUT');
    return user;
  }

  private requireWechatOnlyUser(userId: string): AuthUser {
    const user = this.requireUser(userId);
    if (!user.wechatLinked || user.username !== null) throw new AuthServiceError('INVALID_INPUT');
    return user;
  }

  private issueSession(user: AuthUser): AuthSession {
    const { token, tokenHash } = generateSessionToken();
    const expiresAt = sessionExpiresAt();
    this.repository.createSession({ userId: user.userId, tokenHash, expiresAt });
    return { token, expiresAt, user };
  }
}
