import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
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
  const rotation = useSharedValue(0);
  const slide = useSharedValue(0);
  const opacity = useSharedValue(1);
  const revealStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { perspective: 700 },
      { translateX: slide.value },
      { rotateY: `${rotation.value}deg` },
    ],
  }));

  useEffect(() => {
    if (!card) return;

    rotation.value = 82;
    slide.value = playerLabel.endsWith('A') ? -28 : 28;
    opacity.value = 0.55;
    rotation.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) });
    slide.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 190 });
  }, [card?.id, opacity, playerLabel, rotation, slide]);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{playerLabel} CURRENT CARD</Text>
      {card ? (
        <Animated.View style={[styles.symbols, revealStyle]}>
          {card.symbols.map((symbol, index) => (
            <Text key={`${card.id}-${index}`} style={styles.symbol}>
              {ELEMENT_EMOJI[symbol]}
            </Text>
          ))}
        </Animated.View>
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
