import { useEffect, useMemo, useRef } from 'react';
import Taro from '@tarojs/taro';
import { Button, ScrollView, Text, View } from '@tarojs/components';
import type { RoomSnapshot } from '../../../../src/network/protocol';
import type { PlayerId } from '../../../../src/game/types';
import { formatGameError, translate } from '../../../../src/i18n/translations';
import { useMiniGameStore } from '../../store/gameStore';
import { useMiniSettingsStore } from '../../store/settingsStore';
import { getMiniMatchControls, dispatchMiniMatchAction } from '../../store/matchPresentation';
import type { MiniMatchControls } from '../../store/matchPresentation';
import { playMiniFeedback } from '../../platform/feedback';
import { miniText } from '../../uiText';
import { BellButton } from '../../components/BellButton';
import { MatchStatus } from '../../components/MatchStatus';
import { PlayerDeck } from '../../components/PlayerDeck';
import { RingActivityLog } from '../../components/RingActivityLog';
import './index.scss';

const NO_CONTROLS: MiniMatchControls = {
  canFlip: false,
  canRing: false,
  canReplay: false,
  canLeave: false,
  connectionPaused: false,
  replayAction: null,
};

function movementForPlayer(snapshot: RoomSnapshot, playerId: PlayerId): 'collect' | 'penalty' | null {
  const event = snapshot.lastRingEvent;
  if (!event || event.movedCardCount === 0) return null;
  if (event.outcome === 'correct') return event.caller === playerId ? 'collect' : null;
  return event.caller === playerId ? 'penalty' : 'collect';
}

export default function GamePage(): JSX.Element {
  const game = useMiniGameStore();
  const language = useMiniSettingsStore(state => state.language);
  const setLanguage = useMiniSettingsStore(state => state.setLanguage);
  const settingsHydrated = useMiniSettingsStore(state => state.hydrated);
  const musicEnabled = useMiniSettingsStore(state => state.musicEnabled);
  const setMusicEnabled = useMiniSettingsStore(state => state.setMusicEnabled);
  const snapshot = game.roomSnapshot;
  const localPlayerId = game.localPlayerId;
  const controls = useMemo(() => snapshot
    ? getMiniMatchControls({
        snapshot,
        localPlayerId,
        sessionMode: game.sessionMode,
        connectionStatus: game.connectionStatus,
        leavingRoom: game.leavingRoom,
      })
    : NO_CONTROLS,
  [snapshot, localPlayerId, game.sessionMode, game.connectionStatus, game.leavingRoom]);
  const lastSessionVersion = useRef<number | null>(null);
  const lastRingVersion = useRef(0);
  const lastFlipVersion = useRef(0);
  const lastPhase = useRef<RoomSnapshot['phase'] | null>(null);
  const soundEnabled = settingsHydrated && musicEnabled;
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);

  useEffect(() => {
    if (!snapshot) {
      if (game.sessionMode === 'none' && !game.leavingRoom) void Taro.redirectTo({ url: '/pages/index/index' });
      return;
    }
    if (snapshot.phase === 'waiting') {
      void Taro.redirectTo({ url: '/pages/waiting/index' });
    }
  }, [snapshot, game.sessionMode, game.leavingRoom]);

  useEffect(() => {
    if (!snapshot) return;
    if (lastSessionVersion.current !== game.roomSessionVersion) {
      lastSessionVersion.current = game.roomSessionVersion;
      lastRingVersion.current = snapshot.ringVersion ?? snapshot.lastRingEvent?.version ?? 0;
      lastFlipVersion.current = snapshot.lastFlipEvent?.version ?? 0;
      lastPhase.current = snapshot.phase;
      return;
    }

    const ringVersion = snapshot.ringVersion ?? snapshot.lastRingEvent?.version ?? 0;
    if (ringVersion > lastRingVersion.current) {
      lastRingVersion.current = ringVersion;
      const ringEvent = snapshot.lastRingEvent?.version === ringVersion
        ? snapshot.lastRingEvent
        : snapshot.ringHistory.find(event => event.version === ringVersion);
      if (ringEvent) playMiniFeedback(ringEvent.outcome, soundEnabled);
    }

    const flipVersion = snapshot.lastFlipEvent?.version ?? 0;
    if (flipVersion > lastFlipVersion.current) {
      lastFlipVersion.current = flipVersion;
      playMiniFeedback('flip', soundEnabled);
    }

    if (lastPhase.current === 'playing' && snapshot.phase === 'finished') {
      playMiniFeedback('finish', soundEnabled);
    }
    lastPhase.current = snapshot.phase;
  }, [snapshot, game.roomSessionVersion, soundEnabled]);

  if (!snapshot) {
    return <View className="mini-game-loading"><Text>{game.leavingRoom ? t('entry.leaving') : miniText(language, 'lobbyLoading')}</Text></View>;
  }

  const opponentPlayerId: PlayerId = localPlayerId === 'A' ? 'B' : 'A';
  const localPlayer = localPlayerId ? snapshot.players[localPlayerId] : null;
  const opponent = snapshot.players[opponentPlayerId];
  const isSolo = game.sessionMode === 'single-player';
  const displayError = game.error ? formatGameError(language, game.error.code) : null;
  const handleAction = (action: 'flip' | 'ring' | 'rematch') => dispatchMiniMatchAction(
    action,
    controls,
    snapshot,
    localPlayerId,
    game,
  );
  const leaveMatch = () => {
    const left = dispatchMiniMatchAction('leave', controls, snapshot, localPlayerId, game);
    if (left) void Taro.redirectTo({ url: '/pages/index/index' });
  };
  const ready = localPlayerId ? snapshot.ready[localPlayerId] : false;
  const replayLabel = controls.replayAction === 'rematch'
    ? t('game.playAgain')
    : ready ? miniText(language, 'cancelReady') : miniText(language, 'markReady');
  const turnPlayerLabel = snapshot.turn === localPlayerId
    ? t('match.youLabel')
    : snapshot.turn === opponentPlayerId
      ? isSolo ? t('solo.opponent') : opponent.profile.nickname.trim() || translate(language, opponentPlayerId === 'A' ? 'player.seatA' : 'player.seatB')
      : t('debug.noTurn');
  const ringFeedback = localPlayerId && snapshot.ringBlockedUntilFlip[localPlayerId]
    ? t('match.ringLocked')
    : snapshot.lastRingOutcome === 'correct'
      ? t('bell.correct')
      : snapshot.lastRingOutcome === 'wrong'
        ? t('bell.wrong')
        : t('bell.anytime');

  return (
    <ScrollView className="mini-game-screen" scrollY>
      <View className="mini-game-shell">
        <View className="mini-game-header">
          <View className="mini-game-brand">
            <Text className="mini-game-brand-icon">🔔</Text>
            <View>
              <Text className="mini-game-brand-name">BellFive</Text>
              <Text className="mini-game-brand-caption">{isSolo ? t('game.singlePlayer') : miniText(language, 'waitingTitle')}</Text>
            </View>
          </View>
          <View className="mini-game-header-actions">
            <Button className="mini-header-button" aria-label={miniText(language, 'language')} onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}>
              {language === 'zh-CN' ? 'EN' : '中文'}
            </Button>
            <Button className="mini-header-button" aria-label={`${miniText(language, 'music')}: ${musicEnabled ? miniText(language, 'on') : miniText(language, 'off')}`} disabled={!settingsHydrated} onClick={() => setMusicEnabled(!musicEnabled)}>
              {musicEnabled ? '♫' : '♪'}
            </Button>
            <Button className="mini-leave-button" disabled={!controls.canLeave} onClick={leaveMatch}>{t('game.leave')}</Button>
          </View>
        </View>

        {controls.connectionPaused ? <View className="mini-paused-banner"><Text>{miniText(language, 'matchPaused')}</Text></View> : null}
        {displayError ? <View className="mini-error-banner"><Text>{displayError}</Text></View> : null}

        <MatchStatus
          snapshot={snapshot}
          localPlayerId={localPlayerId}
          connectionStatus={game.connectionStatus}
          sessionMode={game.sessionMode}
          language={language}
        />

        <View className="mini-table-panel">
          <View className="mini-table-heading">
            <Text className="mini-panel-title">{t('game.table')}</Text>
            <Text className="mini-table-version">{isSolo ? t('game.singlePlayer') : snapshot.roomCode}</Text>
          </View>
          <View className="mini-table-decks">
            <PlayerDeck
              key={`player-${opponentPlayerId}-${snapshot.lastRingEvent?.version ?? 0}`}
              playerId={opponentPlayerId}
              profile={opponent.profile}
              displayName={isSolo ? t('solo.opponent') : undefined}
              topCard={opponent.topCard}
              drawCount={opponent.drawCount}
              playedCount={opponent.playedCount}
              isTurnOwner={snapshot.turn === opponentPlayerId}
              isLocalPlayer={false}
              canFlip={false}
              language={language}
              movement={movementForPlayer(snapshot, opponentPlayerId)}
              cardKey={snapshot.lastFlipEvent?.version ?? 0}
              onFlip={() => undefined}
            />
            {localPlayer && localPlayerId ? (
              <PlayerDeck
                key={`player-${localPlayerId}-${snapshot.lastRingEvent?.version ?? 0}`}
                playerId={localPlayerId}
                profile={localPlayer.profile}
                topCard={localPlayer.topCard}
                drawCount={localPlayer.drawCount}
                playedCount={localPlayer.playedCount}
                isTurnOwner={snapshot.turn === localPlayerId}
                isLocalPlayer
                canFlip={controls.canFlip}
                language={language}
                movement={movementForPlayer(snapshot, localPlayerId)}
                cardKey={snapshot.lastFlipEvent?.version ?? 0}
                onFlip={() => { handleAction('flip'); }}
              />
            ) : null}
          </View>
          <Text className="mini-table-footnote">{t('game.topCardsOnly')}</Text>
        </View>

        <View className="mini-action-console">
          <View className="mini-console-heading">
            <Text className="mini-panel-title">{localPlayer ? localPlayer.profile.nickname || t('match.youLabel') : t('match.youLabel')}</Text>
            <Text className="mini-console-count">{translate(language, 'match.count.you')}: {localPlayer?.drawCount ?? 0}</Text>
          </View>
          <Text className="mini-action-prompt">
            {snapshot.phase === 'finished'
              ? t('game.roundComplete')
              : controls.canFlip
                ? t('game.yourTurnFlip')
                : controls.connectionPaused
                  ? t('game.connectionPaused')
                  : snapshot.turn
                    ? translate(language, 'game.playerFlipsNext', { playerLabel: turnPlayerLabel })
                    : t('game.waitReconnect')}
          </Text>
          {snapshot.phase === 'finished' ? (
            <Button className={`mini-replay-button ${ready ? 'mini-replay-ready' : ''}`} disabled={!controls.canReplay} onClick={() => { handleAction('rematch'); }}>
              {replayLabel}
            </Button>
          ) : (
            <View className="mini-action-row">
              <Button className={`mini-flip-button ${controls.canFlip ? '' : 'mini-action-disabled'}`} disabled={!controls.canFlip} onClick={() => { handleAction('flip'); }}>
                {t('game.flip')}
              </Button>
              <BellButton
                key={snapshot.ringVersion ?? snapshot.tableVersion}
                disabled={!controls.canRing}
                outcome={snapshot.lastRingOutcome}
                feedbackVersion={snapshot.ringVersion ?? snapshot.tableVersion}
                label={t('bell.ring')}
                onPress={() => { handleAction('ring'); }}
              />
            </View>
          )}
          {snapshot.phase !== 'finished' ? <Text className={`mini-bell-feedback ${snapshot.lastRingOutcome ? `mini-feedback-${snapshot.lastRingOutcome}` : ''}`}>{ringFeedback}</Text> : null}
        </View>

        {localPlayerId ? (
          <RingActivityLog
            snapshot={snapshot}
            localPlayerId={localPlayerId}
            language={language}
            opponentName={isSolo ? t('solo.opponent') : undefined}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}
