import { useEffect, useMemo, useState } from 'react';
import Taro from '@tarojs/taro';
import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import { AVATAR_EMOJI, AVATAR_OPTIONS } from '../../../../src/profile';
import type { AvatarId } from '../../../../src/profile';
import { formatApplicationStatus, formatGameError, translate } from '../../../../src/i18n/translations';
import { createPendingOnlineIntent, startMiniSoloGame } from '../../store/pendingOnlineIntent';
import type { PendingOnlineIntent } from '../../store/pendingOnlineIntent';
import { useMiniAuthStore } from '../../store/authStore';
import { useMiniGameStore } from '../../store/gameStore';
import { useMiniProfileStore } from '../../store/profileStore';
import { useMiniSettingsStore } from '../../store/settingsStore';
import { getMiniLobbyViewState } from '../../store/lobbyViewState';
import { normalizeMiniRoomCode } from '../../store/roomCode';
import { getWechatLoginCode } from '../../platform/wechatLogin';
import { miniWebSocketUrl } from '../../platform/miniConfig';
import { WechatLoginPrompt } from '../../components/WechatLoginPrompt';
import { miniText } from '../../uiText';
import './index.scss';

const difficulties = ['easy', 'normal', 'hard'] as const;
type Difficulty = (typeof difficulties)[number];

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'NETWORK_ERROR';
}

export default function IndexPage(): JSX.Element {
  const user = useMiniAuthStore(state => state.user);
  const sessionToken = useMiniAuthStore(state => state.sessionToken);
  const profileVerified = useMiniAuthStore(state => state.profileVerified);
  const authHydrated = useMiniAuthStore(state => state.hydrated);
  const guestProfile = useMiniProfileStore(state => state.profile);
  const setGuestProfile = useMiniProfileStore(state => state.setProfile);
  const language = useMiniSettingsStore(state => state.language);
  const setLanguage = useMiniSettingsStore(state => state.setLanguage);
  const musicEnabled = useMiniSettingsStore(state => state.musicEnabled);
  const setMusicEnabled = useMiniSettingsStore(state => state.setMusicEnabled);
  const game = useMiniGameStore();
  const [roomCode, setRoomCode] = useState('');
  const [invalidRoomCode, setInvalidRoomCode] = useState(false);
  const [soloStarted, setSoloStarted] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const resumeIntent = (intent: PendingOnlineIntent) => {
    if (!miniWebSocketUrl.trim()) throw Object.assign(new Error('Missing game server URL.'), { code: 'SERVICE_NOT_CONFIGURED' });
    setEntryError(null);
    if (intent.type === 'create-room') useMiniGameStore.getState().createRoom();
    if (intent.type === 'join-room') useMiniGameStore.getState().joinRoom(intent.roomCode);
    if (intent.type === 'open-lobby') useMiniGameStore.getState().refreshLobby();
  };

  const intentFlow = useMemo(() => createPendingOnlineIntent(
    async () => {
      const auth = useMiniAuthStore.getState();
      if (auth.sessionToken && auth.profileVerified && auth.user) return;
      await useMiniAuthStore.getState().wechatLogin(await getWechatLoginCode());
    },
    intent => resumeIntent(intent),
  ), []);
  const [intentState, setIntentState] = useState(intentFlow.getState());

  useEffect(() => intentFlow.subscribe(setIntentState), [intentFlow]);

  useEffect(() => {
    const sharedCode = Taro.getCurrentInstance().router?.params?.roomCode;
    if (typeof sharedCode === 'string') setRoomCode(sharedCode.toUpperCase().slice(0, 6));
  }, []);

  useEffect(() => {
    if (authHydrated && sessionToken && profileVerified && !intentState.pendingIntent && !game.leavingRoom && game.sessionMode === 'none') {
      game.openLobby();
    }
  }, [authHydrated, sessionToken, profileVerified, intentState.pendingIntent, game.leavingRoom, game.sessionMode]);

  useEffect(() => {
    if (game.sessionMode === 'online' && game.roomSnapshot?.phase === 'waiting') {
      void Taro.redirectTo({ url: '/pages/waiting/index' });
    }
    if (game.sessionMode === 'single-player' && game.roomSnapshot) {
      void Taro.redirectTo({ url: '/pages/game/index' });
    }
  }, [game.sessionMode, game.roomSnapshot]);

  const profile = user?.profile ?? guestProfile;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const lobbyViewState = getMiniLobbyViewState({
    authenticated: Boolean(user && sessionToken && profileVerified),
    connectionStatus: game.connectionStatus,
    snapshotReceived: game.lobbySnapshotReceived,
    roomCount: game.openRooms.length,
  });

  const requestOnline = (intent: PendingOnlineIntent) => {
    setEntryError(null);
    const auth = useMiniAuthStore.getState();
    if (auth.sessionToken && auth.user && auth.profileVerified) {
      try {
        resumeIntent(intent);
      } catch (error) {
        setEntryError(errorCode(error));
      }
      return;
    }
    void intentFlow.begin(intent);
  };

  const joinByCode = () => {
    const normalizedCode = normalizeMiniRoomCode(roomCode);
    if (!normalizedCode) {
      setInvalidRoomCode(true);
      return;
    }
    setInvalidRoomCode(false);
    setRoomCode(normalizedCode);
    requestOnline({ type: 'join-room', roomCode: normalizedCode });
  };

  const startSolo = (difficulty: Difficulty) => {
    startMiniSoloGame(intentFlow, () => {
      setSoloStarted(true);
      useMiniGameStore.getState().startSinglePlayer(profile, difficulty);
    });
  };

  const navigate = (url: string) => { void Taro.navigateTo({ url }); };

  return (
    <ScrollView className="entry-screen" scrollY>
      <View className="entry-shell">
        <View className="top-actions">
          <Button className="small-button" onClick={() => navigate('/pages/account/index')}>
            {t('account.title')}
          </Button>
          <Button className="small-button" onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}>
            {language === 'zh-CN' ? 'EN' : '中文'}
          </Button>
          <Button className="small-button" onClick={() => setMusicEnabled(!musicEnabled)}>
            {miniText(language, 'music')}: {musicEnabled ? miniText(language, 'on') : miniText(language, 'off')}
          </Button>
        </View>

        <View className="brand-mark"><Text className="brand-bell">🔔</Text></View>
        <Text className="entry-eyebrow">{t('entry.eyebrow')}</Text>
        <Text className="entry-title">铃果派对</Text>
        <Text className="entry-description">{t('entry.description')}</Text>

        <View className="profile-card">
          <Text className="section-caption">{user ? miniText(language, 'accountStatus') : miniText(language, 'editProfile')}</Text>
          {user ? (
            <View className="signed-in-row">
              <Text className="avatar-large">{AVATAR_EMOJI[profile.avatarId]}</Text>
              <View className="signed-in-copy">
                <Text className="profile-name">{profile.nickname || miniText(language, 'guest')}</Text>
                <Text className="profile-subtitle">{user.username ?? miniText(language, 'wechatOnly')}</Text>
              </View>
              <Text className="linked-badge">{miniText(language, 'wechatLinked')}</Text>
            </View>
          ) : (
            <>
              <Input
                className="nickname-input"
                value={guestProfile.nickname}
                maxlength={12}
                onInput={event => setGuestProfile({ ...guestProfile, nickname: event.detail.value })}
                placeholder={miniText(language, 'nicknamePlaceholder')}
              />
              <Text className="section-caption">{miniText(language, 'chooseAvatar')}</Text>
              <View className="avatar-row">
                {AVATAR_OPTIONS.map(avatar => (
                  <Button
                    key={avatar}
                    className={`avatar-choice ${guestProfile.avatarId === avatar ? 'avatar-choice-active' : ''}`}
                    onClick={() => setGuestProfile({ ...guestProfile, avatarId: avatar as AvatarId })}
                  >
                    {AVATAR_EMOJI[avatar]}
                  </Button>
                ))}
              </View>
            </>
          )}
        </View>

        <Button className="create-room-button" loading={intentState.pending && intentState.pendingIntent?.type === 'create-room'} onClick={() => requestOnline({ type: 'create-room' })}>
          {t('entry.createRoom')}
        </Button>

        <View className="solo-card">
          <Text className="solo-heading">{miniText(language, 'difficulty')}</Text>
          <View className="difficulty-row">
            {difficulties.map(difficulty => (
              <Button key={difficulty} className="difficulty-button" onClick={() => startSolo(difficulty)}>
                {miniText(language, difficulty)}
              </Button>
            ))}
          </View>
          {soloStarted ? <Text className="success-copy">{miniText(language, 'soloStarted')}</Text> : null}
        </View>

        {intentState.pendingIntent ? (
          <WechatLoginPrompt
            language={language}
            pending={intentState.pending}
            errorCode={intentState.errorCode}
            onRetry={() => { void intentFlow.retry(); }}
          />
        ) : null}

        {!user && !intentState.pendingIntent ? (
          <Button className="text-button" onClick={() => navigate('/pages/account/index')}>
            {t('entry.signIn')}
          </Button>
        ) : null}

        <View className="lobby-card">
          <View className="lobby-heading-row">
            <Text className="section-caption">{miniText(language, 'lobbyTitle')}</Text>
            <Button className="small-button" loading={game.connectionStatus === 'connecting'} onClick={() => requestOnline({ type: 'open-lobby' })}>
              {t('entry.refresh')}
            </Button>
          </View>
          {entryError ? (
            <Text className="error-copy">{entryError === 'SERVICE_NOT_CONFIGURED' ? miniText(language, 'serviceNotConfigured') : formatGameError(language, entryError)}</Text>
          ) : null}
          {game.error ? <Text className="error-copy">{formatGameError(language, game.error.code)}</Text> : null}
          {lobbyViewState === 'sign-in' ? <Text className="helper-copy">{t('entry.onlineSignIn')}</Text> : null}
          {lobbyViewState === 'loading' ? (
            <View className="lobby-status">
              <Text className="helper-copy">{game.connectionStatus === 'reconnecting' ? t('waiting.reconnecting') : miniText(language, 'lobbyLoading')}</Text>
              {game.connectionStatus === 'error' || game.connectionStatus === 'disconnected' ? (
                <Button className="secondary-button" onClick={() => requestOnline({ type: 'open-lobby' })}>{miniText(language, 'lobbyRetry')}</Button>
              ) : null}
            </View>
          ) : null}
          {lobbyViewState === 'syncing' ? (
            <Text className="helper-copy">{miniText(language, 'lobbySyncing')}</Text>
          ) : null}
          {lobbyViewState === 'empty' ? (
            <Text className="empty-copy">{t('entry.emptyRooms')}</Text>
          ) : null}
          {game.openRooms.map(room => (
            <View key={room.roomCode} className="room-row">
              <Text className="room-avatar">{AVATAR_EMOJI[room.hostProfile.avatarId]}</Text>
              <View className="room-description">
                <Text className="room-name">{room.hostProfile.nickname || miniText(language, 'host')}</Text>
                <Text className="room-subtitle">{room.roomCode} · {t('entry.waitingForPlayer')}</Text>
              </View>
              <Button
                className="request-button"
                disabled={Boolean(game.applyingRoomCode || intentState.pending)}
                loading={game.applyingRoomCode === room.roomCode}
                onClick={() => requestOnline({ type: 'join-room', roomCode: room.roomCode })}
              >
                {t('entry.join')}
              </Button>
            </View>
          ))}
          {game.localApplicationStatus ? (
            <View className="application-status">
              <Text>{formatApplicationStatus(language, game.localApplicationStatus.status)}</Text>
              {game.localApplicationStatus.status === 'pending' ? (
                <Button className="cancel-request" onClick={() => game.cancelApplication()}>{t('entry.cancelRequest')}</Button>
              ) : null}
            </View>
          ) : null}
          <View className="join-by-code">
            <Text className="section-caption">{t('entry.joinByCode')}</Text>
            <Input
              className="room-code-input"
              value={roomCode}
              maxlength={6}
              onInput={event => {
                setRoomCode(event.detail.value.replace(/\s/g, '').toUpperCase().slice(0, 6));
                setInvalidRoomCode(false);
              }}
              placeholder={miniText(language, 'joinCodePlaceholder')}
            />
            <Button className="secondary-button" loading={intentState.pending && intentState.pendingIntent?.type === 'join-room'} onClick={joinByCode}>
              {t('entry.joinRoom')}
            </Button>
            {invalidRoomCode ? <Text className="error-copy">{miniText(language, 'invalidRoomCode')}</Text> : null}
          </View>
        </View>

        {intentState.errorCode ? (
          <Text className="error-copy">{intentState.errorCode === 'SERVICE_NOT_CONFIGURED' ? miniText(language, 'serviceNotConfigured') : null}</Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
