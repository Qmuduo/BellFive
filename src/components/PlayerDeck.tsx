import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlayerId } from '../game/types';

type PlayerDeckProps = {
  player: PlayerId;
  drawCount: number;
  playedCount: number;
  active: boolean;
  onPress: () => void;
};

export function PlayerDeck({ player, drawCount, playedCount, active, onPress }: PlayerDeckProps) {
  return (
    <Pressable
      role="button"
      aria-label={`Player ${player} deck`}
      accessibilityState={{ disabled: !active }}
      disabled={!active}
      onPress={onPress}
      style={({ pressed }) => [
        styles.deck,
        active && styles.activeDeck,
        pressed && active && styles.pressed,
      ]}
    >
      <View style={styles.stackMark}>
        <Text style={styles.stackIcon}>▤</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.name}>PLAYER {player}</Text>
        <Text style={styles.count}>{drawCount} cards remaining</Text>
        <Text style={styles.played}>Played pile: {playedCount}</Text>
        <Text style={styles.hint}>{active ? 'Tap deck to flip' : 'Waiting for turn'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deck: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DED8CD',
    backgroundColor: '#F0EADF',
  },
  activeDeck: {
    borderColor: '#D4A719',
    backgroundColor: '#FFF4C9',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  stackMark: {
    width: 44,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#9C7D24',
    backgroundColor: '#F8D85B',
  },
  stackIcon: {
    color: '#574510',
    fontSize: 27,
  },
  copy: {
    marginLeft: 12,
  },
  name: {
    color: '#28333B',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  count: {
    marginTop: 2,
    color: '#28333B',
    fontSize: 15,
    fontWeight: '700',
  },
  played: {
    color: '#69747D',
    fontSize: 11,
  },
  hint: {
    marginTop: 2,
    color: '#8A701F',
    fontSize: 10,
    fontWeight: '600',
  },
});
