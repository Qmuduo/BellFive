import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlayerId } from '../game/types';
import { BellButton } from './BellButton';
import { CardTransferFly } from './CardTransferFly';
import { DebugPanel } from './DebugPanel';
import { GameCard } from './GameCard';
import { RingActivityLog } from './RingActivityLog';
import { RoomEntry } from './RoomEntry';
import { WaitingRoom } from './WaitingRoom';
import { LanguageSettings } from './LanguageSettings';
import { MusicToggle } from './MusicToggle';
import { useBackgroundMusic } from '../hooks/useBackgroundMusic';
import { useGameStore } from '../store/gameStore';
import { usePlayerProfileStore } from '../store/profileStore';
import { useSettingsStore } from '../store/settingsStore';
import { getPlayerDisplayName } from '../profile';
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

export default function GameScreen() {
  const { language, t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const compactMatch = windowHeight < 700;
  const bellAudioPlayer = useAudioPlayer(require('../../assets/audio/bell.wav'));
  const flipAudioPlayer = useAudioPlayer(require('../../assets/audio/card-flip.wav'));
  const victoryAudioPlayer = useAudioPlayer(require('../../assets/audio/victory.wav'));
  const defeatAudioPlayer = useAudioPlayer(require('../../assets/audio/defeat.wav'));
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
  const playerProfile = usePlayerProfileStore(state => state.profile);
  const profileHydrated = usePlayerProfileStore(state => state.hydrated);
  const setPlayerProfile = usePlayerProfileStore(state => state.setProfile);
  const createRoom = useGameStore(state => state.createRoom);
  const joinRoom = useGameStore(state => state.joinRoom);
  const openLobby = useGameStore(state => state.openLobby);
  const refreshLobby = useGameStore(state => state.refreshLobby);
  const closeLobby = useGameStore(state => state.closeLobby);
  const decideApplication = useGameStore(state => state.decideApplication);
  const cancelApplication = useGameStore(state => state.cancelApplication);
  const setReady = useGameStore(state => state.setReady);
  const flip = useGameStore(state => state.flip);
  const ring = useGameStore(state => state.ring);
  const leaveRoom = useGameStore(state => state.leaveRoom);
  const music = useBackgroundMusic(Boolean(roomSnapshot?.phase === 'playing' && connectionStatus === 'connected' && !leavingRoom));
  const [ringCue, setRingCue] = useState<RingFeedbackEvent | null>(null);
  const [showMatchDetails, setShowMatchDetails] = useState(false);
  const lastProcessedAction = useRef<string | null>(null);
  const lastProcessedRingVersion = useRef<number | null>(null);
  const lastProcessedFlipVersion = useRef<number | null>(null);
  const lastObservedRoomSessionVersion = useRef<number | null>(null);
  const lastObservedPhase = useRef<string | null>(null);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (roomSnapshot || leavingRoom) return;
    openLobby();
    return () => closeLobby();
  }, [roomSnapshot === null, leavingRoom, openLobby, closeLobby]);

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
      lastProcessedFlipVersion.current = roomSnapshot.lastFlipEvent?.version ?? 0;
      lastObservedPhase.current = roomSnapshot.phase;
      return;
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
        <StatusBar barStyle="dark-content" backgroundColor="#F6F5F1" />
        <RoomEntry
          onCreate={createRoom}
          onJoin={joinRoom}
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
        <StatusBar barStyle="dark-content" backgroundColor="#F6F5F1" />
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

  const isPlaying = roomSnapshot.phase === 'playing';
  const isFinished = roomSnapshot.phase === 'finished';
  const canInteract = isPlaying && connectionStatus === 'connected';
  const canFlip = canInteract && Boolean(localPlayerId && localPlayerId === roomSnapshot.turn);
  const canRing = canInteract && Boolean(localPlayerId && !roomSnapshot.ringBlockedUntilFlip[localPlayerId]);
  const localWinner = roomSnapshot.winner === localPlayerId;
  const formattedTime = formatRemainingTime(roomSnapshot.remainingSeconds);
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
      <StatusBar barStyle="dark-content" backgroundColor="#F6F5F1" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <Text style={styles.title}>BellFive</Text>
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
          {roomSnapshot.phase === 'connection-paused' || connectionStatus === 'reconnecting' || connectionStatus === 'disconnected' ? (
            <View style={styles.pausedBanner}><Text style={styles.pausedText}>{t('game.connectionPausedBanner')}</Text></View>
          ) : null}
          {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{formatGameError(language, error.code)}</Text></View> : null}

          <View style={styles.tablePanel}>
            <View style={styles.tableHeading}>
              <Text style={styles.tableTitle}>{t('game.table')}</Text>
              <Text style={styles.tableHint}>{roomCode}</Text>
            </View>
            <View testID="play-mat" style={styles.playMat}>
              {(localPlayerId ? [localPlayerId, localPlayerId === 'A' ? 'B' : 'A'] as const : ['A', 'B'] as const).map(player => (
                <GameCard
                  key={player}
                  playerId={player}
                playerLabel={t(player === localPlayerId ? 'match.you' : 'match.opponent', { nickname: roomSnapshot.players[player].profile.nickname || playerSeatLabel(player, language) })}
                  card={roomSnapshot.players[player].topCard ?? undefined}
                  active={isPlaying && roomSnapshot.turn === player}
                  isLocalPlayer={player === localPlayerId}
                  drawCount={roomSnapshot.players[player].drawCount ?? 0}
                  playedCount={roomSnapshot.players[player].playedCount ?? 0}
                  canFlip={canFlip && localPlayerId === player}
                  compact={compactMatch}
                  onPress={() => handleDeckFlip(player)}
                />
              ))}
              {ringCue ? <CardTransferFly key={ringCue.version} event={ringCue} localPlayerId={localPlayerId ?? 'A'} /> : null}
            </View>
          </View>

          <View style={styles.turnStrip}>
            <View style={[styles.turnDot, isFinished && styles.turnDotFinished]} />
            <View style={styles.turnCopy}>
              <Text style={styles.turnLabel}>{isFinished ? t('game.over') : roomSnapshot.phase === 'connection-paused' || connectionStatus === 'reconnecting' ? t('game.connectionPaused') : canFlip ? t('game.yourTurnFlip') : t('game.playerFlipsNext', { playerLabel: roomSnapshot.turn === localPlayerId ? t('match.youLabel') : roomSnapshot.turn ? roomSnapshot.players[roomSnapshot.turn].profile.nickname || playerSeatLabel(roomSnapshot.turn, language) : t('debug.noTurn') })}</Text>
              <Text style={styles.turnHint}>{isFinished ? t('game.roundComplete') : canRing ? t('bell.anytime') : localPlayerId && roomSnapshot.ringBlockedUntilFlip[localPlayerId] ? t('match.ringLocked') : t('game.waitReconnect')}</Text>
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
                    ? t('game.timeUpWinner', { playerLabel: playerSeatLabel(roomSnapshot.winner, language) })
                    : t('game.playerWins', { playerLabel: playerSeatLabel(roomSnapshot.winner, language) })}
              </Text>
            </View>
          ) : null}
          <Pressable role="button" accessibilityState={{ expanded: showMatchDetails }} accessibilityLabel={t('match.details')} onPress={() => setShowMatchDetails(value => !value)} style={styles.detailsButton}>
            <Text style={styles.detailsText}>{t('match.details')} {showMatchDetails ? '−' : '+'}</Text>
          </Pressable>
          {showMatchDetails ? <View style={styles.detailsPanel}>{localPlayerId ? <RingActivityLog events={roomSnapshot.ringHistory} localPlayerId={localPlayerId} /> : null}<DebugPanel snapshot={roomSnapshot} connectionStatus={connectionStatus} /></View> : null}
        </ScrollView>

        {isFinished ? (
          <View style={styles.finishedDock}>
            {localPlayerId ? (
              <Pressable
                role="button"
                accessibilityState={{ disabled: connectionStatus !== 'connected' }}
                disabled={connectionStatus !== 'connected'}
                onPress={() => setReady(!roomSnapshot.ready[localPlayerId])}
                style={({ pressed }) => [styles.playAgain, roomSnapshot.ready[localPlayerId] && styles.readyAgain, connectionStatus !== 'connected' && styles.disabledButton, pressed && styles.pressed]}
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
              <View style={styles.identityCopy}><Text numberOfLines={1} style={styles.identityCaption}>{t('match.console')}</Text><Text numberOfLines={1} style={styles.identityName}>{localPlayerId ? roomSnapshot.players[localPlayerId].profile.nickname || playerSeatLabel(localPlayerId, language) : '—'}</Text></View>
              <View style={styles.drawCount}><Text style={styles.drawCaption}>{t('match.draw')}</Text><Text style={styles.drawValue}>{localPlayerId ? roomSnapshot.players[localPlayerId].drawCount ?? 0 : 0}</Text></View>
            </View>
            <Text style={styles.consolePrompt}>{isFinished ? t('game.roundComplete') : canFlip ? t('game.yourTurnFlip') : roomSnapshot.phase === 'connection-paused' || connectionStatus !== 'connected' ? t('game.connectionPaused') : t('game.playerFlipsNext', { playerLabel: roomSnapshot.turn === localPlayerId ? t('match.youLabel') : roomSnapshot.turn ? roomSnapshot.players[roomSnapshot.turn].profile.nickname || playerSeatLabel(roomSnapshot.turn, language) : t('debug.noTurn') })}</Text>
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
              <Text style={styles.flipHint}>{t('match.leftHand')}</Text>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F0FF' },
  screen: { flex: 1, paddingHorizontal: 12, backgroundColor: '#F5F0FF' },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { color: '#2F194C', fontSize: 21, fontWeight: '900', letterSpacing: -0.8 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerPill: { minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 7, borderRadius: 12, backgroundColor: '#E3FB88' },
  timerText: { color: '#2F194C', fontSize: 14, fontWeight: '900', fontVariant: ['tabular-nums'] },
  headerButton: { minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D7C9E8' },
  headerButtonText: { color: '#2F194C', fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 2, paddingBottom: 8 },
  turnStrip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, marginBottom: 4, borderRadius: 12, backgroundColor: '#E2D5FF' },
  turnDot: { width: 8, height: 8, marginRight: 7, borderRadius: 4, backgroundColor: '#7040C4' },
  turnDotFinished: { backgroundColor: '#E3FB88' },
  turnCopy: { flex: 1 },
  turnLabel: { color: '#2F194C', fontSize: 10, fontWeight: '900' },
  turnHint: { marginTop: 1, color: '#796887', fontSize: 9, fontWeight: '600' },
  pausedBanner: { alignItems: 'center', marginBottom: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF1D7' },
  pausedText: { color: '#946B22', fontSize: 11, fontWeight: '800' },
  errorBanner: { marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FBE6E3' },
  errorText: { color: '#9D453F', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tablePanel: { padding: 0, marginBottom: 2 },
  tableHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5, paddingHorizontal: 2 },
  tableTitle: { color: '#796887', fontSize: 9, fontWeight: '800' },
  tableHint: { color: '#796887', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  playMat: { position: 'relative', flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  gameOver: { alignItems: 'center', paddingVertical: 12 },
  winnerLabel: { color: '#3D6078', fontSize: 19, fontWeight: '900', letterSpacing: 0.8 },
  youWin: { marginTop: 1, color: '#D46D69', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  console: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, borderTopLeftRadius: 18, borderTopRightRadius: 18, backgroundColor: '#34214F' },
  consoleIdentity: { minHeight: 46, flexDirection: 'row', alignItems: 'center' },
  initial: { width: 37, height: 39, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderRadius: 10, backgroundColor: '#E3FB88' },
  initialText: { color: '#34214F', fontSize: 20, fontWeight: '900' },
  identityCopy: { flex: 1, minWidth: 0 },
  identityCaption: { color: '#C6B5DF', fontSize: 12, fontWeight: '700', letterSpacing: 0.4 },
  identityName: { color: '#F9F5FF', fontSize: 20, fontWeight: '900' },
  drawCount: { alignItems: 'flex-end', marginLeft: 8 },
  drawCaption: { color: '#C6B5DF', fontSize: 12, fontWeight: '700' },
  drawValue: { color: '#F9F5FF', fontSize: 22, fontWeight: '900' },
  consolePrompt: { minHeight: 28, paddingTop: 5, color: '#E3FB88', fontSize: 12, fontWeight: '700' },
  actionDock: { flexDirection: 'row', alignItems: 'stretch', gap: 14, paddingTop: 2, paddingBottom: 0 },
  actionButtonSlot: { flex: 1, minWidth: 0 },
  flipButton: { flex: 1, minWidth: 0, minHeight: 116, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 2, borderColor: '#C6A3F7', backgroundColor: '#9165D2', shadowColor: '#583780', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
  compactActionButton: { minHeight: 88 },
  disabledButton: { opacity: 0.58 },
  flipText: { color: '#FFF9FF', fontSize: 24, fontWeight: '900', letterSpacing: 1.5 },
  flipHint: { marginTop: 4, color: '#F0E8FF', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  consoleFoot: { minHeight: 22, paddingTop: 5, color: '#C6B5DF', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  correctFeedback: { color: '#B9F4C8' },
  wrongFeedback: { color: '#FFB6B6' },
  detailsButton: { alignSelf: 'flex-start', marginTop: 8, paddingVertical: 6, paddingHorizontal: 3 },
  detailsText: { color: '#796887', fontSize: 10, fontWeight: '800' },
  detailsPanel: { paddingBottom: 8 },
  finishedDock: { alignItems: 'center', justifyContent: 'center', minHeight: 68, borderTopWidth: 1, borderTopColor: '#E6E5E1' },
  playAgain: { width: '100%', minHeight: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#9165D2' },
  readyAgain: { backgroundColor: '#E3F1E7' },
  readyAgainText: { color: '#35744F' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
});
