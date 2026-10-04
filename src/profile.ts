import type { PlayerId } from './game/types';
import type { Language } from './i18n/types';
import { playerSeatLabel } from './i18n/translations';

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
  _playerId: PlayerId,
): PlayerProfile {
  const fields = isProfileRecord(profile) ? profile : {};
  const nickname = normalizeNickname(fields.nickname);
  const avatarId = typeof fields.avatarId === 'string' && isAvatarId(fields.avatarId)
    ? fields.avatarId
    : 'strawberry';
  return {
    // Keep the empty value as the marker for a seat's localized default label.
    // This also preserves a user-selected nickname such as "Player A".
    nickname,
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

export function getPlayerDisplayName(profile: PlayerProfile, playerId: PlayerId, language: Language = 'en'): string {
  const seatLabel = playerSeatLabel(playerId, language);
  return profile.nickname ? `${profile.nickname} · ${seatLabel}` : seatLabel;
}
