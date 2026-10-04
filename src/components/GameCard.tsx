import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { CardDefinition, GameElement, PlayerId } from '../game/types';
import { getCardSymbolPositions } from '../game/cardLayout';
import { useTranslation } from '../i18n/useTranslation';

const ELEMENT_EMOJI: Record<GameElement, string> = {
  banana: '🍌',
  grape: '🍇',
  pear: '🍐',
  strawberry: '🍓',
  peach: '🍑',
  bell: '🔔',
};

type GameCardProps = {
  playerId: PlayerId;
  playerLabel: string;
  card?: CardDefinition;
  active?: boolean;
};

export function GameCard({ playerId, playerLabel, card, active = false }: GameCardProps) {
  const { t } = useTranslation();
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
    slide.value = playerId === 'A' ? -28 : 28;
    opacity.value = 0.55;
    rotation.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) });
    slide.value = withTiming(0, { duration: 230, easing: Easing.out(Easing.cubic) });
    opacity.value = withTiming(1, { duration: 190 });
  }, [card?.id, opacity, playerId, rotation, slide]);

  const activeStyle = playerId === 'A' ? styles.activeA : styles.activeB;
  const symbolPositions = card
    ? getCardSymbolPositions(card.id, card.symbols.length)
    : [];

  return (
    <View style={[styles.card, active && activeStyle]}>
      <Text style={styles.label}>{playerLabel}</Text>
      {card ? (
        <Animated.View style={[styles.symbols, revealStyle]}>
          {card.symbols.map((symbol, index) => {
            const position = symbolPositions[index];
            return (
              <Text
                key={`${card.id}-${index}`}
                style={[styles.symbol, { left: `${position.x * 100}%`, top: `${position.y * 100}%` }]}
              >
                {ELEMENT_EMOJI[symbol]}
              </Text>
            );
          })}
        </Animated.View>
      ) : (
        <View style={styles.emptyArea}>
          <Text style={styles.empty}>—</Text>
          <Text style={styles.emptyHint}>{t('card.ready')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 218,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 21,
    borderColor: '#DDD9E9',
    borderWidth: 1.5,
    borderStyle: 'solid',
    backgroundColor: '#FFFFFF',
    shadowColor: '#43516A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 2,
  },
  activeA: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E87572',
  },
  activeB: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#5A9FC1',
  },
  label: {
    color: '#78828F',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  symbols: {
    flex: 1,
    width: '100%',
    marginTop: 5,
  },
  symbol: {
    position: 'absolute',
    width: 38,
    marginLeft: -19,
    marginTop: -20,
    fontSize: 30,
    lineHeight: 40,
    textAlign: 'center',
  },
  emptyArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: '#D2D9E5',
    fontSize: 34,
    fontWeight: '300',
  },
  emptyHint: {
    marginTop: 2,
    color: '#A0A9B5',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
