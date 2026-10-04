import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import type { RingOutcome } from '../game/types';
import { useTranslation } from '../i18n/useTranslation';

type BellButtonProps = Readonly<{
  disabled: boolean;
  outcome: RingOutcome | null;
  animateOutcome?: boolean;
  feedbackKey?: string | number | null;
  onRing: () => void;
}>;

export function BellButton({
  disabled,
  outcome,
  animateOutcome = true,
  feedbackKey,
  onRing,
}: BellButtonProps) {
  const { t } = useTranslation();
  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const bellAnimation = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }, { scale: scale.value }],
  }));

  useEffect(() => {
    if (!animateOutcome) return;
    if (outcome === 'correct') {
      scale.value = withSequence(withTiming(1.12, { duration: 100 }), withSpring(1));
    } else if (outcome === 'wrong') {
      shake.value = withSequence(
        withTiming(-7, { duration: 45 }),
        withTiming(7, { duration: 55 }),
        withTiming(-5, { duration: 45 }),
        withTiming(0, { duration: 55 }),
      );
    }
  }, [animateOutcome, outcome, feedbackKey, scale, shake]);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.bell, bellAnimation]}>
        <Pressable
          role="button"
          accessibilityLabel={t('bell.accessibility')}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onRing}
          onPressIn={() => { scale.value = withSpring(0.92, { damping: 14, stiffness: 280 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 240 }); }}
          style={({ pressed }) => [styles.ringButton, pressed && styles.pressed]}
        >
          <Text pointerEvents="none" style={styles.bellIcon}>🔔</Text>
          <Text pointerEvents="none" style={styles.ringLabel}>{t('bell.ring')}</Text>
        </Pressable>
      </Animated.View>
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.feedback,
          outcome === 'correct' && styles.correctFeedback,
          outcome === 'wrong' && styles.wrongFeedback,
        ]}
      >
        {outcome === 'correct' ? t('bell.correct') : outcome === 'wrong' ? t('bell.wrong') : t('bell.anytime')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: 116, alignItems: 'center' },
  bell: {
    width: 98,
    height: 98,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 49,
    borderWidth: 2,
    borderColor: '#C6981E',
    backgroundColor: '#F4CA42',
    shadowColor: '#6B5213',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 7,
    elevation: 4,
    overflow: 'hidden',
  },
  ringButton: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  bellIcon: { fontSize: 36, lineHeight: 43 },
  ringLabel: { color: '#493B10', fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  pressed: { opacity: 0.72 },
  feedback: { minHeight: 19, marginTop: 4, color: '#69747D', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  correctFeedback: { color: '#24724C' },
  wrongFeedback: { color: '#B23A32' },
});
