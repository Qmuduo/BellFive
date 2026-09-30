import { StyleSheet, Text, View } from 'react-native';
import type { CardDefinition, GameElement } from '../game/types';

const ELEMENT_EMOJI: Record<GameElement, string> = {
  banana: '🍌',
  grape: '🍇',
  pear: '🍐',
  strawberry: '🍓',
  peach: '🍑',
  bell: '🔔',
};

type GameCardProps = {
  playerLabel: string;
  card?: CardDefinition;
};

export function GameCard({ playerLabel, card }: GameCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{playerLabel} CURRENT CARD</Text>
      {card ? (
        <View style={styles.symbols}>
          {card.symbols.map((symbol, index) => (
            <Text key={`${card.id}-${index}`} style={styles.symbol}>
              {ELEMENT_EMOJI[symbol]}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No card flipped</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 16,
    borderColor: '#D8D1C3',
    borderWidth: 1,
    backgroundColor: '#FFFDF8',
  },
  label: {
    color: '#69747D',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  symbols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 8,
  },
  symbol: {
    marginHorizontal: 3,
    fontSize: 30,
  },
  empty: {
    marginTop: 10,
    color: '#9AA2A8',
    fontSize: 15,
  },
});
