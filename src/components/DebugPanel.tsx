import { StyleSheet, Text, View } from 'react-native';
import { canRing, countVisibleItems } from '../game/rules';
import type { GameState } from '../game/types';

type DebugPanelProps = {
  game: GameState | null;
};

export function DebugPanel({ game }: DebugPanelProps) {
  const counts = game ? countVisibleItems(game) : null;
  const ringAvailable = counts ? canRing(counts) : false;

  return (
    <View style={styles.panel}>
      <Text style={styles.heading}>DEBUG</Text>
      <Text style={styles.line}>Turn: {game?.turn ?? '—'}</Text>
      <Text style={styles.line}>A draw pile: {game?.players.A.drawPile.length ?? 0}</Text>
      <Text style={styles.line}>A played pile: {game?.players.A.playedPile.length ?? 0}</Text>
      <Text style={styles.line}>B draw pile: {game?.players.B.drawPile.length ?? 0}</Text>
      <Text style={styles.line}>B played pile: {game?.players.B.playedPile.length ?? 0}</Text>
      <Text style={[styles.line, styles.section]}>Visible fruit counts:</Text>
      <Text style={styles.line}>banana: {counts?.banana ?? 0}</Text>
      <Text style={styles.line}>grape: {counts?.grape ?? 0}</Text>
      <Text style={styles.line}>pear: {counts?.pear ?? 0}</Text>
      <Text style={styles.line}>strawberry: {counts?.strawberry ?? 0}</Text>
      <Text style={styles.line}>peach: {counts?.peach ?? 0}</Text>
      <Text style={styles.line}>wild: {counts?.wildBellCount ?? 0}</Text>
      <Text style={[styles.line, styles.section]}>Can Ring: {String(ringAvailable)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#EAE5DB',
  },
  heading: {
    marginBottom: 4,
    color: '#4C5861',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  line: {
    color: '#4C5861',
    fontSize: 10,
    lineHeight: 14,
  },
  section: {
    marginTop: 3,
    fontWeight: '700',
  },
});
