import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { CardDefinition, GameElement, PlayerId } from '../game/types';
import { getCardSymbolPositions } from '../game/cardLayout';
import { useTranslation } from '../i18n/useTranslation';
import { playerSeatLabel } from '../i18n/translations';

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
  drawCount?: number;
  playedCount?: number;
  isLocalPlayer?: boolean;
  canFlip?: boolean;
  onPress?: () => void;
  compact?: boolean;
};

export function GameCard({ playerId, playerLabel, card, active = false, drawCount = 0, playedCount = 0, isLocalPlayer = false, canFlip = false, onPress, compact = false }: GameCardProps) {
  const { language, t } = useTranslation();
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
    <Pressable role="button" accessibilityLabel={t('game.playerDeck', { playerLabel: playerSeatLabel(playerId, language) })} accessibilityState={{ disabled: !canFlip }} disabled={!canFlip} onPress={onPress} style={({ pressed }) => [styles.card, compact && styles.compactCard, active && activeStyle, pressed && canFlip && styles.pressed]}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.label, isLocalPlayer && styles.localLabel]}>{playerLabel}</Text>
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
      <View style={styles.cardCounts}><Text style={styles.count}>{t('deck.cards', { count: drawCount, cardWord: t(drawCount === 1 ? 'deck.cardWord.one' : 'deck.cardWord.many') })}</Text><Text style={styles.played}>{t('deck.table', { count: playedCount })}</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 8,
    borderRadius: 12,
    borderColor: '#2F194C',
    borderWidth: 2,
    borderStyle: 'solid',
    backgroundColor: '#FFFDF8',
    shadowColor: '#43516A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 2,
  },
  activeA: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#7040C4',
  },
  activeB: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#7040C4',
  },
  label: {
    color: '#2F194C',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    width: '100%',
    marginBottom: 5,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: '#E2D5FF',
    textAlign: 'center',
  },
  localLabel: { backgroundColor: '#7040C4', color: '#F5F0FF' },
  cardCounts: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 2, paddingTop: 6 },
  count: { color: '#2F194C', fontSize: 11, fontWeight: '800', flexShrink: 1 },
  played: { color: '#796887', fontSize: 10, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  pressed: { opacity: 0.8 },
  compactCard: { minHeight: 152, paddingVertical: 5 },
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
    fontSize: 28,
    lineHeight: 34,
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
