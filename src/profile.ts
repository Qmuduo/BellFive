import type { PlayerId } from './game/types';

export const AVATAR_OPTIONS = ['banana', 'grape', 'pear', 'strawberry', 'peach', 'bell'] as const;

export const AVATAR_EMOJI: Readonly<Record<(typeof AVATAR_OPTIONS)[number], string>> = {
  banana: '🍌',
  grape: '🍇',
  pear: '🍐',
  strawberry: '🍓',
  peach: '🍑',
  bell: '🔔',
};

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
  profile: unknown,
  playerId: PlayerId,
): PlayerProfile {
  const fields = isProfileRecord(profile) ? profile : {};
  const nickname = normalizeNickname(fields.nickname);
  const avatarId = typeof fields.avatarId === 'string' && isAvatarId(fields.avatarId)
    ? fields.avatarId
    : 'strawberry';
  return {
    nickname: nickname || `Player ${playerId}`,
    avatarId,
  };
}

export function isAvatarId(value: string): value is AvatarId {
  return AVATAR_OPTIONS.includes(value as AvatarId);
}

export function normalizeNickname(value: unknown): string {
  return typeof value === 'string' ? Array.from(value.trim()).slice(0, 12).join('') : '';
}

function isProfileRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getPlayerDisplayName(profile: PlayerProfile, playerId: PlayerId): string {
  return profile.nickname === `Player ${playerId}`
    ? profile.nickname
    : `${profile.nickname} · ${playerId}`;
}
