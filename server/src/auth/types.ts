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
