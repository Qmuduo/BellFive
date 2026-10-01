import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlayerId } from '../game/types';

type PlayerDeckProps = {
  player: PlayerId;
  drawCount: number;
  playedCount: number;
  isTurnOwner: boolean;
  isLocalPlayer: boolean;
  canFlip: boolean;
  onPress: () => void;
};

export function PlayerDeck({ player, drawCount, playedCount, isTurnOwner, isLocalPlayer, canFlip, onPress }: PlayerDeckProps) {
  const playerColor = player === 'A' ? styles.accentA : styles.accentB;
  const activeDeck = player === 'A' ? styles.activeDeckA : styles.activeDeckB;

  return (
    <Pressable
      role="button"
      aria-label={`Player ${player} deck`}
      accessibilityState={{ disabled: !canFlip }}
      disabled={!canFlip}
      onPress={onPress}
      style={({ pressed }) => [
        styles.deck,
        player === 'A' ? styles.deckA : styles.deckB,
        isTurnOwner && activeDeck,
        !isLocalPlayer && styles.opponentDeck,
        pressed && canFlip && styles.pressed,
      ]}
    >
      <View style={[styles.stackMark, playerColor]}>
        <Text style={styles.stackIcon}>▤</Text>
      </View>
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>PLAYER {player}</Text>
          {isLocalPlayer ? <Text style={[styles.activeTag, playerColor]}>YOU</Text> : null}
        </View>
        <Text style={styles.count}>{drawCount} cards</Text>
        <Text style={styles.played}>TABLE {playedCount}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  deck: {
    flex: 1,
    minWidth: 0,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  deckA: {
    marginRight: 6,
    borderColor: '#E9D4D1',
  },
  deckB: {
    marginLeft: 6,
    borderColor: '#D0E1EA',
  },
  activeDeckA: {
    borderColor: '#E87572',
    backgroundColor: '#FFF8F6',
    borderWidth: 2,
  },
  activeDeckB: {
    borderColor: '#5A9FC1',
    backgroundColor: '#F6FBFE',
    borderWidth: 2,
  },
  opponentDeck: {
    opacity: 0.9,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  stackMark: {
    width: 34,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  accentA: {
    backgroundColor: '#F7D5D0',
  },
  accentB: {
    backgroundColor: '#D7EBF5',
  },
  stackIcon: {
    color: '#43515E',
    fontSize: 22,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  name: {
    color: '#34424F',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  activeTag: {
    overflow: 'hidden',
    marginLeft: 6,
    color: '#34424F',
    fontSize: 7,
    fontWeight: '900',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 5,
  },
  count: {
    marginTop: 2,
    color: '#263340',
    fontSize: 15,
    fontWeight: '900',
  },
  played: {
    marginTop: 1,
    color: '#8A939C',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
