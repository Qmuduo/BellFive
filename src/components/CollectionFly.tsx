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

type CollectionFlyProps = Readonly<{
  count: number;
  caller: PlayerId;
}>;

export function CollectionFly({ count, caller }: CollectionFlyProps) {
  const cardCount = Math.min(Math.max(0, count), 5);
  return (
    <View pointerEvents="none" style={styles.flightLayer}>
      {Array.from({ length: cardCount }, (_, index) => (
        <FlyingCard key={index} index={index} caller={caller} />
      ))}
      {count > 5 ? <Text style={styles.countBadge}>+{count - 5}</Text> : null}
    </View>
  );
}

function FlyingCard({ index, caller }: { index: number; caller: PlayerId }) {
  const progress = useSharedValue(0);
  const destinationX = caller === 'A' ? -86 : 86;
  const destinationY = -112;
  const fanOffset = (index - 2) * 15;
  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 0.68, 1], [0.98, 0.88, 0]),
      transform: [
        { translateX: fanOffset * (1 - value) + destinationX * value },
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

  return <Animated.View style={[styles.flyingCard, animatedStyle]}><Text style={styles.cardBack}>✦</Text></Animated.View>;
}

const styles = StyleSheet.create({
  flightLayer: { position: 'absolute', top: '47%', left: 0, right: 0, height: 76, zIndex: 10, alignItems: 'center' },
  flyingCard: { position: 'absolute', width: 54, height: 70, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: '#C7B98F', backgroundColor: '#FFFDF8', shadowColor: '#352A11', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  cardBack: { color: '#CFB65E', fontSize: 23, fontWeight: '900' },
  countBadge: { position: 'absolute', top: 0, left: '57%', paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden', borderRadius: 9, color: '#FFFFFF', backgroundColor: '#566C8D', fontSize: 10, fontWeight: '900' },
});
