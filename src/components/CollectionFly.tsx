import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import type { CardDefinition, GameElement, PlayerId } from '../game/types';

const ELEMENT_EMOJI: Record<GameElement, string> = {
  banana: '🍌',
  grape: '🍇',
  pear: '🍐',
  strawberry: '🍓',
  peach: '🍑',
  bell: '🔔',
};

type CollectionFlyProps = {
  cards: readonly CardDefinition[];
  caller: PlayerId;
};

export function CollectionFly({ cards, caller }: CollectionFlyProps) {
  return (
    <View pointerEvents="none" style={styles.flightLayer}>
      {cards.slice(0, 5).map((card, index) => (
        <FlyingCard key={card.id} card={card} index={index} caller={caller} />
      ))}
    </View>
  );
}

function FlyingCard({
  card,
  index,
  caller,
}: {
  card: CardDefinition;
  index: number;
  caller: PlayerId;
}) {
  const progress = useSharedValue(0);
  const destinationY = caller === 'A' ? 112 : -112;
  const fanOffset = (index - 2) * 15;
  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 0.68, 1], [0.98, 0.88, 0]),
      transform: [
        { translateX: fanOffset * (1 - value) },
        { translateY: destinationY * value },
        { rotate: `${fanOffset * value * 0.35}deg` },
        { scale: interpolate(value, [0, 1], [1, 0.58]) },
      ],
    };
  });

  useEffect(() => {
    progress.value = withDelay(
      index * 34,
      withTiming(1, { duration: 390, easing: Easing.in(Easing.cubic) }),
    );
  }, [index, progress]);

  return (
    <Animated.View style={[styles.flyingCard, animatedStyle]}>
      {card.symbols.slice(0, 2).map((symbol, symbolIndex) => (
        <Text key={`${card.id}-${symbolIndex}`} style={styles.cardSymbol}>
          {ELEMENT_EMOJI[symbol]}
        </Text>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flightLayer: {
    position: 'absolute',
    top: '47%',
    left: 0,
    right: 0,
    height: 76,
    zIndex: 10,
    alignItems: 'center',
  },
  flyingCard: {
    position: 'absolute',
    width: 54,
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#C7B98F',
    backgroundColor: '#FFFDF8',
    shadowColor: '#352A11',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cardSymbol: {
    marginHorizontal: 1,
    fontSize: 16,
  },
});
