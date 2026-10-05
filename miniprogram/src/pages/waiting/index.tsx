import { useEffect } from 'react';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { Button, ScrollView, Text, View } from '@tarojs/components';
import { AVATAR_EMOJI, getPlayerDisplayName } from '../../../../src/profile';
import { formatGameError, translate } from '../../../../src/i18n/translations';
import { useMiniGameStore } from '../../store/gameStore';
import { useMiniSettingsStore } from '../../store/settingsStore';
import { canChangeMiniReady } from '../../store/waitingRoomRules';
import { miniText } from '../../uiText';
import './index.scss';

export default function WaitingPage(): JSX.Element {
  const game = useMiniGameStore();
  const language = useMiniSettingsStore(state => state.language);
  const roomCode = game.roomCode;
  const snapshot = game.roomSnapshot;
  const localPlayerId = game.localPlayerId;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useShareAppMessage(() => ({
    title: `BellFive · ${miniText(language, 'roomCode')} ${roomCode ?? ''}`,
    path: `/pages/index/index?roomCode=${roomCode ?? ''}`,
  }));

  useEffect(() => {
    if (!roomCode || !snapshot || !localPlayerId) {
      if (!game.leavingRoom) void Taro.redirectTo({ url: '/pages/index/index' });
      return;
    }
    if (snapshot.phase !== 'waiting') void Taro.redirectTo({ url: '/pages/game/index' });
  }, [roomCode, snapshot, localPlayerId, game.leavingRoom]);

  if (!roomCode || !snapshot || !localPlayerId) {
    return (
      <View className="waiting-shell">
        <Text className="waiting-copy">{game.leavingRoom ? t('entry.leaving') : miniText(language, 'lobbyLoading')}</Text>
      </View>
    );
  }

  const readyEnabled = canChangeMiniReady(game.connectionStatus, snapshot);
  const localReady = snapshot.ready[localPlayerId];

  const playerLabel = (playerId: 'A' | 'B') => getPlayerDisplayName(snapshot.players[playerId].profile, playerId, language);
  const connectionLabel = (connected: boolean, ready: boolean) => !connected
    ? miniText(language, 'disconnected')
    : ready
      ? miniText(language, 'ready')
      : miniText(language, 'connected');

  return (
    <ScrollView className="waiting-screen" scrollY>
      <View className="waiting-shell">
        <View className="waiting-top-row">
          <Text className="waiting-eyebrow">{t('waiting.eyebrow')}</Text>
          <Button className="small-button" onClick={() => void Taro.navigateTo({ url: '/pages/account/index' })}>{miniText(language, 'account')}</Button>
        </View>
        <Text className="waiting-title">{miniText(language, 'waitingTitle')}</Text>
        <Text className="waiting-subtitle">{t('waiting.description')}</Text>

        <View className="code-card">
          <Text className="code-label">{miniText(language, 'roomCode')}</Text>
          <Text className="room-code">{roomCode}</Text>
        </View>

        <View className="players-card">
          {(['A', 'B'] as const).map((playerId, index) => {
            const player = snapshot.players[playerId];
            const isLocal = playerId === localPlayerId;
            const isHost = playerId === 'A';
            return (
              <View key={playerId} className={`player-row ${index === 0 ? 'player-row-first' : ''}`}>
                <View className={`connection-dot ${player.connected ? 'connection-online' : ''}`} />
                <Text className="player-avatar">{AVATAR_EMOJI[player.profile.avatarId]}</Text>
                <View className="player-copy">
                  <Text className="player-name">
                    {player.profile.nickname || playerLabel(playerId)}{isLocal ? ` · ${t('waiting.you')}` : ''}
                  </Text>
                  <Text className="player-role">{isHost ? miniText(language, 'host') : miniText(language, 'guestPlayer')}</Text>
                </View>
                <Text className={`player-status ${player.connected ? 'player-status-online' : ''}`}>
                  {connectionLabel(player.connected, snapshot.ready[playerId])}
                </Text>
              </View>
            );
          })}
        </View>

        {game.pendingApplications.length ? (
          <View className="requests-card">
            <Text className="section-heading">{miniText(language, 'pendingRequests')}</Text>
            {game.pendingApplications.map(application => (
              <View key={application.applicationId} className="request-row">
                <View className="request-profile">
                  <Text className="request-avatar">{AVATAR_EMOJI[application.profile.avatarId]}</Text>
                  <Text className="request-name">{application.profile.nickname || miniText(language, 'guest')} {miniText(language, 'wantsToJoin')}</Text>
                </View>
                <View className="request-actions">
                  <Button className="approve-button" onClick={() => game.decideApplication(application.applicationId, true)}>
                    {miniText(language, 'approve')}
                  </Button>
                  <Button className="reject-button" onClick={() => game.decideApplication(application.applicationId, false)}>
                    {miniText(language, 'reject')}
                  </Button>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View className="connection-panel">
          <Text className="connection-message">
            {game.error
              ? formatGameError(language, game.error.code)
              : game.connectionStatus === 'reconnecting'
                ? t('waiting.reconnecting')
                : game.connectionStatus === 'connected'
                  ? miniText(language, 'bothReady')
                  : miniText(language, 'lobbyLoading')}
          </Text>
          {game.connectionStatus === 'reconnecting' || game.connectionStatus === 'error' ? (
            <Button className="secondary-button" onClick={() => game.refreshLobby()}>{miniText(language, 'reconnect')}</Button>
          ) : null}
        </View>

        <Button
          className={`ready-button ${localReady ? 'ready-button-on' : ''}`}
          disabled={!readyEnabled}
          onClick={() => game.setReady(!localReady)}
        >
          {localReady ? miniText(language, 'cancelReady') : miniText(language, 'markReady')}
        </Button>
        <Button className="share-button" openType="share">{miniText(language, 'shareRoom')}</Button>
        <Button className="leave-button" loading={game.leavingRoom} onClick={() => game.leaveRoom()}>
          {miniText(language, 'leaveRoom')}
        </Button>
      </View>
    </ScrollView>
  );
}
