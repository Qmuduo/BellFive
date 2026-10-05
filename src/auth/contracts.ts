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
  method: 'GET' | 'POST' | 'PATCH';
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
}>;

export type WechatLinkInput = Readonly<{
  code: string;
  username: string;
  password: string;
  confirmedTransfer: boolean;
}>;
