import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { GameClientError } from '../network/GameClient';

const ROOM_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

type RoomEntryProps = Readonly<{
  onCreate: () => void;
  onJoin: (roomCode: string) => void;
  error: GameClientError | null;
  busy: boolean;
}>;

export function RoomEntry({ onCreate, onJoin, error, busy }: RoomEntryProps) {
  const [code, setCode] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const join = () => {
    const normalized = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(normalized)) {
      setValidationError('Enter a valid 6-character room code.');
      return;
    }
    setValidationError(null);
    onJoin(normalized);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.brandMark}><Text style={styles.bell}>🔔</Text></View>
      <Text style={styles.eyebrow}>TWO PHONES · ONE TABLE</Text>
      <Text style={styles.title}>BellFive</Text>
      <Text style={styles.description}>Create a private room or enter your friend's invite code.</Text>

      <Pressable
        role="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onCreate}
        style={({ pressed }) => [styles.createButton, pressed && styles.pressed, busy && styles.disabled]}
      >
        <Text style={styles.createText}>{busy ? 'CONNECTING…' : 'Create Room'}</Text>
      </Pressable>

      <View style={styles.divider}><View style={styles.rule} /><Text style={styles.or}>OR JOIN</Text><View style={styles.rule} /></View>

      <TextInput
        accessibilityLabel="Room code"
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
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
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={join}
        style={({ pressed }) => [styles.joinButton, pressed && styles.pressed, busy && styles.disabled]}
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
