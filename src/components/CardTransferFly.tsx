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

type CardTransferFlyProps = Readonly<{ event: RingFeedbackEvent; localPlayerId: PlayerId }>;

export function CardTransferFly({ event, localPlayerId }: CardTransferFlyProps) {
  const cardCount = Math.min(Math.max(0, event.movedCardCount), 5);
  if (cardCount === 0) return null;

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
      {Array.from({ length: cardCount }, (_, index) => (
        <FlyingCard key={`${event.version}-${index}`} event={event} index={index} cardCount={cardCount} localPlayerId={localPlayerId} />
      ))}
      {(['A', 'B'] as const).map(player => feedbackByPlayer[player] ? (
        <Text
          key={player}
          testID={`player-feedback-${player}`}
          style={[styles.feedbackBadge, player === localPlayerId ? styles.badgeA : styles.badgeB]}
        >
          {feedbackByPlayer[player]}
        </Text>
      ) : null)}
    </View>
  );
}

function FlyingCard({
  event,
  index,
  cardCount,
  localPlayerId,
}: {
  event: RingFeedbackEvent;
  index: number;
  cardCount: number;
  localPlayerId: PlayerId;
}) {
  const progress = useSharedValue(0);
  const isCollection = event.outcome === 'correct';
  const opponent: PlayerId = event.caller === 'A' ? 'B' : 'A';
  const callerX = event.caller === localPlayerId ? -70 : 70;
  const opponentX = opponent === localPlayerId ? -70 : 70;
  const fanOffset = (index - (cardCount - 1) / 2) * 12;
  const fromX = isCollection ? fanOffset : callerX + fanOffset;
  const fromY = isCollection ? 0 : -260;
  const toX = isCollection ? callerX : opponentX;
  const toY = -260;
  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 0.72, 1], [0.98, 0.88, 0]),
      transform: [
        { translateX: fromX + (toX - fromX) * value },
        { translateY: fromY + (toY - fromY) * value },
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
    <Animated.View testID="flying-card" style={[styles.flyingCard, animatedStyle]}>
      <Text style={styles.cardBack}>✦</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flightLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, alignItems: 'center' },
  flyingCard: { position: 'absolute', top: '47%', left: '50%', marginLeft: -27, marginTop: -35, width: 54, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#C7B98F', backgroundColor: '#FFFDF8', shadowColor: '#352A11', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  cardBack: { color: '#CFB65E', fontSize: 23, fontWeight: '900' },
  feedbackBadge: { position: 'absolute', top: -195, minWidth: 42, alignItems: 'center', paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', borderRadius: 12, color: '#FFFFFF', fontSize: 12, fontWeight: '900', elevation: 4 },
  badgeA: { left: '17%', backgroundColor: '#D66B69' },
  badgeB: { left: '70%', backgroundColor: '#568CAB' },
});
