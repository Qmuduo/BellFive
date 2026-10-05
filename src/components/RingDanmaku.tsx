import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { RingFeedbackEvent } from '../network/protocol';

type RingDanmakuProps = Readonly<{
  event: RingFeedbackEvent;
  message: string;
  lane: number;
  laneCount: number;
  onComplete: (event: RingFeedbackEvent) => void;
}>;

export const RingDanmaku = memo(function RingDanmaku({ event, message, lane, laneCount, onComplete }: RingDanmakuProps) {
  const { width: windowWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const [textWidth, setTextWidth] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const eventRef = useRef(event);
  const completedRef = useRef(false);
  onCompleteRef.current = onComplete;
  eventRef.current = event;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current(eventRef.current);
  }, []);

  useEffect(() => {
    if (textWidth <= 0 || windowWidth <= 0) return;

    completedRef.current = false;
    translateX.value = windowWidth + 12;
    translateX.value = withTiming(-textWidth - 12, {
      duration: 2300 + lane * 140,
      easing: Easing.linear,
    }, finished => {
      if (finished) runOnJS(finish)();
    });

    return () => cancelAnimation(translateX);
  }, [finish, lane, textWidth, translateX, windowWidth]);

  const laneTop = `${((lane + 0.5) / laneCount) * 100}%` as `${number}%`;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <Animated.View
        pointerEvents="none"
        onLayout={event => setTextWidth(event.nativeEvent.layout.width)}
        style={[styles.track, { top: laneTop }, animatedStyle]}
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            styles.message,
            event.outcome === 'correct' ? styles.correctMessage : styles.wrongMessage,
            { maxWidth: Math.max(120, windowWidth - 48) },
          ]}
        >
          {message}
        </Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
    overflow: 'visible',
  },
  track: {
    position: 'absolute',
    left: 0,
    marginTop: -12,
  },
  message: {
    fontSize: 15,
    fontWeight: '900',
    textShadowColor: 'rgba(36, 27, 50, 0.88)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 2,
  },
  correctMessage: { color: '#A8FFB4' },
  wrongMessage: { color: '#FF9B8C' },
});
