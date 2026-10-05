import type { PlayerProfile } from '../../../src/profile';

export interface AuthPrincipal {
  userId: string;
  username: string | null;
  profile: PlayerProfile;
}

export interface AuthUser extends AuthPrincipal {
  wechatLinked: boolean;
}

export interface AuthSession {
  token: string;
  expiresAt: number;
  user: AuthUser;
}

export interface PasswordCredential {
  passwordSalt: string;
  passwordDigest: string;
}

export interface StoredAuthSession {
  expiresAt: number;
  user: AuthUser;
}

export type AuthErrorCode = 'USERNAME_TAKEN' | 'INVALID_CREDENTIALS' | 'INVALID_INPUT'
  | 'WECHAT_CODE_INVALID' | 'WECHAT_NOT_CONFIGURED' | 'WECHAT_IDENTITY_CONFLICT';

export class AuthServiceError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthServiceError';
  }
}

export interface RegisterInput { username: string; password: string; }
export interface BindWechatInput extends RegisterInput { code: string; confirmedTransfer: boolean; }
export interface WechatIdentity { appId: string; openid: string; }
