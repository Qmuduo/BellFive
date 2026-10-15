import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlayerId } from '../game/types';
import { BellButton } from './BellButton';
import { CardTransferFly } from './CardTransferFly';
import type { TransferAnchors } from './CardTransferFly';
import { DebugPanel } from './DebugPanel';
import { GameCard } from './GameCard';
import { formatRingActivity, RingActivityLog } from './RingActivityLog';
import { RingDanmaku } from './RingDanmaku';
import { RoomEntry } from './RoomEntry';
import { WaitingRoom } from './WaitingRoom';
import { LanguageSettings } from './LanguageSettings';
import { MusicToggle } from './MusicToggle';
import { useBackgroundMusic } from '../hooks/useBackgroundMusic';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../auth/authStore';
import { usePlayerProfileStore } from '../store/profileStore';
import { useSettingsStore } from '../store/settingsStore';
import { getPlayerDisplayName } from '../profile';
import { gameColors } from '../theme/gameColors';
import { formatGameError, playerSeatLabel } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import {
  playBellSound,
  playCardFlipSound,
  playDefeatSound,
  playVictorySound,
  triggerGameFeedback,
} from '../services/gameFeedback';
import type { RingFeedbackEvent } from '../network/protocol';

const DANMAKU_LANE_COUNT = 4;

export type GameScreenProps = Readonly<{
  initialRoomCode?: string;
  onAuthenticate?: (action: 'create' | 'join' | 'lobby', roomCode?: string) => void;
  onAccount?: () => void;
}>;
type ActiveRingDanmaku = Readonly<{
  event: RingFeedbackEvent;
  lane: number;
}>;

type RingDanmakuState = Readonly<{
  active: readonly ActiveRingDanmaku[];
  queued: readonly RingFeedbackEvent[];
  nextLane: number;
}>;

const EMPTY_RING_DANMAKU_STATE: RingDanmakuState = { active: [], queued: [], nextLane: 0 };

function enqueueRingDanmakuEvents(state: RingDanmakuState, events: readonly RingFeedbackEvent[]): RingDanmakuState {
  const knownVersions = new Set([
    ...state.active.map(item => item.event.version),
    ...state.queued.map(event => event.version),
  ]);
  const queued = [...state.queued];
  for (const event of events) {
    if (knownVersions.has(event.version)) continue;
    knownVersions.add(event.version);
    queued.push(event);
  }
  const active = [...state.active];
  let nextLane = state.nextLane;

  while (active.length < DANMAKU_LANE_COUNT && queued.length > 0) {
    const lane = Array.from({ length: DANMAKU_LANE_COUNT }, (_, offset) => (
      (nextLane + offset) % DANMAKU_LANE_COUNT
    )).find(index => !active.some(item => item.lane === index));
    const event = queued.shift();
    if (lane === undefined || !event) break;
    active.push({ event, lane });
    nextLane = (lane + 1) % DANMAKU_LANE_COUNT;
  }

  return { active, queued, nextLane };
}

function finishRingDanmakuEvent(state: RingDanmakuState, version: number): RingDanmakuState {
  const finished = state.active.find(item => item.event.version === version);
  if (!finished) return state;

  const active = state.active.filter(item => item.event.version !== version);
  const [nextEvent, ...queued] = state.queued;
  return nextEvent
    ? { active: [...active, { event: nextEvent, lane: finished.lane }], queued, nextLane: state.nextLane }
    : { active, queued, nextLane: state.nextLane };
}

export default function GameScreen({ initialRoomCode, onAuthenticate, onAccount }: GameScreenProps = {}) {
  const { language, t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const compactMatch = windowHeight < 700;
  const bellAudioPlayer = useAudioPlayer(require('../../assets/audio/bell.wav'));
  const flipAudioPlayer = useAudioPlayer(require('../../assets/audio/card-flip.wav'));
  const victoryAudioPlayer = useAudioPlayer(require('../../assets/audio/victory.wav'));
  const defeatAudioPlayer = useAudioPlayer(require('../../assets/audio/defeat.wav'));
  const sessionMode = useGameStore(state => state.sessionMode);
  const isSinglePlayer = sessionMode === 'single-player';
  const connectionStatus = useGameStore(state => state.connectionStatus);
  const roomSnapshot = useGameStore(state => state.roomSnapshot);
  const roomCode = useGameStore(state => state.roomCode);
  const localPlayerId = useGameStore(state => state.localPlayerId);
  const leavingRoom = useGameStore(state => state.leavingRoom);
  const settingsHydrated = useSettingsStore(state => state.hydrated);
  const error = useGameStore(state => state.error);
  const lastActionResult = useGameStore(state => state.lastActionResult);
  const roomSessionVersion = useGameStore(state => state.roomSessionVersion);
  const openRooms = useGameStore(state => state.openRooms);
  const pendingApplications = useGameStore(state => state.pendingApplications);
  const applyingRoomCode = useGameStore(state => state.applyingRoomCode);
  const localApplicationStatus = useGameStore(state => state.localApplicationStatus);
  const localPlayerProfile = usePlayerProfileStore(state => state.profile);
  const localProfileHydrated = usePlayerProfileStore(state => state.hydrated);
  const setPlayerProfile = usePlayerProfileStore(state => state.setProfile);
  const authUser = useAuthStore(state => state.user);
  const authHydrated = useAuthStore(state => state.hydrated);
  const playerProfile = authUser?.profile ?? localPlayerProfile;
  const profileHydrated = localProfileHydrated;
  const createRoom = useGameStore(state => state.createRoom);
  const joinRoom = useGameStore(state => state.joinRoom);
  const startSinglePlayer = useGameStore(state => state.startSinglePlayer);
  const openLobby = useGameStore(state => state.openLobby);
  const refreshLobby = useGameStore(state => state.refreshLobby);
  const closeLobby = useGameStore(state => state.closeLobby);
  const decideApplication = useGameStore(state => state.decideApplication);
  const cancelApplication = useGameStore(state => state.cancelApplication);
  const setReady = useGameStore(state => state.setReady);
  const flip = useGameStore(state => state.flip);
  const ring = useGameStore(state => state.ring);
  const leaveRoom = useGameStore(state => state.leaveRoom);
  const music = useBackgroundMusic(Boolean(roomSnapshot?.phase === 'playing' && (isSinglePlayer || connectionStatus === 'connected') && !leavingRoom));
  const [ringCue, setRingCue] = useState<RingFeedbackEvent | null>(null);
  const [showMatchDetails, setShowMatchDetails] = useState(false);
  const [completedRingEvents, setCompletedRingEvents] = useState<readonly RingFeedbackEvent[]>([]);
  const [ringDanmakuState, setRingDanmakuState] = useState<RingDanmakuState>(EMPTY_RING_DANMAKU_STATE);
  const screenRef = useRef<View | null>(null);
  const transferAnchorRefs = useRef<{
    deck: Record<PlayerId, View | null>;
    table: Record<PlayerId, View | null>;
  }>({ deck: { A: null, B: null }, table: { A: null, B: null } });
  const [measuredTransfer, setMeasuredTransfer] = useState<Readonly<{ version: number; anchors: TransferAnchors }> | null>(null);
  const ringCueVersionRef = useRef<number | null>(null);
  ringCueVersionRef.current = ringCue?.version ?? null;
  const lastProcessedAction = useRef<string | null>(null);
  const lastProcessedRingVersion = useRef<number | null>(null);
  const lastEnqueuedRingVersion = useRef<number | null>(null);
  const lastProcessedFlipVersion = useRef<number | null>(null);
  const lastObservedRoomSessionVersion = useRef<number | null>(null);
  const lastObservedPhase = useRef<string | null>(null);

  const completeRingDanmaku = useCallback((event: RingFeedbackEvent) => {
    setCompletedRingEvents(current => [
      ...current.filter(item => item.version !== event.version),
      event,
    ].sort((left, right) => left.version - right.version).slice(-12));
    setRingDanmakuState(current => finishRingDanmakuEvent(current, event.version));
  }, []);

  const measureTransferAnchors = useCallback(async () => {
    const version = ringCueVersionRef.current;
    const [root, deckA, deckB, tableA, tableB] = await Promise.all([
      measureViewInWindow(screenRef.current),
      measureViewInWindow(transferAnchorRefs.current.deck.A),
      measureViewInWindow(transferAnchorRefs.current.deck.B),
      measureViewInWindow(transferAnchorRefs.current.table.A),
      measureViewInWindow(transferAnchorRefs.current.table.B),
    ]);
    if (version === null || !root || !deckA || !deckB || !tableA || !tableB) return;

    const next: TransferAnchors = {
      deck: {
        A: centerRelativeTo(root, deckA),
        B: centerRelativeTo(root, deckB),
      },
      table: {
        A: centerRelativeTo(root, tableA),
        B: centerRelativeTo(root, tableB),
      },
    };
    if (ringCueVersionRef.current === version) setMeasuredTransfer({ version, anchors: next });
  }, []);

  const requestTransferAnchorMeasure = useCallback(() => {
    if (ringCueVersionRef.current !== null) void measureTransferAnchors();
  }, [measureTransferAnchors]);

  useEffect(() => {
    if (!ringCue) {
      setMeasuredTransfer(null);
      return;
    }
    const frame = requestAnimationFrame(() => void measureTransferAnchors());
    return () => cancelAnimationFrame(frame);
  }, [measureTransferAnchors, ringCue]);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (roomSnapshot || leavingRoom || isSinglePlayer || !authUser) return;
    openLobby();
    return () => closeLobby();
  }, [roomSnapshot === null, leavingRoom, isSinglePlayer, authUser?.userId, openLobby, closeLobby]);

  useEffect(() => {
    if (authUser) setPlayerProfile(authUser.profile);
  }, [authUser?.userId, authUser?.profile.nickname, authUser?.profile.avatarId, setPlayerProfile]);

  useEffect(() => {
    if (!ringCue) return;
    const timeout = setTimeout(() => {
      setRingCue(current => (current?.version === ringCue.version ? null : current));
    }, 650);
    return () => clearTimeout(timeout);
  }, [ringCue]);

  useEffect(() => {
    if (!lastActionResult || lastProcessedAction.current === lastActionResult.actionId) return;
    lastProcessedAction.current = lastActionResult.actionId;
    if (!lastActionResult.accepted || !lastActionResult.outcome) return;

    if (lastActionResult.outcome === 'correct') {
      triggerGameFeedback('correct');
    } else {
      triggerGameFeedback('wrong');
    }
  }, [lastActionResult, localPlayerId]);

  useEffect(() => {
    if (!roomSnapshot) return;

    if (lastObservedRoomSessionVersion.current !== roomSessionVersion) {
      lastObservedRoomSessionVersion.current = roomSessionVersion;
      lastProcessedRingVersion.current = roomSnapshot.lastRingEvent?.version ?? roomSnapshot.ringVersion ?? 0;
      const initialRingHistory = roomSnapshot.ringHistory.slice(-12);
      setCompletedRingEvents(initialRingHistory);
      setRingDanmakuState(EMPTY_RING_DANMAKU_STATE);
      lastEnqueuedRingVersion.current = Math.max(
        roomSnapshot.ringVersion ?? 0,
        roomSnapshot.lastRingEvent?.version ?? 0,
        ...roomSnapshot.ringHistory.map(event => event.version),
      );
      lastProcessedFlipVersion.current = roomSnapshot.lastFlipEvent?.version ?? 0;
      lastObservedPhase.current = roomSnapshot.phase;
      return;
    }

    const lastEnqueuedVersion = lastEnqueuedRingVersion.current ?? 0;
    const unseenRingEvents = [...roomSnapshot.ringHistory]
      .concat(roomSnapshot.lastRingEvent ? [roomSnapshot.lastRingEvent] : [])
      .filter((event, index, events) => (
        event.version > lastEnqueuedVersion &&
        events.findIndex(candidate => candidate.version === event.version) === index
      ))
      .sort((left, right) => left.version - right.version);
    if (unseenRingEvents.length > 0) {
      lastEnqueuedRingVersion.current = unseenRingEvents[unseenRingEvents.length - 1].version;
      setRingDanmakuState(current => enqueueRingDanmakuEvents(current, unseenRingEvents));
    }

    const ringEvent = roomSnapshot.lastRingEvent;
    const ringVersion = ringEvent?.version ?? roomSnapshot.ringVersion ?? 0;
    if (lastProcessedRingVersion.current === null) {
      lastProcessedRingVersion.current = ringVersion;
    }
    if (ringEvent && ringVersion > lastProcessedRingVersion.current) {
      lastProcessedRingVersion.current = ringVersion;
      setRingCue(ringEvent);
      if (ringEvent.caller !== localPlayerId) playBellSound(bellAudioPlayer);
    }

    const flipEvent = roomSnapshot.lastFlipEvent;
    const flipVersion = flipEvent?.version ?? 0;
    if (lastProcessedFlipVersion.current === null) {
      lastProcessedFlipVersion.current = flipVersion;
    } else if (flipEvent && flipVersion > lastProcessedFlipVersion.current) {
      lastProcessedFlipVersion.current = flipVersion;
      if (flipEvent.player !== localPlayerId) playCardFlipSound(flipAudioPlayer);
    }

    const previousPhase = lastObservedPhase.current;
    if (
      previousPhase === 'playing' &&
      roomSnapshot.phase === 'finished' &&
      roomSnapshot.winner !== null &&
      localPlayerId
    ) {
      if (roomSnapshot.winner === localPlayerId) void playVictorySound(victoryAudioPlayer);
      else void playDefeatSound(defeatAudioPlayer);
    }
    lastObservedPhase.current = roomSnapshot.phase;
  }, [
    bellAudioPlayer,
    defeatAudioPlayer,
    flipAudioPlayer,
    localPlayerId,
    roomSessionVersion,
    roomSnapshot,
    victoryAudioPlayer,
  ]);

  if (!roomSnapshot) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={gameColors.canvas} />
        <RoomEntry
          onCreate={createRoom}
          onJoin={joinRoom}
          initialRoomCode={initialRoomCode}
          onlineEnabled={Boolean(authUser)}
          onlineHydrated={authHydrated}
          profileEditable={authHydrated && !authUser}
          onAuthenticate={onAuthenticate}
          onAccount={onAccount}
          onStartSinglePlayer={difficulty => startSinglePlayer(playerProfile, difficulty)}
          error={error}
          busy={leavingRoom || connectionStatus === 'connecting' || connectionStatus === 'reconnecting'}
          profile={playerProfile}
          profileHydrated={profileHydrated}
          onProfileChange={setPlayerProfile}
          busyLabel={leavingRoom ? t('entry.leaving') : undefined}
          openRooms={openRooms}
          applyingRoomCode={applyingRoomCode}
          applicationStatus={localApplicationStatus}
          onRefreshLobby={refreshLobby}
          onCancelApplication={cancelApplication}
        />
      </SafeAreaView>
    );
  }

  if (roomSnapshot.phase === 'waiting' && roomCode && localPlayerId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={gameColors.canvas} />
        <WaitingRoom
          roomCode={roomCode}
          localPlayerId={localPlayerId}
          snapshot={roomSnapshot}
          connectionStatus={connectionStatus}
          error={error}
          onLeave={leaveRoom}
          pendingApplications={pendingApplications}
          onDecideApplication={decideApplication}
          onSetReady={setReady}
        />
      </SafeAreaView>
    );
  }

  const localDeckPlayer = localPlayerId ?? 'A';
  const opponentPlayerId: PlayerId = localDeckPlayer === 'A' ? 'B' : 'A';
  const isPlaying = roomSnapshot.phase === 'playing';
  const isFinished = roomSnapshot.phase === 'finished';
  const canInteract = isPlaying && (isSinglePlayer || connectionStatus === 'connected');
  const canFlip = canInteract && Boolean(localPlayerId && localPlayerId === roomSnapshot.turn);
  const canRing = canInteract && Boolean(localPlayerId && !roomSnapshot.ringBlockedUntilFlip[localPlayerId]);
  const localWinner = roomSnapshot.winner === localPlayerId;
  const formattedTime = formatRemainingTime(roomSnapshot.remainingSeconds);
  const connectionPaused = !isSinglePlayer && (
    roomSnapshot.phase === 'connection-paused' ||
    connectionStatus === 'reconnecting' ||
    connectionStatus === 'disconnected'
  );
  const connectionUnavailable = !isSinglePlayer && connectionStatus !== 'connected';
  const getPlayerName = (player: PlayerId) => (
    isSinglePlayer && player === 'B'
      ? t('solo.opponent')
      : roomSnapshot.players[player].profile.nickname || playerSeatLabel(player, language)
  );
  const getPlayerLabel = (player: PlayerId) => t(
    player === localDeckPlayer ? 'match.you' : 'match.opponent',
    { nickname: getPlayerName(player) },
  );
  const nextPlayerLabel = roomSnapshot.turn === localPlayerId
    ? t('match.youLabel')
    : roomSnapshot.turn
      ? getPlayerName(roomSnapshot.turn)
      : t('debug.noTurn');
  const canReplay = isSinglePlayer || connectionStatus === 'connected';
  const handleFlip = () => {
    if (!canFlip) return;
    music.startFromGesture();
    playCardFlipSound(flipAudioPlayer);
    flip();
    triggerGameFeedback('flip');
  };
  const handleDeckFlip = (player: PlayerId) => {
    if (player === localPlayerId) handleFlip();
  };
  const handleRing = () => {
    if (!canRing) return;
    music.startFromGesture();
    playBellSound(bellAudioPlayer);
    triggerGameFeedback('press');
    ring();
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={gameColors.canvas} />
      <View ref={screenRef} style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>铃果派对</Text>
          <View style={styles.headerActions}>
            <MusicToggle enabled={music.enabled} disabled={!settingsHydrated} onToggle={music.toggle} />
            <LanguageSettings compact />
            {formattedTime ? <View style={styles.timerPill}><Text style={styles.timerText}>{formattedTime}</Text></View> : null}
            <Pressable role="button" accessibilityLabel={t('game.leaveRoom')} onPress={leaveRoom} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Text style={styles.headerButtonText}>{t('game.leave')}</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {connectionPaused ? (
            <View style={styles.pausedBanner}><Text style={styles.pausedText}>{t('game.connectionPausedBanner')}</Text></View>
          ) : null}
          {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{formatGameError(language, error.code)}</Text></View> : null}

          <View style={styles.playStage}>
            <View style={styles.tablePanel}>
              <View style={styles.tableHeading}>
                <Text style={styles.tableTitle}>{t('game.table')}</Text>
                <Text style={styles.tableHint}>{isSinglePlayer ? t('game.singlePlayer') : roomCode}</Text>
              </View>
              <View testID="play-mat" style={styles.playMat}>
                {([localDeckPlayer, opponentPlayerId] as const).map(player => (
                  <View
                    key={player}
                    ref={node => { transferAnchorRefs.current.table[player] = node; }}
                    onLayout={requestTransferAnchorMeasure}
                    style={styles.cardAnchor}
                  >
                    <GameCard
                      playerId={player}
                      playerLabel={getPlayerLabel(player)}
                      card={roomSnapshot.players[player].topCard ?? undefined}
                      active={isPlaying && roomSnapshot.turn === player}
                      isLocalPlayer={player === localPlayerId}
                      drawCount={roomSnapshot.players[player].drawCount ?? 0}
                      playedCount={roomSnapshot.players[player].playedCount ?? 0}
                      showDrawCount={isFinished}
                      canFlip={canFlip && localPlayerId === player}
                      compact={compactMatch}
                      onPress={() => handleDeckFlip(player)}
                    />
                  </View>
                ))}
                {ringDanmakuState.active.map(({ event, lane }) => (
                  <RingDanmaku
                    key={event.version}
                    event={event}
                    message={formatRingActivity(
                      event,
                      localDeckPlayer,
                      language,
                      isSinglePlayer ? t('solo.opponent') : undefined,
                    )}
                    lane={lane}
                    laneCount={DANMAKU_LANE_COUNT}
                    onComplete={completeRingDanmaku}
                  />
                ))}
              </View>
            </View>

            <View style={styles.turnStrip}>
              <View style={[styles.turnDot, isFinished && styles.turnDotFinished]} />
              <View style={styles.turnCopy}>
                <Text style={styles.turnLabel}>{isFinished ? t('game.over') : connectionPaused ? t('game.connectionPaused') : canFlip ? t('game.yourTurnFlip') : t('game.playerFlipsNext', { playerLabel: nextPlayerLabel })}</Text>
                <Text style={styles.turnHint}>{isFinished ? t('game.roundComplete') : canRing ? t('bell.anytime') : localPlayerId && roomSnapshot.ringBlockedUntilFlip[localPlayerId] ? t('match.ringLocked') : t('game.waitReconnect')}</Text>
              </View>
            </View>
          </View>

          {isFinished ? (
            <View style={styles.gameOver}>
              <Text style={styles.winnerLabel}>
                {roomSnapshot.winner === null ? t('game.draw') : localWinner ? t('game.youWin') : t('game.youLose')}
              </Text>
              <Text style={styles.youWin}>
                {roomSnapshot.winner === null
                  ? roomSnapshot.remainingSeconds === 0 ? t('game.timeUpTied') : t('game.matchTied')
                  : roomSnapshot.remainingSeconds === 0
                    ? t('game.timeUpWinner', { playerLabel: getPlayerName(roomSnapshot.winner) })
                    : t('game.playerWins', { playerLabel: getPlayerName(roomSnapshot.winner) })}
              </Text>
            </View>
          ) : null}
          <Pressable role="button" accessibilityState={{ expanded: showMatchDetails }} accessibilityLabel={t('match.details')} onPress={() => setShowMatchDetails(value => !value)} style={styles.detailsButton}>
            <Text style={styles.detailsText}>{t('match.details')} {showMatchDetails ? '−' : '+'}</Text>
          </Pressable>
          {showMatchDetails ? <View style={styles.detailsPanel}>{localPlayerId ? <RingActivityLog events={completedRingEvents} localPlayerId={localPlayerId} opponentName={isSinglePlayer ? t('solo.opponent') : undefined} /> : null}<DebugPanel snapshot={roomSnapshot} connectionStatus={connectionStatus} sessionMode={sessionMode} /></View> : null}
        </ScrollView>

        {isFinished ? (
          <View style={styles.finishedDock}>
            {localPlayerId ? (
              <Pressable
                role="button"
                accessibilityState={{ disabled: !canReplay }}
                disabled={!canReplay}
                onPress={() => setReady(!roomSnapshot.ready[localPlayerId])}
                style={({ pressed }) => [styles.playAgain, roomSnapshot.ready[localPlayerId] && styles.readyAgain, !canReplay && styles.disabledButton, pressed && styles.pressed]}
              >
                <Text style={[styles.flipText, roomSnapshot.ready[localPlayerId] && styles.readyAgainText]}>
                  {roomSnapshot.ready[localPlayerId] ? t('waiting.cancelReady') : t('game.playAgain')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.console}>
            <View style={styles.consoleIdentity}>
              <View style={styles.initial}><Text style={styles.initialText}>{localPlayerId ? (roomSnapshot.players[localPlayerId].profile.nickname.trim()[0] ?? getPlayerDisplayName(roomSnapshot.players[localPlayerId].profile, localPlayerId, language)[0] ?? '?').toLocaleUpperCase() : '?'}</Text></View>
              <View style={styles.identityCopy}><Text numberOfLines={1} style={styles.identityCaption}>{t('match.console')}</Text><Text numberOfLines={1} style={styles.identityName}>{localPlayerId ? getPlayerName(localPlayerId) : '—'}</Text></View>
              <View style={styles.drawCountGroup}>
                <Text style={styles.drawGroupCaption}>{t('match.drawPile')}</Text>
                <View style={styles.drawCountPair}>
                  {([localDeckPlayer, opponentPlayerId] as const).map(player => {
                    const drawCount = roomSnapshot.players[player].drawCount ?? 0;
                    const playerLabel = t(player === localDeckPlayer ? 'match.you' : 'match.opponent', {
                      nickname: getPlayerName(player),
                    });
                    return (
                      <View
                        key={player}
                        ref={node => { transferAnchorRefs.current.deck[player] = node; }}
                        onLayout={requestTransferAnchorMeasure}
                        accessible
                        accessibilityLabel={t('match.count.accessibility', { playerLabel, count: drawCount })}
                        style={[styles.drawCount, player === localDeckPlayer && styles.ownDrawCount]}
                      >
                        <Text style={[styles.drawStatCaption, player === localDeckPlayer && styles.ownDrawStatCaption]}>{t(player === localDeckPlayer ? 'match.count.you' : 'match.count.opponent')}</Text>
                        <Text style={[styles.drawValue, player === localDeckPlayer ? styles.ownDrawValue : styles.opponentDrawValue]}>{drawCount}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
            <Text style={styles.consolePrompt}>{isFinished ? t('game.roundComplete') : canFlip ? t('game.yourTurnFlip') : connectionUnavailable ? t('game.connectionPaused') : t('game.playerFlipsNext', { playerLabel: nextPlayerLabel })}</Text>
            <View style={styles.actionDock}>
            <View style={styles.actionButtonSlot}>
            <Pressable
              role="button"
              accessibilityLabel={t('game.flip')}
              accessibilityState={{ disabled: !canFlip }}
              disabled={!canFlip}
              onPress={handleFlip}
              style={({ pressed }) => [styles.flipButton, compactMatch && styles.compactActionButton, !canFlip && styles.disabledButton, pressed && canFlip && styles.pressed]}
            >
              <Text style={styles.flipText}>{t('game.flip')}</Text>
            </Pressable>
            </View>
            <BellButton
              disabled={!canRing}
              outcome={roomSnapshot.lastRingOutcome}
              animateOutcome={roomSnapshot.lastRingEvent?.caller === localPlayerId}
              feedbackKey={roomSnapshot.ringVersion ?? roomSnapshot.tableVersion}
              compact={compactMatch}
              locked={Boolean(localPlayerId && roomSnapshot.ringBlockedUntilFlip[localPlayerId])}
              showFeedback={false}
              onRing={handleRing}
            />
            </View>
            <Text accessibilityLiveRegion="polite" style={[styles.consoleFoot, roomSnapshot.lastRingOutcome === 'correct' && styles.correctFeedback, roomSnapshot.lastRingOutcome === 'wrong' && styles.wrongFeedback]}>
              {localPlayerId && roomSnapshot.ringBlockedUntilFlip[localPlayerId] ? t('match.ringLocked') : roomSnapshot.lastRingOutcome === 'correct' ? t('bell.correct') : roomSnapshot.lastRingOutcome === 'wrong' ? t('bell.wrong') : t('bell.anytime')}
            </Text>
          </View>
        )}
        {ringCue && isPlaying ? (
          <CardTransferFly
            key={ringCue.version}
            event={ringCue}
            localPlayerId={localDeckPlayer}
            anchors={measuredTransfer?.version === ringCue.version ? measuredTransfer.anchors : null}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function formatRemainingTime(remainingSeconds: number | null): string | null {
  if (remainingSeconds === null) return null;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

type WindowRect = Readonly<{ x: number; y: number; width: number; height: number }>;

function measureViewInWindow(view: View | null): Promise<WindowRect | null> {
  if (!view) return Promise.resolve(null);
  return new Promise(resolve => {
    view.measureInWindow((x, y, width, height) => {
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null);
    });
  });
}

function centerRelativeTo(root: WindowRect, target: WindowRect) {
  return {
    x: target.x + target.width / 2 - root.x,
    y: target.y + target.height / 2 - root.y,
  };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: gameColors.canvas },
  screen: { flex: 1, position: 'relative', paddingHorizontal: 12, backgroundColor: gameColors.canvas },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { color: gameColors.ink, fontSize: 21, fontWeight: '900', letterSpacing: -0.8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerPill: { minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 7, borderRadius: 12, backgroundColor: gameColors.lime },
  timerText: { color: gameColors.ink, fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  headerButton: { minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12, backgroundColor: gameColors.surface, borderWidth: 1, borderColor: gameColors.border },
  headerButtonText: { color: gameColors.ink, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingTop: 2, paddingBottom: 8 },
  playStage: { flexGrow: 1, justifyContent: 'center' },
  turnStrip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4, borderRadius: 12, backgroundColor: gameColors.lavenderSurface },
  turnDot: { width: 8, height: 8, marginRight: 7, borderRadius: 4, backgroundColor: gameColors.purple },
  turnDotFinished: { backgroundColor: gameColors.lime },
  turnCopy: { flex: 1 },
  turnLabel: { color: gameColors.ink, fontSize: 10, fontWeight: '900' },
  turnHint: { marginTop: 1, color: gameColors.muted, fontSize: 9, fontWeight: '600' },
  pausedBanner: { alignItems: 'center', marginBottom: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF1D7' },
  pausedText: { color: '#946B22', fontSize: 11, fontWeight: '800' },
  errorBanner: { marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FBE6E3' },
  errorText: { color: '#9D453F', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tablePanel: { padding: 0, marginBottom: 10 },
  tableHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, paddingHorizontal: 2 },
  tableTitle: { color: gameColors.muted, fontSize: 9, fontWeight: '800' },
  tableHint: { color: gameColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  playMat: { position: 'relative', flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  cardAnchor: { flex: 1, minWidth: 0 },
  gameOver: { alignItems: 'center', paddingVertical: 12 },
  winnerLabel: { color: '#3D6078', fontSize: 19, fontWeight: '900', letterSpacing: 0.8 },
  youWin: { marginTop: 1, color: '#D46D69', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  console: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: gameColors.plum },
  consoleIdentity: { minHeight: 46, flexDirection: 'row', alignItems: 'center' },
  initial: { width: 37, height: 39, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderRadius: 10, backgroundColor: gameColors.lime },
  initialText: { color: gameColors.plum, fontSize: 20, fontWeight: '900' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityCaption: { color: gameColors.mutedOnDark, fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  identityName: { color: gameColors.onDark, fontSize: 20, fontWeight: '900' },
  drawCountGroup: { minWidth: 104, alignItems: 'center', marginLeft: 6 },
  drawGroupCaption: { color: gameColors.mutedOnDark, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
  drawCountPair: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  drawCount: { minWidth: 34, alignItems: 'center' },
  ownDrawCount: { minWidth: 52, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 9, backgroundColor: gameColors.lime },
  drawStatCaption: { color: gameColors.subtleOnDark, fontSize: 7, fontWeight: '800', letterSpacing: 0.35 },
  ownDrawStatCaption: { color: gameColors.onLimeMuted },
  drawValue: { color: gameColors.onDark, fontSize: 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
  ownDrawValue: { color: gameColors.plum, fontSize: 23 },
  opponentDrawValue: { color: gameColors.opponentCount, fontSize: 14 },
  consolePrompt: { minHeight: 28, paddingTop: 5, color: gameColors.lime, fontSize: 12, fontWeight: '700' },
  actionDock: { flexDirection: 'row', alignItems: 'stretch', gap: 14, paddingTop: 2, paddingBottom: 0 },
  actionButtonSlot: { flex: 1, minWidth: 0 },
  flipButton: { flex: 1, minWidth: 0, minHeight: 116, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: gameColors.purpleActionBorder, backgroundColor: gameColors.purpleAction, shadowColor: gameColors.purpleShadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
  compactActionButton: { minHeight: 88 },
  disabledButton: { opacity: 0.58 },
  flipText: { color: gameColors.onAction, fontSize: 24, fontWeight: '900', letterSpacing: 1.5 },
  consoleFoot: { minHeight: 22, paddingTop: 5, color: gameColors.mutedOnDark, fontSize: 9, fontWeight: '800', textAlign: 'center' },
  correctFeedback: { color: '#B9F4C8' },
  wrongFeedback: { color: '#FFB6B6' },
  detailsButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 3 },
  detailsText: { color: gameColors.muted, fontSize: 10, fontWeight: '800' },
  detailsPanel: { paddingBottom: 8 },
  finishedDock: { alignItems: 'center', justifyContent: 'center', minHeight: 68, borderTopWidth: 1, borderTopColor: gameColors.border },
  playAgain: { width: '100%', minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: gameColors.purpleAction },
  readyAgain: { backgroundColor: '#E3F1E7' },
  readyAgainText: { color: '#35744F' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
});
