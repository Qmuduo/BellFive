import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DebugPanel } from './DebugPanel';
import { BellButton } from './BellButton';
import { GameCard } from './GameCard';
import { PlayerDeck } from './PlayerDeck';
import { useGameStore } from '../store/gameStore';

export default function GameScreen() {
  const game = useGameStore(state => state.game);
  const startGame = useGameStore(state => state.startGame);
  const restartGame = useGameStore(state => state.restartGame);
  const flip = useGameStore(state => state.flip);
  const flipForPlayer = useGameStore(state => state.flipForPlayer);
  const ringForPlayer = useGameStore(state => state.ringForPlayer);

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
            <Text style={styles.restartText}>{game ? 'RESTART' : 'START GAME'}</Text>
          </Pressable>
        </View>

        <PlayerDeck
          player="B"
          drawCount={game?.players.B.drawPile.length ?? 0}
          playedCount={game?.players.B.playedPile.length ?? 0}
          active={game?.turn === 'B'}
          onPress={() => flipForPlayer('B')}
        />
        <GameCard playerLabel="PLAYER B" card={game?.players.B.playedPile[0]} />

        <View style={styles.turnArea}>
          <Text style={styles.turnLabel}>
            {game ? `PLAYER ${game.turn}'S TURN` : 'Ready to play?'}
          </Text>
          <BellButton
            disabled={!game || game.status !== 'playing'}
            outcome={game?.lastRingOutcome ?? null}
            onRing={player => ringForPlayer(player)}
          />
          <Pressable
            role="button"
            aria-label="FLIP"
            accessibilityState={{ disabled: !game }}
            disabled={!game}
            onPress={flip}
            style={({ pressed }) => [styles.flipButton, pressed && game && styles.pressed]}
          >
            <Text style={styles.flipText}>FLIP</Text>
          </Pressable>
          <Text style={styles.turnHint}>
            {game ? `Player ${game.turn} flips next` : 'Start a game to begin'}
          </Text>
        </View>

        <GameCard playerLabel="PLAYER A" card={game?.players.A.playedPile[0]} />
        <PlayerDeck
          player="A"
          drawCount={game?.players.A.drawPile.length ?? 0}
          playedCount={game?.players.A.playedPile.length ?? 0}
          active={game?.turn === 'A'}
          onPress={() => flipForPlayer('A')}
        />

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
