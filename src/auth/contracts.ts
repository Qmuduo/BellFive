import type { PlayerProfile, PlayerProfileInput } from '../profile';

export type AuthUser = Readonly<{
  userId: string;
  username: string | null;
  profile: PlayerProfile;
  wechatLinked: boolean;
}>;

export type AuthSession = Readonly<{
  token: string;
  expiresAt: number;
  user: AuthUser;
}>;

export type AuthTransportRequest = Readonly<{
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  token?: string;
  body?: unknown;
}>;

export type AuthTransport = (request: AuthTransportRequest) => Promise<unknown>;

export class AuthClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AuthClientError';
  }
}

export type RegistrationInput = Readonly<{
  username: string;
  password: string;
  initialProfile?: PlayerProfileInput;
  privacyPolicyVersion?: string;
  guardianGrant?: string;
}>;

export type AuthPrivacyMetadata = Readonly<{
  privacyPolicyVersion?: string;
  guardianGrant?: string;
}>;

export type WechatLinkInput = Readonly<{
  code: string;
  username: string;
  password: string;
  confirmedTransfer: boolean;
  privacyPolicyVersion?: string;
  guardianGrant?: string;
}>;
