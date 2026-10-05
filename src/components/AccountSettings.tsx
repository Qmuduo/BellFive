import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { sanitizePlayerProfile } from '../profile';
import type { PlayerProfileInput } from '../profile';
import type { AuthUser } from '../auth/contracts';
import { formatAuthError } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import { AvatarPicker } from './AvatarPicker';
import { gameColors } from '../theme/gameColors';

export type AccountSettingsProps = Readonly<{
  user: AuthUser | null;
  profile: PlayerProfileInput;
  pending?: boolean;
  errorCode?: string | null;
  onSaveProfile: (profile: PlayerProfileInput) => Promise<void> | void;
  onAddCredentials?: (username: string, password: string) => Promise<void>;
  onLogin?: () => void;
  onLogout?: () => Promise<void> | void;
  onBack?: () => void;
}>;

export function AccountSettings({
  user,
  profile,
  pending = false,
  errorCode = null,
  onSaveProfile,
  onAddCredentials,
  onLogin,
  onLogout,
  onBack,
}: AccountSettingsProps) {
  const { language, t } = useTranslation();
  const displayedProfile = user?.profile ?? sanitizePlayerProfile(profile, 'A');
  const [nickname, setNickname] = useState(displayedProfile.nickname);
  const [avatarId, setAvatarId] = useState(displayedProfile.avatarId);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [credentialsAdded, setCredentialsAdded] = useState(false);

  useEffect(() => {
    setNickname(displayedProfile.nickname);
    setAvatarId(displayedProfile.avatarId);
  }, [displayedProfile.nickname, displayedProfile.avatarId]);

  const saveProfile = async () => {
    setSaved(false);
    try {
      await onSaveProfile({ nickname, avatarId });
      setSaved(true);
    } catch {
      // The parent auth store exposes the localized error code.
    }
  };

  const addCredentials = async () => {
    setValidationError(null);
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username.trim())) {
      setValidationError(t('auth.validation.username'));
      return;
    }
    const length = Array.from(password).length;
    if (length < 8 || length > 128) {
      setValidationError(t('auth.validation.password'));
      return;
    }
    if (password !== confirmPassword) {
      setValidationError(t('auth.validation.confirmPassword'));
      return;
    }
    try {
      await onAddCredentials?.(username.trim(), password);
      setCredentialsAdded(true);
    } catch {
      // The parent auth store exposes the localized error code.
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {onBack ? (
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹ {t('account.back')}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.eyebrow}>{t(user ? 'account.title' : 'account.guest')}</Text>
      {user ? (
        <View style={styles.accountCard}>
          <Text style={styles.metaLabel}>{t('account.usernameLabel')}</Text>
          <Text style={styles.username}>{user.username ?? t('account.wechatOnly')}</Text>
          <View style={[styles.badge, user.wechatLinked ? styles.linked : styles.unlinked]}>
            <Text style={styles.badgeText}>{t(user.wechatLinked ? 'account.wechatLinked' : 'account.wechatNotLinked')}</Text>
          </View>
        </View>
      ) : (
        <Text style={styles.guestDescription}>{t('account.guestDescription')}</Text>
      )}

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{t('account.profile')}</Text>
        <Text style={styles.label}>{t('account.nickname')}</Text>
        <TextInput
          accessibilityLabel={t('account.nickname')}
          autoCapitalize="words"
          editable={!pending}
          maxLength={12}
          onChangeText={setNickname}
          style={styles.input}
          value={nickname}
        />
        <Text style={styles.label}>{t('account.avatar')}</Text>
        <AvatarPicker selected={avatarId} disabled={pending} onSelect={setAvatarId} />
        <Pressable
          accessibilityRole="button"
          disabled={pending}
          onPress={() => void saveProfile()}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, pending && styles.disabled]}
        >
          <Text style={styles.primaryText}>{pending ? '…' : t('account.saveProfile')}</Text>
        </Pressable>
        {saved ? <Text accessibilityLiveRegion="polite" style={styles.success}>{t('account.profileSaved')}</Text> : null}
      </View>

      {user && user.username === null && user.wechatLinked ? (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>{t('account.credentials')}</Text>
          <Text style={styles.helper}>{t('account.credentialsDescription')}</Text>
          <TextInput
            accessibilityLabel={t('auth.username')}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            maxLength={24}
            onChangeText={setUsername}
            placeholder={t('auth.username')}
            style={styles.input}
            value={username}
          />
          <TextInput
            accessibilityLabel={t('auth.password')}
            autoCapitalize="none"
            editable={!pending}
            onChangeText={setPassword}
            placeholder={t('auth.password')}
            secureTextEntry
            style={styles.input}
            value={password}
          />
          <TextInput
            accessibilityLabel={t('auth.confirmPassword')}
            autoCapitalize="none"
            editable={!pending}
            onChangeText={setConfirmPassword}
            placeholder={t('auth.confirmPassword')}
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
          />
          {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={pending}
            onPress={() => void addCredentials()}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, pending && styles.disabled]}
          >
            <Text style={styles.primaryText}>{t('account.addCredentials')}</Text>
          </Pressable>
          {credentialsAdded ? <Text style={styles.success}>{t('account.credentialsSaved')}</Text> : null}
        </View>
      ) : null}

      {user ? (
        <View style={styles.recoveryPanel}>
          <Text style={styles.sectionTitle}>{t('account.recovery')}</Text>
          <Text style={styles.helper}>{t(user.wechatLinked ? 'account.recoveryLinked' : 'account.recoveryUnlinked')}</Text>
        </View>
      ) : null}

      {errorCode ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formatAuthError(language, errorCode)}</Text> : null}
      {!user && onLogin ? (
        <Pressable accessibilityRole="button" onPress={onLogin} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{t('account.signIn')}</Text>
        </Pressable>
      ) : null}
      {user && onLogout ? (
        <Pressable accessibilityRole="button" disabled={pending} onPress={() => void onLogout()} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>{t('account.signOut')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 62, paddingBottom: 30, backgroundColor: gameColors.canvas },
  back: { position: 'absolute', top: 15, left: 13, padding: 9 },
  backText: { color: gameColors.purple, fontSize: 13, fontWeight: '800' },
  eyebrow: { marginBottom: 17, color: gameColors.plum, fontSize: 24, fontWeight: '900' },
  accountCard: { marginBottom: 13, padding: 15, borderRadius: 17, backgroundColor: gameColors.surface },
  metaLabel: { color: gameColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  username: { marginTop: 4, color: gameColors.plum, fontSize: 16, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', marginTop: 9, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 11 },
  linked: { backgroundColor: '#E4F2D1' },
  unlinked: { backgroundColor: '#F8E7D9' },
  badgeText: { color: gameColors.ink, fontSize: 10, fontWeight: '800' },
  guestDescription: { marginBottom: 14, color: gameColors.muted, fontSize: 13, lineHeight: 19 },
  panel: { marginBottom: 13, padding: 15, borderWidth: 1, borderColor: gameColors.border, borderRadius: 18, backgroundColor: gameColors.surface },
  sectionTitle: { marginBottom: 11, color: gameColors.plum, fontSize: 13, fontWeight: '900' },
  label: { marginBottom: 5, color: gameColors.muted, fontSize: 10, fontWeight: '800' },
  input: { minHeight: 44, marginBottom: 12, paddingHorizontal: 11, borderWidth: 1, borderColor: gameColors.border, borderRadius: 12, color: gameColors.plum, fontSize: 14, backgroundColor: '#FFFDFC' },
  primaryButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 13, backgroundColor: gameColors.purple },
  primaryText: { color: gameColors.onDark, fontSize: 12, fontWeight: '900' },
  helper: { marginTop: -3, marginBottom: 12, color: gameColors.muted, fontSize: 11, lineHeight: 16 },
  success: { marginTop: 9, color: '#3F7425', fontSize: 11, fontWeight: '700' },
  error: { marginTop: 8, color: '#B23A32', fontSize: 12, fontWeight: '700' },
  recoveryPanel: { marginBottom: 13, padding: 15, borderRadius: 17, backgroundColor: gameColors.lavenderSurface },
  secondaryButton: { minHeight: 47, alignItems: 'center', justifyContent: 'center', marginTop: 3, borderWidth: 1, borderColor: gameColors.border, borderRadius: 14, backgroundColor: gameColors.surface },
  secondaryText: { color: gameColors.ink, fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
});
