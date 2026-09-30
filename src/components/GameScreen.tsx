import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DebugPanel } from './DebugPanel';
import { BellButton } from './BellButton';
import { CollectionFly } from './CollectionFly';
import { GameCard } from './GameCard';
import { PlayerDeck } from './PlayerDeck';
import { useGameStore } from '../store/gameStore';
import { triggerGameFeedback } from '../services/gameFeedback';
import type { PlayerId } from '../game/types';

export default function GameScreen() {
  const audioPlayer = useAudioPlayer(require('../../assets/audio/bell.wav'));
  const game = useGameStore(state => state.game);
  const startGame = useGameStore(state => state.startGame);
  const restartGame = useGameStore(state => state.restartGame);
  const flip = useGameStore(state => state.flip);
  const flipForPlayer = useGameStore(state => state.flipForPlayer);
  const ringForPlayer = useGameStore(state => state.ringForPlayer);
  const [collectionCue, setCollectionCue] = useState<{
    id: number;
    caller: PlayerId;
    cards: NonNullable<typeof game>['players']['A']['playedPile'];
  } | null>(null);
  const collectionSequence = useRef(0);

  useEffect(() => {
    if (!collectionCue) return;
    const timeout = setTimeout(() => {
      setCollectionCue(current => (current?.id === collectionCue.id ? null : current));
    }, 560);
    return () => clearTimeout(timeout);
  }, [collectionCue]);

  const handleFlip = () => {
    const currentGame = useGameStore.getState().game;
    const canFlip =
      currentGame?.status === 'playing' && currentGame.players[currentGame.turn].drawPile.length > 0;
    flip();
    if (canFlip) triggerGameFeedback('flip');
  };

  const handleDeckFlip = (player: PlayerId) => {
    const currentGame = useGameStore.getState().game;
    const canFlip =
      currentGame?.status === 'playing' &&
      currentGame.turn === player &&
      currentGame.players[player].drawPile.length > 0;
    flipForPlayer(player);
    if (canFlip) triggerGameFeedback('flip');
  };

  const handleRing = (player: PlayerId) => {
    const currentGame = useGameStore.getState().game;
    const result = ringForPlayer(player);
    if (!result) return;

    if (result.outcome === 'correct') {
      triggerGameFeedback('correct', audioPlayer);
      if (currentGame) {
        setCollectionCue({
          id: ++collectionSequence.current,
          caller: player,
          cards: [...currentGame.players.A.playedPile, ...currentGame.players.B.playedPile],
        });
      }
    } else {
      triggerGameFeedback('wrong');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>BellFive</Text>
            <Text style={styles.subtitle}>Local two-player game</Text>
          </View>
          <Pressable
            role="button"
            aria-label={game ? 'Restart Game' : 'Start Game'}
            onPress={game ? restartGame : startGame}
            style={({ pressed }) => [styles.restartButton, pressed && styles.pressed]}
          >
            <Text style={styles.restartText}>{game ? 'RESTART GAME' : 'START GAME'}</Text>
          </Pressable>
        </View>

        <PlayerDeck
          player="B"
          drawCount={game?.players.B.drawPile.length ?? 0}
          playedCount={game?.players.B.playedPile.length ?? 0}
          active={game?.status === 'playing' && game.turn === 'B'}
          onPress={() => handleDeckFlip('B')}
        />
        <GameCard playerLabel="PLAYER B" card={game?.players.B.playedPile[0]} />

        <View style={styles.turnArea}>
          <Text style={styles.turnLabel}>
            {game?.status === 'finished'
              ? 'GAME OVER'
              : game
                ? `PLAYER ${game.turn}'S TURN`
                : 'Ready to play?'}
          </Text>
          {game?.status === 'finished' ? (
            <View style={styles.gameOver}>
              <Text style={styles.winnerLabel}>PLAYER {game.winner} WINS</Text>
              <Text style={styles.youWin}>YOU WIN</Text>
            </View>
          ) : (
            <>
              <BellButton
                disabled={!game || game.status !== 'playing'}
                outcome={game?.lastRingOutcome ?? null}
                onRing={handleRing}
              />
              <Pressable
                role="button"
                aria-label="FLIP"
                accessibilityState={{ disabled: !game }}
                disabled={!game}
                onPress={handleFlip}
                style={({ pressed }) => [styles.flipButton, pressed && game && styles.pressed]}
              >
                <Text style={styles.flipText}>FLIP</Text>
              </Pressable>
              <Text style={styles.turnHint}>
                {game ? `Player ${game.turn} flips next` : 'Start a game to begin'}
              </Text>
            </>
          )}
        </View>

        <GameCard playerLabel="PLAYER A" card={game?.players.A.playedPile[0]} />
        <PlayerDeck
          player="A"
          drawCount={game?.players.A.drawPile.length ?? 0}
          playedCount={game?.players.A.playedPile.length ?? 0}
          active={game?.status === 'playing' && game.turn === 'A'}
          onPress={() => handleDeckFlip('A')}
        />

        {collectionCue ? (
          <CollectionFly
            key={collectionCue.id}
            cards={collectionCue.cards}
            caller={collectionCue.caller}
          />
        ) : null}
        <DebugPanel game={game} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  content: {
    position: 'relative',
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    color: '#1F2933',
    fontSize: 25,
    fontWeight: '900',
  },
  subtitle: {
    color: '#69747D',
    fontSize: 12,
  },
  restartButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2D614A',
  },
  restartText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  turnArea: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  turnLabel: {
    color: '#28333B',
    fontSize: 17,
    fontWeight: '800',
  },
  gameOver: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  winnerLabel: {
    color: '#2D614A',
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  youWin: {
    marginTop: 5,
    color: '#C18D13',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 2,
  },
  flipButton: {
    width: 110,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    borderRadius: 18,
    backgroundColor: '#F0C63F',
    borderColor: '#C19A1E',
    borderWidth: 2,
  },
  flipText: {
    color: '#493B10',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  turnHint: {
    marginTop: 5,
    color: '#69747D',
    fontSize: 11,
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.98 }],
  },
});
