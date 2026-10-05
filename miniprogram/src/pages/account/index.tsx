import { useRef, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import { AVATAR_EMOJI, AVATAR_OPTIONS } from '../../../../src/profile';
import type { AvatarId, PlayerProfile } from '../../../../src/profile';
import { formatAuthError, translate } from '../../../../src/i18n/translations';
import { useMiniAuthStore } from '../../store/authStore';
import { useMiniProfileStore } from '../../store/profileStore';
import { useMiniSettingsStore } from '../../store/settingsStore';
import { getWechatLoginCode } from '../../platform/wechatLogin';
import { WechatLoginPrompt } from '../../components/WechatLoginPrompt';
import { ExistingAccountBinding } from '../../components/ExistingAccountBinding';
import { linkWechatAfterConfirmation } from '../../store/wechatLinkConfirmation';
import type { WechatLinkCredentials } from '../../store/wechatLinkConfirmation';
import { createMiniAccountActionGate } from '../../store/accountActionGate';
import { miniText } from '../../uiText';
import './index.scss';

function getErrorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'NETWORK_ERROR';
}

export default function AccountPage(): JSX.Element {
  const user = useMiniAuthStore(state => state.user);
  const sessionToken = useMiniAuthStore(state => state.sessionToken);
  const profileVerified = useMiniAuthStore(state => state.profileVerified);
  const authPending = useMiniAuthStore(state => state.pending);
  const authError = useMiniAuthStore(state => state.errorCode);
  const refreshSession = useMiniAuthStore(state => state.refreshSession);
  const login = useMiniAuthStore(state => state.wechatLogin);
  const updateProfile = useMiniAuthStore(state => state.updateProfile);
  const addCredentials = useMiniAuthStore(state => state.addCredentials);
  const resetPassword = useMiniAuthStore(state => state.resetPasswordWithWechat);
  const linkWechat = useMiniAuthStore(state => state.linkWechat);
  const logout = useMiniAuthStore(state => state.logout);
  const guestProfile = useMiniProfileStore(state => state.profile);
  const setGuestProfile = useMiniProfileStore(state => state.setProfile);
  const language = useMiniSettingsStore(state => state.language);
  const setLanguage = useMiniSettingsStore(state => state.setLanguage);

  const [profileDraft, setProfileDraft] = useState<PlayerProfile | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [credentialsBusy, setCredentialsBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [accountActionBusy, setAccountActionBusy] = useState(false);
  const actionGate = useRef(createMiniAccountActionGate()).current;

  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const profile = user?.profile ?? guestProfile;
  const draft = profileDraft ?? profile;
  const authActionDisabled = authPending || accountActionBusy;

  const beginAuthAction = (): boolean => {
    if (!actionGate.tryBegin(useMiniAuthStore.getState().pending)) return false;
    setAccountActionBusy(true);
    return true;
  };

  const finishAuthAction = (): void => {
    actionGate.finish();
    setAccountActionBusy(false);
  };

  const saveProfile = async () => {
    if (!beginAuthAction()) return;
    setProfileSaved(false);
    setLocalError(null);
    try {
      if (user) {
        if (!sessionToken || !profileVerified) {
          setLocalError('PROFILE_REFRESH_REQUIRED');
          return;
        }
        await updateProfile(draft);
      } else {
        setGuestProfile(draft);
      }
      setProfileDraft(null);
      setProfileSaved(true);
    } catch (error) {
      setLocalError(getErrorCode(error));
    } finally {
      finishAuthAction();
    }
  };

  const signIn = async () => {
    if (!beginAuthAction()) return;
    setLocalError(null);
    try {
      await login(await getWechatLoginCode());
    } catch (error) {
      setLocalError(getErrorCode(error));
    } finally {
      finishAuthAction();
    }
  };

  const refreshProfile = async () => {
    if (!beginAuthAction()) return;
    try {
      await refreshSession();
    } finally {
      finishAuthAction();
    }
  };

  const saveCredentials = async () => {
    if (!beginAuthAction()) return;
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username.trim()) || password.length < 8 || password.length > 128) {
      setLocalError('INVALID_INPUT');
      finishAuthAction();
      return;
    }
    setCredentialsBusy(true);
    setLocalError(null);
    try {
      await addCredentials(username.trim(), password);
      setPassword('');
      setProfileSaved(true);
    } catch (error) {
      setLocalError(getErrorCode(error));
    } finally {
      setCredentialsBusy(false);
      finishAuthAction();
    }
  };

  const submitLink = async (credentials: WechatLinkCredentials) => {
    if (!beginAuthAction()) return;
    setLinkBusy(true);
    setLocalError(null);
    try {
      await linkWechatAfterConfirmation(credentials, {
        confirmTransfer: async () => {
          const result = await Taro.showModal({
            title: miniText(language, 'confirmTransferTitle'),
            content: miniText(language, 'bindExplanation'),
            confirmText: language === 'zh-CN' ? '转移' : 'Move',
            confirmColor: '#71528e',
          });
          return result.confirm;
        },
        getCode: getWechatLoginCode,
        link: input => linkWechat(input),
      });
    } catch (error) {
      setLocalError(getErrorCode(error));
    } finally {
      setLinkBusy(false);
      finishAuthAction();
    }
  };

  const submitPasswordReset = async () => {
    if (!beginAuthAction()) return;
    if (newPassword.length < 8 || newPassword.length > 128) {
      setLocalError('INVALID_INPUT');
      finishAuthAction();
      return;
    }
    setResetBusy(true);
    setLocalError(null);
    try {
      await resetPassword(await getWechatLoginCode(), newPassword);
      setNewPassword('');
      setProfileSaved(true);
    } catch (error) {
      setLocalError(getErrorCode(error));
    } finally {
      setResetBusy(false);
      finishAuthAction();
    }
  };

  const signOut = async () => {
    if (!beginAuthAction()) return;
    try {
      await logout();
      await Taro.redirectTo({ url: '/pages/index/index' });
    } finally {
      finishAuthAction();
    }
  };

  const showError = localError ?? authError;
  const errorText = showError === 'AUTH_NOT_CONFIGURED'
    ? miniText(language, 'serviceNotConfigured')
    : showError === 'PROFILE_REFRESH_REQUIRED'
      ? miniText(language, 'profileNotVerified')
      : showError
        ? formatAuthError(language, showError)
        : null;

  return (
    <ScrollView className="account-screen" scrollY>
      <View className="account-shell">
        <View className="account-top-row">
          <Button className="small-button" onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}>
            {language === 'zh-CN' ? 'EN' : '中文'}
          </Button>
          <Text className="account-title">{miniText(language, 'accountTitle')}</Text>
          <Button className="small-button" onClick={() => { void Taro.redirectTo({ url: '/pages/index/index' }); }}>
            {miniText(language, 'back')}
          </Button>
        </View>

        {!user ? (
          <View className="account-card">
            <Text className="section-heading">{miniText(language, 'guest')}</Text>
            <Text className="muted-copy">{t('account.guestDescription')}</Text>
            <WechatLoginPrompt language={language} pending={authActionDisabled} errorCode={showError} onRetry={() => { void signIn(); }} />
          </View>
        ) : (
          <>
            <View className="account-card">
              <Text className="section-heading">{miniText(language, 'accountStatus')}</Text>
              <Text className="status-line">{user.username ?? miniText(language, 'wechatOnly')}</Text>
              <Text className="muted-copy">{user.wechatLinked ? miniText(language, 'wechatLinked') : miniText(language, 'notLinked')}</Text>
              {!profileVerified ? (
                <View className="inline-action">
                  <Text className="warning-copy">{miniText(language, 'profileNotVerified')}</Text>
                  <Button className="secondary-button" disabled={authActionDisabled} loading={authActionDisabled} onClick={() => { void refreshProfile(); }}>
                    {miniText(language, 'refreshProfile')}
                  </Button>
                </View>
              ) : null}
            </View>

            <View className="account-card">
              <Text className="section-heading">{t('account.profile')}</Text>
              <Input
                className="form-input"
                disabled={authActionDisabled}
                value={draft.nickname}
                maxlength={12}
                onInput={event => setProfileDraft({ ...draft, nickname: event.detail.value })}
                placeholder={miniText(language, 'nickname')}
              />
              <Text className="field-label">{t('account.avatar')}</Text>
              <View className="avatar-row">
                {AVATAR_OPTIONS.map(avatar => (
                  <Button
                    key={avatar}
                    className={`avatar-choice ${draft.avatarId === avatar ? 'avatar-choice-active' : ''}`}
                    disabled={authActionDisabled}
                    onClick={() => setProfileDraft({ ...draft, avatarId: avatar as AvatarId })}
                  >
                    {AVATAR_EMOJI[avatar]}
                  </Button>
                ))}
              </View>
              {profileSaved ? <Text className="success-copy">{miniText(language, 'profileSaved')}</Text> : null}
              <Button className="primary-button" disabled={Boolean(user && !profileVerified) || authActionDisabled} loading={authActionDisabled} onClick={() => { void saveProfile(); }}>
                {miniText(language, 'saveProfile')}
              </Button>
            </View>

            {user.username === null ? (
              <View className="account-card">
                <Text className="section-heading">{miniText(language, 'credentials')}</Text>
                <Text className="muted-copy">{miniText(language, 'credentialsHelp')}</Text>
                <Input className="form-input" disabled={authActionDisabled} value={username} maxlength={24} onInput={event => setUsername(event.detail.value)} placeholder={miniText(language, 'username')} />
                <Input className="form-input" disabled={authActionDisabled} value={password} maxlength={128} password onInput={event => setPassword(event.detail.value)} placeholder={miniText(language, 'password')} />
                <Button className="secondary-button" disabled={credentialsBusy || !profileVerified || authActionDisabled} loading={credentialsBusy || authActionDisabled} onClick={() => { void saveCredentials(); }}>
                  {miniText(language, 'saveCredentials')}
                </Button>
              </View>
            ) : null}

            {user.username === null ? (
              <ExistingAccountBinding language={language} pending={linkBusy || authActionDisabled} errorCode={null} onBind={credentials => { void submitLink(credentials); }} />
            ) : null}

            <View className="account-card">
              <Text className="section-heading">{miniText(language, 'passwordRecovery')}</Text>
              <Text className="muted-copy">{user.wechatLinked ? miniText(language, 'recoveryWithWechat') : miniText(language, 'recoveryUnavailable')}</Text>
              {user.username && user.wechatLinked ? (
                <>
                  <Input className="form-input" disabled={authActionDisabled} value={newPassword} maxlength={128} password onInput={event => setNewPassword(event.detail.value)} placeholder={miniText(language, 'newPassword')} />
                  <Button className="secondary-button" disabled={resetBusy || authActionDisabled} loading={resetBusy || authActionDisabled} onClick={() => { void submitPasswordReset(); }}>
                    {miniText(language, 'resetPassword')}
                  </Button>
                </>
              ) : null}
            </View>

            <Button className="sign-out-button" disabled={authActionDisabled} loading={authActionDisabled} onClick={() => { void signOut(); }}>
              {miniText(language, 'signOut')}
            </Button>
          </>
        )}

        {errorText ? <Text className="form-error">{errorText}</Text> : null}
      </View>
    </ScrollView>
  );
}
