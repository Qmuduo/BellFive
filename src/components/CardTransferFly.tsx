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
import type { PlayerId } from '../game/types';
import type { RingFeedbackEvent } from '../network/protocol';

export type Point = Readonly<{ x: number; y: number }>;
export type TransferAnchors = Readonly<{
  deck: Readonly<Record<PlayerId, Point>>;
  table: Readonly<Record<PlayerId, Point>>;
}>;

type CardTransferFlyProps = Readonly<{
  event: RingFeedbackEvent;
  localPlayerId: PlayerId;
  anchors: TransferAnchors | null;
}>;

export function CardTransferFly({ event, localPlayerId, anchors }: CardTransferFlyProps) {
  const cardCount = Math.min(Math.max(0, event.movedCardCount), 5);
  if (cardCount === 0 || !anchors) return null;

  const opponent: PlayerId = event.caller === 'A' ? 'B' : 'A';
  const isCollection = event.outcome === 'correct';
  const testId = isCollection ? `collect-to-${event.caller}` : `transfer-${event.caller}-to-${opponent}`;
  const feedbackByPlayer: Record<PlayerId, string | null> = { A: null, B: null };
  if (isCollection) {
    feedbackByPlayer[event.caller] = `+${event.movedCardCount}`;
  } else {
    feedbackByPlayer[event.caller] = `−${event.movedCardCount}`;
    feedbackByPlayer[opponent] = `+${event.movedCardCount}`;
  }

  return (
    <View testID={testId} pointerEvents="none" style={styles.flightLayer}>
      {Array.from({ length: cardCount }, (_, index) => {
        const origin = isCollection
          ? anchors.table[index % 2 === 0 ? 'A' : 'B']
          : anchors.deck[event.caller];
        const destination = anchors.deck[isCollection ? event.caller : opponent];
        return (
          <FlyingCard
            key={`${event.version}-${index}`}
            event={event}
            index={index}
            cardCount={cardCount}
            origin={origin}
            destination={destination}
          />
        );
      })}
      {(['A', 'B'] as const).map(player => {
        const feedback = feedbackByPlayer[player];
        return feedback ? (
          <Text
            key={player}
            testID={`player-feedback-${player}`}
            style={[styles.feedbackBadge, badgePosition(anchors.deck[player]), player === localPlayerId ? styles.badgeA : styles.badgeB]}
          >
            {feedback}
          </Text>
        ) : null;
      })}
    </View>
  );
}

function FlyingCard({
  event,
  index,
  cardCount,
  origin,
  destination,
}: {
  event: RingFeedbackEvent;
  index: number;
  cardCount: number;
  origin: Point;
  destination: Point;
}) {
  const progress = useSharedValue(0);
  const fanOffset = (index - (cardCount - 1) / 2) * 10;
  const start = { x: origin.x + fanOffset, y: origin.y + (event.outcome === 'correct' ? 0 : fanOffset * 0.2) };
  const end = { x: destination.x + fanOffset * 0.18, y: destination.y };
  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 0.72, 1], [0.98, 0.88, 0]),
      transform: [
        { translateX: (end.x - start.x) * value },
        { translateY: (end.y - start.y) * value },
        { rotate: `${fanOffset * value * 0.35}deg` },
        { scale: interpolate(value, [0, 1], [1, 0.58]) },
      ],
    };
  });

  useEffect(() => {
    progress.value = withDelay(
      index * 35,
      withTiming(1, { duration: 470, easing: Easing.in(Easing.cubic) }),
    );
  }, [index, progress]);

  return (
    <Animated.View
      testID="flying-card"
      style={[styles.flyingCard, { left: start.x - 27, top: start.y - 35 }, animatedStyle]}
    >
      <Text style={styles.cardBack}>✦</Text>
    </Animated.View>
  );
}

function badgePosition(point: Point) {
  return { left: point.x - 24, top: Math.max(2, point.y - 42) };
}

const styles = StyleSheet.create({
  flightLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  flyingCard: { position: 'absolute', width: 54, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#C7B98F', backgroundColor: '#FFFDF8', shadowColor: '#352A11', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  cardBack: { color: '#CFB65E', fontSize: 23, fontWeight: '900' },
  feedbackBadge: { position: 'absolute', minWidth: 48, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', borderRadius: 12, color: '#FFFFFF', fontSize: 12, fontWeight: '900', elevation: 4, textAlign: 'center' },
  badgeA: { backgroundColor: '#7040C4' },
  badgeB: { backgroundColor: '#568CAB' },
});
