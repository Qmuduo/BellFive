import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GameClientError } from '../network/GameClient';
import type { PlayerProfile, PlayerProfileInput } from '../profile';
import { AvatarPicker } from './AvatarPicker';

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
}>;

export function RoomEntry({
  onCreate,
  onJoin,
  error,
  busy,
  profile,
  profileHydrated,
  onProfileChange,
  busyLabel = 'CONNECTING…',
}: RoomEntryProps) {
  const [code, setCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const roomActionsBusy = busy || !profileHydrated;

  const join = () => {
    const normalized = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(normalized)) {
      setValidationError('Enter a valid 6-character room code.');
      return;
    }
    setValidationError(null);
    onJoin(normalized, profile);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.brandMark}><Text style={styles.bell}>🔔</Text></View>
      <Text style={styles.eyebrow}>TWO PHONES · ONE TABLE</Text>
      <Text style={styles.title}>BellFive</Text>
      <Text style={styles.description}>Create a private room or enter your friend's invite code.</Text>

      <View style={styles.profilePanel}>
        <Text style={styles.profileLabel}>YOUR PROFILE</Text>
        <TextInput
          accessibilityLabel="Nickname"
          autoCapitalize="words"
          autoCorrect={false}
          editable={!roomActionsBusy}
          onChangeText={nickname => onProfileChange({ ...profile, nickname })}
          placeholder="YOUR NICKNAME"
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
        <Text style={styles.createText}>{busy ? busyLabel : profileHydrated ? 'Create Room' : 'LOADING PROFILE…'}</Text>
      </Pressable>

      <View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>OR JOIN</Text><View style={styles.rule} /></View>

      <TextInput
        accessibilityLabel="Room code"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!roomActionsBusy}
        maxLength={6}
        onChangeText={value => {
          setCode(value.replace(/\s/g, '').toUpperCase().slice(0, 6));
          setValidationError(null);
        }}
        placeholder="ENTER 6-CHARACTER CODE"
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
        <Text style={styles.joinText}>Join Room</Text>
      </Pressable>

      {validationError ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {validationError}
        </Text>
      ) : null}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error.message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 25, backgroundColor: '#F6F5F1' },
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
