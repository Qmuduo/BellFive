import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GameClientError } from '../network/GameClient';
import type { OpenRoomSummary, ServerMessage } from '../network/protocol';
import type { PlayerProfile, PlayerProfileInput } from '../profile';
import { AVATAR_EMOJI, getPlayerDisplayName } from '../profile';
import { AvatarPicker } from './AvatarPicker';
import { LanguageSettings } from './LanguageSettings';
import { formatApplicationStatus, formatGameError } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

type RoomEntryProps = Readonly<{
  onCreate: (profile: PlayerProfileInput) => void;
  onJoin: (roomCode: string, profile: PlayerProfileInput) => void;
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
}: RoomEntryProps) {
  const { language, t } = useTranslation();
  const currentBusyLabel = busyLabel ?? t('entry.connecting');
  const [code, setCode] = useState('');
  const [showValidationError, setShowValidationError] = useState(false);
  const applicationPending = Boolean(applyingRoomCode) || applicationStatus?.status === 'pending';
  const roomActionsBusy = busy || !profileHydrated || applicationPending;

  const join = () => {
    const normalized = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(normalized)) {
      setShowValidationError(true);
      return;
    }
    setShowValidationError(false);
    onJoin(normalized, profile);
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
          placeholderTextColor="#9BA3AB"
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
        onPress={() => onCreate(profile)}
        style={({ pressed }) => [styles.createButton, pressed && styles.pressed, roomActionsBusy && styles.disabled]}
      >
        <Text style={styles.createText}>{busy ? currentBusyLabel : profileHydrated ? t('entry.createRoom') : t('entry.loadingProfile')}</Text>
      </Pressable>

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
                  onPress={() => { setShowValidationError(false); onJoin(room.roomCode, profile); }}
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
        placeholderTextColor="#9BA3AB"
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
  screen: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 25, paddingVertical: 20, backgroundColor: '#F6F5F1' },
  settingsRow: { alignItems: 'flex-end', marginBottom: 4 },
  brandMark: { alignSelf: 'center', width: 74, height: 74, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#F4CA42' },
  bell: { fontSize: 37 },
  eyebrow: { marginTop: 24, color: '#87909B', fontSize: 9, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  title: { marginTop: 4, color: '#202B37', fontSize: 38, fontWeight: '900', letterSpacing: -1, textAlign: 'center' },
  description: { maxWidth: 300, alignSelf: 'center', marginTop: 8, marginBottom: 28, color: '#75808B', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  profilePanel: { marginBottom: 18, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, borderWidth: 1, borderColor: '#E7E3D9', borderRadius: 18, backgroundColor: '#FFFFFF' },
  profileLabel: { marginBottom: 8, color: '#87909B', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  nicknameInput: { minHeight: 42, marginBottom: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: '#E4E6E8', borderRadius: 12, color: '#263340', fontSize: 14, fontWeight: '700' },
  createButton: { minHeight: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#F2C4CC' },
  createText: { color: '#633E45', fontSize: 16, fontWeight: '900' },
  roomsHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 21, marginBottom: 8 },
  roomsTitle: { color: '#87909B', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  refreshText: { color: '#647B9B', fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  emptyRooms: { padding: 13, borderRadius: 13, backgroundColor: '#FFFFFF', color: '#8A939B', fontSize: 11, textAlign: 'center' },
  roomList: { gap: 7 },
  roomRow: { minHeight: 53, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: '#FFFFFF' },
  roomAvatar: { width: 30, fontSize: 22, textAlign: 'center' },
  roomCopy: { flex: 1, marginLeft: 8 },
  roomName: { color: '#364451', fontSize: 11, fontWeight: '800' },
  roomHint: { marginTop: 2, color: '#929AA2', fontSize: 9 },
  requestButton: { minWidth: 51, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#E8EEFA' },
  requestText: { color: '#405776', fontSize: 9, fontWeight: '900' },
  applicationPanel: { alignItems: 'center', marginTop: 9, padding: 11, borderRadius: 13, backgroundColor: '#FBE6E3' },
  pendingPanel: { backgroundColor: '#FFF4D5' },
  applicationText: { color: '#78623C', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  cancelRequest: { paddingHorizontal: 10, paddingVertical: 8 },
  cancelRequestText: { color: '#8D6A2A', fontSize: 10, fontWeight: '900' },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 23 },
  rule: { flex: 1, height: 1, backgroundColor: '#E1E3E5' },
  or: { marginHorizontal: 12, color: '#929AA2', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  input: { minHeight: 56, paddingHorizontal: 16, borderWidth: 1.5, borderColor: '#DDE1E5', borderRadius: 16, backgroundColor: '#FFFFFF', color: '#263340', fontSize: 17, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  joinButton: { minHeight: 55, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderWidth: 1, borderColor: '#CCD5E4', borderRadius: 17, backgroundColor: '#E8EEFA' },
  joinText: { color: '#405776', fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  error: { marginTop: 14, color: '#B23A32', fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
