import type { PlayerId } from './game/types';

export const AVATAR_OPTIONS = ['banana', 'grape', 'pear', 'strawberry', 'peach', 'bell'] as const;

export type AvatarId = (typeof AVATAR_OPTIONS)[number];

export type PlayerProfile = Readonly<{
  nickname: string;
  avatarId: AvatarId;
}>;

export type PlayerProfileInput = Readonly<{
  nickname: string;
  avatarId: string;
}>;

export const DEFAULT_PLAYER_PROFILE: PlayerProfile = {
  nickname: '',
  avatarId: 'strawberry',
};

export function sanitizePlayerProfile(
  profile: PlayerProfileInput,
  playerId: PlayerId,
): PlayerProfile {
  const nickname = normalizeNickname(profile.nickname);
  const avatarId = isAvatarId(profile.avatarId) ? profile.avatarId : 'strawberry';
  return {
    nickname: nickname || `Player ${playerId}`,
    avatarId,
  };
}

export function isAvatarId(value: string): value is AvatarId {
  return AVATAR_OPTIONS.includes(value as AvatarId);
}

export function normalizeNickname(value: string): string {
  return Array.from(value.trim()).slice(0, 12).join('');
}
