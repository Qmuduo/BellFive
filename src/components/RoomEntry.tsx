import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GameClientError } from '../network/GameClient';
import type { OpenRoomSummary, ServerMessage } from '../network/protocol';
import type { PlayerProfile } from '../profile';
import { AVATAR_EMOJI, getPlayerDisplayName } from '../profile';
import type { SinglePlayerDifficulty } from '../game/singlePlayerController';
import { AvatarPicker } from './AvatarPicker';
import { LanguageSettings } from './LanguageSettings';
import { formatApplicationStatus, formatGameError } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import { gameColors } from '../theme/gameColors';

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;
const SINGLE_PLAYER_DIFFICULTIES: readonly SinglePlayerDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABEL_KEYS: Readonly<Record<SinglePlayerDifficulty, TranslationKey>> = {
  easy: 'difficulty.easy',
  normal: 'difficulty.normal',
  hard: 'difficulty.hard',
};

type RoomEntryProps = Readonly<{
  onCreate: () => void;
  onJoin: (roomCode: string) => void;
  error: GameClientError | null;
  busy: boolean;
  profile: PlayerProfile;
  profileHydrated: boolean;
  onProfileChange: (profile: PlayerProfile) => void;
  busyLabel?: string;
  openRooms?: readonly OpenRoomSummary[];
  applyingRoomCode?: string | null;
  applicationStatus?: Extract<ServerMessage, { type: 'room.application.status' }> | null;
  onRefreshLobby?: () => void;
  onCancelApplication?: () => void;
  onStartSinglePlayer?: (difficulty: SinglePlayerDifficulty) => void;
}>;

export function RoomEntry({
  onCreate,
  onJoin,
  error,
  busy,
  profile,
  profileHydrated,
  onProfileChange,
  busyLabel,
  openRooms = [],
  applyingRoomCode = null,
  applicationStatus = null,
  onRefreshLobby = () => undefined,
  onCancelApplication = () => undefined,
  onStartSinglePlayer,
}: RoomEntryProps) {
  const { language, t } = useTranslation();
  const currentBusyLabel = busyLabel ?? t('entry.connecting');
  const [code, setCode] = useState('');
  const [showValidationError, setShowValidationError] = useState(false);
  const [showDifficulties, setShowDifficulties] = useState(false);
  const applicationPending = Boolean(applyingRoomCode) || applicationStatus?.status === 'pending';
  const roomActionsBusy = busy || !profileHydrated || applicationPending;

  const join = () => {
    const normalized = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(normalized)) {
      setShowValidationError(true);
      return;
    }
    setShowValidationError(false);
    onJoin(normalized);
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsRow}><LanguageSettings /></View>
      <View style={styles.brandMark}><Text style={styles.bell}>🔔</Text></View>
      <Text style={styles.eyebrow}>{t('entry.eyebrow')}</Text>
      <Text style={styles.title}>BellFive</Text>
      <Text style={styles.description}>{t('entry.description')}</Text>

      <View style={styles.profilePanel}>
        <Text style={styles.profileLabel}>{t('entry.profile')}</Text>
        <TextInput
          accessibilityLabel={t('entry.nickname')}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!roomActionsBusy}
          onChangeText={nickname => onProfileChange({ ...profile, nickname })}
          placeholder={t('entry.nicknamePlaceholder')}
          placeholderTextColor={gameColors.muted}
          style={styles.nicknameInput}
          value={profile.nickname}
        />
        <AvatarPicker
          selected={profile.avatarId}
          disabled={roomActionsBusy}
          onSelect={avatarId => onProfileChange({ ...profile, avatarId })}
        />
      </View>

      <Pressable
        role="button"
        accessibilityState={{ disabled: roomActionsBusy }}
        disabled={roomActionsBusy}
        onPress={() => onCreate()}
        style={({ pressed }) => [styles.createButton, pressed && styles.pressed, roomActionsBusy && styles.disabled]}
      >
        <Text style={styles.createText}>{busy ? currentBusyLabel : profileHydrated ? t('entry.createRoom') : t('entry.loadingProfile')}</Text>
      </Pressable>

      {onStartSinglePlayer ? (
        <View style={styles.soloPanel}>
          <Pressable
            role="button"
            accessibilityState={{ disabled: !profileHydrated, expanded: showDifficulties }}
            disabled={!profileHydrated}
            onPress={() => setShowDifficulties(value => !value)}
            style={({ pressed }) => [styles.soloButton, pressed && styles.pressed, !profileHydrated && styles.disabled]}
          >
            <Text style={styles.soloText}>{t('entry.singlePlayer')}</Text>
          </Pressable>
          {showDifficulties ? (
            <View style={styles.difficultyPanel}>
              <Text style={styles.difficultyHeading}>{t('entry.chooseDifficulty')}</Text>
              <View style={styles.difficultyRow}>
                {SINGLE_PLAYER_DIFFICULTIES.map(difficulty => (
                  <Pressable
                    key={difficulty}
                    role="button"
                    disabled={!profileHydrated}
                    onPress={() => onStartSinglePlayer?.(difficulty)}
                    style={({ pressed }) => [styles.difficultyButton, pressed && styles.pressed, !profileHydrated && styles.disabled]}
                  >
                    <Text style={styles.difficultyText}>{t(DIFFICULTY_LABEL_KEYS[difficulty])}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.roomsHeading}>
        <Text style={styles.roomsTitle}>{t('entry.openRooms')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t('entry.refreshRooms')} onPress={onRefreshLobby} hitSlop={8}>
          <Text style={styles.refreshText}>{t('entry.refresh')}</Text>
        </Pressable>
      </View>
      {openRooms.length === 0 ? (
        <Text style={styles.emptyRooms}>{t('entry.emptyRooms')}</Text>
      ) : (
        <View style={styles.roomList}>
          {openRooms.map(room => {
            const isApplying = applyingRoomCode === room.roomCode;
            return (
              <View key={room.roomCode} style={styles.roomRow}>
                <Text style={styles.roomAvatar}>{AVATAR_EMOJI[room.hostProfile.avatarId]}</Text>
                <View style={styles.roomCopy}>
                  <Text style={styles.roomName}>{getPlayerDisplayName(room.hostProfile, 'A', language)} · {room.roomCode}</Text>
                  <Text style={styles.roomHint}>{t('entry.waitingForPlayer')}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('entry.requestJoin', { roomCode: room.roomCode })}
                  disabled={roomActionsBusy || Boolean(applyingRoomCode)}
                  onPress={() => { setShowValidationError(false); onJoin(room.roomCode); }}
                  style={({ pressed }) => [styles.requestButton, pressed && styles.pressed, (roomActionsBusy || Boolean(applyingRoomCode)) && styles.disabled]}
                >
                  <Text style={styles.requestText}>{isApplying ? t('entry.sending') : t('entry.join')}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {applicationStatus ? (
        <View style={[styles.applicationPanel, applicationStatus.status === 'pending' && styles.pendingPanel]}>
          <Text accessibilityLiveRegion="polite" style={styles.applicationText}>{formatApplicationStatus(language, applicationStatus.status)}</Text>
          {applicationStatus.status === 'pending' ? (
            <Pressable accessibilityRole="button" onPress={onCancelApplication} style={styles.cancelRequest}>
              <Text style={styles.cancelRequestText}>{t('entry.cancelRequest')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>{t('entry.joinByCode')}</Text><View style={styles.rule} /></View>

      <TextInput
        accessibilityLabel={t('entry.roomCode')}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!roomActionsBusy}
        maxLength={6}
        onChangeText={value => {
          setCode(value.replace(/\s/g, '').toUpperCase().slice(0, 6));
          setShowValidationError(false);
        }}
        placeholder={t('entry.roomCodePlaceholder')}
        placeholderTextColor={gameColors.muted}
        style={styles.input}
        value={code}
      />
      <Pressable
        role="button"
        accessibilityState={{ disabled: roomActionsBusy }}
        disabled={roomActionsBusy}
        onPress={join}
        style={({ pressed }) => [styles.joinButton, pressed && styles.pressed, roomActionsBusy && styles.disabled]}
      >
        <Text style={styles.joinText}>{t('entry.joinRoom')}</Text>
      </Pressable>

      {showValidationError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {t('entry.invalidRoomCode')}
        </Text>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formatGameError(language, error.code)}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 25, paddingVertical: 20, backgroundColor: gameColors.canvas },
  settingsRow: { alignItems: 'flex-end', marginBottom: 4 },
  brandMark: { alignSelf: 'center', width: 74, height: 74, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: gameColors.lime },
  bell: { fontSize: 37 },
  eyebrow: { marginTop: 24, color: gameColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  title: { marginTop: 4, color: gameColors.plum, fontSize: 38, fontWeight: '900', letterSpacing: -1, textAlign: 'center' },
  description: { maxWidth: 300, alignSelf: 'center', marginTop: 8, marginBottom: 28, color: gameColors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  profilePanel: { marginBottom: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, borderWidth: 1, borderColor: gameColors.border, borderRadius: 18, backgroundColor: gameColors.surface },
  profileLabel: { marginBottom: 8, color: gameColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  nicknameInput: { minHeight: 42, marginBottom: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: gameColors.border, borderRadius: 12, color: gameColors.plum, fontSize: 14, fontWeight: '700' },
  createButton: { minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: gameColors.purple },
  createText: { color: gameColors.onDark, fontSize: 16, fontWeight: '900' },
  soloPanel: { marginTop: 10 },
  soloButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: gameColors.lime, borderRadius: 16, backgroundColor: gameColors.lime },
  soloText: { color: gameColors.plum, fontSize: 14, fontWeight: '900' },
  difficultyPanel: { marginTop: 9, padding: 11, borderRadius: 14, backgroundColor: gameColors.surface },
  difficultyHeading: { marginBottom: 9, color: gameColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center' },
  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: gameColors.lavenderSurface },
  difficultyText: { color: gameColors.ink, fontSize: 11, fontWeight: '900' },
  roomsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 21, marginBottom: 8 },
  roomsTitle: { color: gameColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  refreshText: { color: gameColors.purple, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  emptyRooms: { padding: 13, borderRadius: 13, backgroundColor: gameColors.surface, color: gameColors.muted, fontSize: 11, textAlign: 'center' },
  roomList: { gap: 7 },
  roomRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: gameColors.surface },
  roomAvatar: { width: 30, fontSize: 22, textAlign: 'center' },
  roomCopy: { flex: 1, marginLeft: 8 },
  roomName: { color: gameColors.plum, fontSize: 11, fontWeight: '800' },
  roomHint: { marginTop: 2, color: gameColors.muted, fontSize: 9 },
  requestButton: { minWidth: 51, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: gameColors.lavenderSurface },
  requestText: { color: gameColors.ink, fontSize: 9, fontWeight: '900' },
  applicationPanel: { alignItems: 'center', marginTop: 9, padding: 11, borderRadius: 13, backgroundColor: '#FBE6E3' },
  pendingPanel: { backgroundColor: '#FFF4D5' },
  applicationText: { color: '#78623C', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cancelRequest: { paddingHorizontal: 10, paddingVertical: 8 },
  cancelRequestText: { color: '#8D6A2A', fontSize: 10, fontWeight: '900' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 23 },
  rule: { flex: 1, height: 1, backgroundColor: gameColors.border },
  or: { marginHorizontal: 12, color: gameColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  input: { minHeight: 56, paddingHorizontal: 16, borderWidth: 1.5, borderColor: gameColors.border, borderRadius: 16, backgroundColor: gameColors.surface, color: gameColors.plum, fontSize: 17, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  joinButton: { minHeight: 55, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: gameColors.border, borderRadius: 17, backgroundColor: gameColors.lavenderSurface },
  joinText: { color: gameColors.ink, fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  error: { marginTop: 14, color: '#B23A32', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
