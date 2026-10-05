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
  compact?: boolean;
  locked?: boolean;
  showFeedback?: boolean;
}>;

export function BellButton({
  disabled,
  outcome,
  animateOutcome = true,
  feedbackKey,
  onRing,
  compact = false,
  locked = false,
  showFeedback = true,
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
      <Animated.View style={[styles.bell, compact && styles.compactBell, bellAnimation]}>
        <Pressable
          role="button"
          accessibilityLabel={t('bell.accessibility')}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onRing}
          onPressIn={() => { scale.value = withSpring(0.92, { damping: 14, stiffness: 280 }); }}
          onPressOut={() => { scale.value = withSpring(1, { damping: 12, stiffness: 240 }); }}
          style={({ pressed }) => [styles.ringButton, compact && styles.compactRingButton, disabled && styles.disabledButton, pressed && !disabled && styles.pressed]}
        >
          <Text pointerEvents="none" style={styles.bellIcon}>🔔</Text>
          <Text pointerEvents="none" style={styles.ringLabel}>{t('bell.ring')}</Text>
          <Text pointerEvents="none" style={styles.ringHint}>{t('match.rightHand')}</Text>
        </Pressable>
      </Animated.View>
      {showFeedback ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.feedback,
            outcome === 'correct' && styles.correctFeedback,
            outcome === 'wrong' && styles.wrongFeedback,
          ]}
        >
          {locked ? t('match.ringLocked') : outcome === 'correct' ? t('bell.correct') : outcome === 'wrong' ? t('bell.wrong') : t('bell.anytime')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0, alignItems: 'stretch' },
  bell: {
    flex: 1,
    minHeight: 116,
    alignItems: 'stretch',
    justifyContent: 'center',
    borderRadius: 16,
    overflow: 'hidden',
  },
  ringButton: { flex: 1, minHeight: 116, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 2, borderColor: '#34214F', backgroundColor: '#E3FB88', shadowColor: '#8FA546', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 0, elevation: 4 },
  compactBell: { minHeight: 88 },
  compactRingButton: { minHeight: 88 },
  bellIcon: { fontSize: 24, lineHeight: 29 },
  ringLabel: { color: '#34214F', fontSize: 24, fontWeight: '900', letterSpacing: 1.5 },
  ringHint: { marginTop: 4, color: '#57466F', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  disabledButton: { backgroundColor: '#675977', borderColor: '#675977' },
  pressed: { opacity: 0.72 },
  feedback: { minHeight: 14, marginTop: 5, color: '#C6B5DF', fontSize: 9, fontWeight: '800', textAlign: 'center' },
  correctFeedback: { color: '#24724C' },
  wrongFeedback: { color: '#B23A32' },
});
