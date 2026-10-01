import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PlayerId } from '../game/types';
import { BellButton } from './BellButton';
import { CardTransferFly } from './CardTransferFly';
import { DebugPanel } from './DebugPanel';
import { GameCard } from './GameCard';
import { PlayerDeck } from './PlayerDeck';
import { RoomEntry } from './RoomEntry';
import { WaitingRoom } from './WaitingRoom';
import { useGameStore } from '../store/gameStore';
import { playRingOutcomeSound, triggerGameFeedback } from '../services/gameFeedback';
import type { RingFeedbackEvent } from '../network/protocol';

export default function GameScreen() {
  const audioPlayer = useAudioPlayer(require('../../assets/audio/bell.wav'));
  const connectionStatus = useGameStore(state => state.connectionStatus);
  const roomSnapshot = useGameStore(state => state.roomSnapshot);
  const roomCode = useGameStore(state => state.roomCode);
  const localPlayerId = useGameStore(state => state.localPlayerId);
  const leavingRoom = useGameStore(state => state.leavingRoom);
  const error = useGameStore(state => state.error);
  const lastActionResult = useGameStore(state => state.lastActionResult);
  const createRoom = useGameStore(state => state.createRoom);
  const joinRoom = useGameStore(state => state.joinRoom);
  const flip = useGameStore(state => state.flip);
  const ring = useGameStore(state => state.ring);
  const rematch = useGameStore(state => state.rematch);
  const leaveRoom = useGameStore(state => state.leaveRoom);
  const [ringCue, setRingCue] = useState<RingFeedbackEvent | null>(null);
  const lastProcessedAction = useRef<string | null>(null);
  const lastProcessedRingVersion = useRef<number | null>(null);

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
    const ringEvent = roomSnapshot.lastRingEvent;
    if (lastProcessedRingVersion.current === null) {
      lastProcessedRingVersion.current = ringEvent?.version ?? roomSnapshot.ringVersion ?? 0;
      return;
    }
    if (!ringEvent || ringEvent.version <= lastProcessedRingVersion.current) return;

    lastProcessedRingVersion.current = ringEvent.version;
    setRingCue(ringEvent);
    void playRingOutcomeSound(ringEvent.outcome, audioPlayer);
  }, [audioPlayer, roomSnapshot]);

  if (!roomSnapshot) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor="#F6F5F1" />
        <RoomEntry
          onCreate={createRoom}
          onJoin={joinRoom}
          error={error}
          busy={leavingRoom || connectionStatus === 'connecting' || connectionStatus === 'reconnecting'}
          busyLabel={leavingRoom ? 'LEAVING…' : undefined}
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
        />
      </SafeAreaView>
    );
  }

  const isPlaying = roomSnapshot.phase === 'playing';
  const isFinished = roomSnapshot.phase === 'finished';
  const canInteract = isPlaying && connectionStatus === 'connected';
  const canFlip = canInteract && Boolean(localPlayerId && localPlayerId === roomSnapshot.turn);
  const localWinner = roomSnapshot.winner === localPlayerId;
  const formattedTime = formatRemainingTime(roomSnapshot.remainingSeconds);
  const handleFlip = () => {
    if (!canFlip) return;
    flip();
    triggerGameFeedback('flip');
  };
  const handleDeckFlip = (player: PlayerId) => {
    if (player === localPlayerId) handleFlip();
  };
  const handleRing = () => {
    if (!canInteract) return;
    triggerGameFeedback('press');
    ring();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F5F1" />
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>PRIVATE ROOM · PLAYER {localPlayerId}</Text>
            <Text style={styles.title}>BellFive</Text>
          </View>
          <View style={styles.headerActions}>
            {formattedTime ? <View style={styles.timerPill}><Text style={styles.timerText}>{formattedTime}</Text></View> : null}
            <Pressable role="button" accessibilityLabel="Leave Room" onPress={leaveRoom} style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <Text style={styles.headerButtonText}>LEAVE</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.players}>
            {(['A', 'B'] as const).map(player => (
              <PlayerDeck
                key={player}
                player={player}
                drawCount={roomSnapshot.players[player].drawCount ?? 0}
                playedCount={roomSnapshot.players[player].playedCount ?? 0}
                isTurnOwner={roomSnapshot.turn === player}
                isLocalPlayer={localPlayerId === player}
                canFlip={canFlip && localPlayerId === player}
                onPress={() => handleDeckFlip(player)}
              />
            ))}
          </View>

          <View style={styles.turnStrip}>
            <View style={[styles.turnDot, roomSnapshot.turn === 'B' ? styles.turnDotB : styles.turnDotA, isFinished && styles.turnDotFinished]} />
            <View style={styles.turnCopy}>
              <Text style={styles.turnLabel}>
                {isFinished ? 'GAME OVER' : roomSnapshot.phase === 'connection-paused' || connectionStatus === 'reconnecting' ? 'CONNECTION PAUSED' : roomSnapshot.turn ? `PLAYER ${roomSnapshot.turn} TO FLIP` : 'READY'}
              </Text>
              <Text style={styles.turnHint}>
                {isFinished ? 'The round is complete' : roomSnapshot.phase === 'connection-paused' || connectionStatus === 'reconnecting' ? 'Waiting for both phones to reconnect' : canFlip ? 'Your turn — flip one card' : `Player ${roomSnapshot.turn ?? '—'} flips next`}
              </Text>
            </View>
            <Text style={styles.roomCode}>{roomCode}</Text>
          </View>

          {roomSnapshot.phase === 'connection-paused' || connectionStatus === 'reconnecting' ? (
            <View style={styles.pausedBanner}><Text style={styles.pausedText}>Connection paused</Text></View>
          ) : null}
          {error ? <View style={styles.errorBanner}><Text style={styles.errorText}>{error.message}</Text></View> : null}

          <View style={styles.tablePanel}>
            <View style={styles.tableHeading}>
              <Text style={styles.tableTitle}>THE TABLE</Text>
              <Text style={styles.tableHint}>TOP CARDS ONLY</Text>
            </View>
            <View testID="play-mat" style={styles.playMat}>
              <GameCard playerLabel="PLAYER A" card={roomSnapshot.players.A.topCard ?? undefined} active={isPlaying && roomSnapshot.turn === 'A'} />
              <GameCard playerLabel="PLAYER B" card={roomSnapshot.players.B.topCard ?? undefined} active={isPlaying && roomSnapshot.turn === 'B'} />
              {ringCue ? <CardTransferFly key={ringCue.version} event={ringCue} /> : null}
            </View>
          </View>

          {isFinished ? (
            <View style={styles.gameOver}>
              <Text style={styles.winnerLabel}>
                {roomSnapshot.winner === null ? 'DRAW' : localWinner ? 'YOU WIN' : 'YOU LOSE'}
              </Text>
              <Text style={styles.youWin}>
                {roomSnapshot.winner === null
                  ? roomSnapshot.remainingSeconds === 0 ? 'TIME UP · TIED GAME' : 'THE MATCH IS TIED'
                  : roomSnapshot.remainingSeconds === 0
                    ? `TIME UP · PLAYER ${roomSnapshot.winner} WINS`
                    : `PLAYER ${roomSnapshot.winner} WINS`}
              </Text>
            </View>
          ) : null}
          <DebugPanel snapshot={roomSnapshot} connectionStatus={connectionStatus} />
        </ScrollView>

        {isFinished ? (
          <View style={styles.finishedDock}>
            {localPlayerId === 'A' ? (
              <Pressable role="button" onPress={rematch} style={({ pressed }) => [styles.playAgain, pressed && styles.pressed]}>
                <Text style={styles.flipText}>PLAY AGAIN</Text>
              </Pressable>
            ) : <Text style={styles.finishedHint}>Waiting for Player A to start a rematch.</Text>}
          </View>
        ) : (
          <View style={styles.actionDock}>
            <Pressable
              role="button"
              aria-label="FLIP"
              accessibilityState={{ disabled: !canFlip }}
              disabled={!canFlip}
              onPress={handleFlip}
              style={({ pressed }) => [styles.flipButton, !canFlip && styles.disabledButton, pressed && canFlip && styles.pressed]}
            >
              <Text style={styles.flipText}>FLIP</Text>
              <Text style={styles.flipHint}>{canFlip ? `PLAYER ${localPlayerId}` : `WAIT · ${roomSnapshot.turn ?? '—'}`}</Text>
            </Pressable>
            <BellButton
              disabled={!canInteract}
              outcome={roomSnapshot.lastRingOutcome}
              animateOutcome={roomSnapshot.lastRingEvent?.caller === localPlayerId}
              feedbackKey={roomSnapshot.ringVersion ?? roomSnapshot.tableVersion}
              onRing={handleRing}
            />
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
  safeArea: { flex: 1, backgroundColor: '#F6F5F1' },
  screen: { flex: 1, paddingHorizontal: 18 },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  eyebrow: { color: '#87909B', fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: '#202B37', fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  timerPill: { minWidth: 66, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 10, borderRadius: 15, backgroundColor: '#FFF4D5' },
  timerText: { color: '#A97613', fontSize: 15, fontWeight: '900', fontVariant: ['tabular-nums'] },
  headerButton: { minWidth: 83, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 11, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E3E7' },
  headerButtonText: { color: '#596674', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 2, paddingBottom: 14 },
  players: { flexDirection: 'row', marginBottom: 12 },
  turnStrip: { minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, marginBottom: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E8E8E5', backgroundColor: '#FFFFFF' },
  turnDot: { width: 11, height: 11, marginRight: 10, borderRadius: 6 },
  turnDotA: { backgroundColor: '#E87572' },
  turnDotB: { backgroundColor: '#5A9FC1' },
  turnDotFinished: { backgroundColor: '#CFAC34' },
  turnCopy: { flex: 1 },
  turnLabel: { color: '#364451', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  turnHint: { marginTop: 2, color: '#78848F', fontSize: 10, fontWeight: '500' },
  roomCode: { color: '#7D8994', fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  pausedBanner: { alignItems: 'center', marginBottom: 10, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF1D7' },
  pausedText: { color: '#946B22', fontSize: 11, fontWeight: '800' },
  errorBanner: { marginBottom: 10, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#FBE6E3' },
  errorText: { color: '#9D453F', fontSize: 11, fontWeight: '700', textAlign: 'center' },
  tablePanel: { padding: 12, borderRadius: 27, borderWidth: 2, borderColor: '#C7D3EC', backgroundColor: '#E8EEFA' },
  tableHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 3 },
  tableTitle: { color: '#4E6487', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  tableHint: { color: '#8290A7', fontSize: 8, fontWeight: '800', letterSpacing: 0.8 },
  playMat: { position: 'relative', flexDirection: 'row', alignItems: 'stretch' },
  gameOver: { alignItems: 'center', paddingVertical: 12 },
  winnerLabel: { color: '#3D6078', fontSize: 19, fontWeight: '900', letterSpacing: 0.8 },
  youWin: { marginTop: 1, color: '#D46D69', fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  actionDock: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 4, borderTopWidth: 1, borderTopColor: '#E6E5E1', backgroundColor: '#F6F5F1' },
  flipButton: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', marginRight: 12, borderRadius: 23, borderWidth: 1, borderColor: '#E6AEB7', backgroundColor: '#F2C4CC' },
  disabledButton: { opacity: 0.5 },
  flipText: { color: '#633E45', fontSize: 20, fontWeight: '900', letterSpacing: 1.8 },
  flipHint: { marginTop: 1, color: '#865C63', fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  finishedDock: { alignItems: 'center', justifyContent: 'center', minHeight: 78, borderTopWidth: 1, borderTopColor: '#E6E5E1' },
  finishedHint: { color: '#65717C', fontSize: 12, fontWeight: '600' },
  playAgain: { width: '100%', minHeight: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#F2C4CC' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.98 }] },
});
