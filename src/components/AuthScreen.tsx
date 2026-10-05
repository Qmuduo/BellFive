import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { PlayerProfileInput } from '../profile';
import { formatAuthError } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import { gameColors } from '../theme/gameColors';

type AuthMode = 'login' | 'register';

export type AuthScreenProps = Readonly<{
  initialProfile?: PlayerProfileInput;
  canRegister?: boolean;
  pending?: boolean;
  errorCode?: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  onClearError?: () => void;
  onBack?: () => void;
}>;

export function AuthScreen({
  initialProfile,
  canRegister = true,
  pending = false,
  errorCode = null,
  onLogin,
  onRegister,
  onClearError,
  onBack,
}: AuthScreenProps) {
  const { language, t } = useTranslation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [validationKey, setValidationKey] = useState<TranslationKey | null>(null);
  const isRegistering = mode === 'register';

  const submit = async () => {
    onClearError?.();
    setValidationKey(null);
    const normalizedUsername = username.trim();
    if (!/^[A-Za-z0-9_]{3,24}$/.test(normalizedUsername)) {
      setValidationKey('auth.validation.username');
      return;
    }
    const passwordLength = Array.from(password).length;
    if (passwordLength < 8 || passwordLength > 128) {
      setValidationKey('auth.validation.password');
      return;
    }
    if (isRegistering && password !== confirmPassword) {
      setValidationKey('auth.validation.confirmPassword');
      return;
    }
    try {
      if (isRegistering) await onRegister(normalizedUsername, password);
      else await onLogin(normalizedUsername, password);
    } catch {
      // The auth store keeps the server error code for localized display below.
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹ {t('auth.back')}</Text>
        </Pressable>
      ) : null}
      <View style={styles.brandMark}><Text style={styles.bell}>🔔</Text></View>
      <View accessibilityElementsHidden style={styles.fruitRow}>
        {['🍌', '🍇', '🍐', '🍓', '🍑'].map((fruit, index) => (
          <View key={fruit} style={[styles.fruitCard, index % 2 === 0 ? styles.fruitCardLifted : null]}>
            <Text style={styles.fruit}>{fruit}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.title}>{t('auth.title')}</Text>
      <Text style={styles.description}>{t('auth.description')}</Text>

      <View style={styles.form}>
        <Text style={styles.label}>{t('auth.username')}</Text>
        <TextInput
          accessibilityLabel={t('auth.username')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pending}
          maxLength={24}
          onChangeText={setUsername}
          onSubmitEditing={() => undefined}
          placeholder={t('auth.username')}
          style={styles.input}
          textContentType="username"
          value={username}
        />
        <Text style={styles.label}>{t('auth.password')}</Text>
        <TextInput
          accessibilityLabel={t('auth.password')}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!pending}
          onChangeText={setPassword}
          placeholder={t('auth.password')}
          secureTextEntry={!passwordVisible}
          style={styles.input}
          textContentType={isRegistering ? 'newPassword' : 'password'}
          value={password}
        />
        {isRegistering ? (
          <>
            <Text style={styles.label}>{t('auth.confirmPassword')}</Text>
            <TextInput
              accessibilityLabel={t('auth.confirmPassword')}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!pending}
              onChangeText={setConfirmPassword}
              placeholder={t('auth.confirmPassword')}
              secureTextEntry={!passwordVisible}
              style={styles.input}
              textContentType="newPassword"
              value={confirmPassword}
            />
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')}
          onPress={() => setPasswordVisible(value => !value)}
          style={styles.visibility}
        >
          <Text style={styles.visibilityText}>{passwordVisible ? t('auth.hidePassword') : t('auth.showPassword')}</Text>
        </Pressable>
        {validationKey ? <Text accessibilityLiveRegion="polite" style={styles.error}>{t(validationKey)}</Text> : null}
        {errorCode ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formatAuthError(language, errorCode)}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: pending }}
          disabled={pending}
          onPress={() => void submit()}
          style={({ pressed }) => [styles.submit, pressed && styles.pressed, pending && styles.disabled]}
        >
          <Text style={styles.submitText}>{pending ? '…' : t(isRegistering ? 'auth.register' : 'auth.login')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={pending || (!canRegister && !isRegistering)}
          onPress={() => {
            setMode(isRegistering ? 'login' : 'register');
            setValidationKey(null);
          }}
          style={styles.switchMode}
        >
          <Text style={styles.switchText}>{t(isRegistering ? 'auth.switchToLogin' : 'auth.switchToRegister')}</Text>
        </Pressable>
        {!canRegister ? <Text style={styles.profileHint}>{t('entry.loadingProfile')}</Text> : null}
      </View>
      {initialProfile?.nickname ? <Text style={styles.profileHint}>{initialProfile.nickname}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: gameColors.canvas },
  back: { position: 'absolute', top: 22, left: 20, zIndex: 1, padding: 9 },
  backText: { color: gameColors.purple, fontSize: 14, fontWeight: '800' },
  brandMark: { alignSelf: 'center', width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: gameColors.lime },
  bell: { fontSize: 31 },
  fruitRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, height: 33, marginTop: 10 },
  fruitCard: { width: 29, height: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: gameColors.border, borderRadius: 8, backgroundColor: gameColors.surface },
  fruitCardLifted: { transform: [{ translateY: -3 }, { rotate: '-4deg' }] },
  fruit: { fontSize: 15 },
  title: { marginTop: 19, color: gameColors.plum, fontSize: 27, fontWeight: '900', textAlign: 'center' },
  description: { alignSelf: 'center', maxWidth: 320, marginTop: 7, color: gameColors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  form: { width: '100%', maxWidth: 420, alignSelf: 'center', marginTop: 27, padding: 17, borderWidth: 1, borderColor: gameColors.border, borderRadius: 21, backgroundColor: gameColors.surface },
  label: { marginBottom: 6, color: gameColors.muted, fontSize: 11, fontWeight: '800' },
  input: { minHeight: 48, marginBottom: 14, paddingHorizontal: 13, borderWidth: 1, borderColor: gameColors.border, borderRadius: 13, color: gameColors.plum, fontSize: 15, backgroundColor: '#FFFDFC' },
  visibility: { alignSelf: 'flex-end', marginTop: -5, marginBottom: 13, padding: 5 },
  visibilityText: { color: gameColors.purple, fontSize: 11, fontWeight: '800' },
  error: { marginBottom: 11, color: '#B23A32', fontSize: 12, fontWeight: '700' },
  submit: { minHeight: 51, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: gameColors.purple },
  submitText: { color: gameColors.onDark, fontSize: 15, fontWeight: '900' },
  switchMode: { alignItems: 'center', paddingTop: 15, paddingBottom: 3 },
  switchText: { color: gameColors.ink, fontSize: 12, fontWeight: '700' },
  profileHint: { marginTop: 11, color: gameColors.muted, fontSize: 10, textAlign: 'center' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
