import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlayerId, RingOutcome } from '../game/types';

type BellButtonProps = {
  disabled: boolean;
  outcome: RingOutcome | null;
  onRing: (player: PlayerId) => void;
};

export function BellButton({ disabled, outcome, onRing }: BellButtonProps) {
  return (
    <View style={styles.container}>
      <View style={styles.bell}>
        <Text style={styles.bellIcon} accessibilityLabel="Bell">🔔</Text>
        <View style={styles.ringZones}>
          <Pressable
            role="button"
            aria-label="Player B ring"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onRing('B')}
            style={({ pressed }) => [styles.ringZone, styles.topZone, pressed && styles.pressed]}
          >
            <Text style={styles.zoneText}>PLAYER B RING</Text>
          </Pressable>
          <Pressable
            role="button"
            aria-label="Player A ring"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onRing('A')}
            style={({ pressed }) => [styles.ringZone, styles.bottomZone, pressed && styles.pressed]}
          >
            <Text style={styles.zoneText}>PLAYER A RING</Text>
          </Pressable>
        </View>
      </View>
      <Text
        accessibilityLiveRegion="polite"
        style={[
          styles.feedback,
          outcome === 'correct' && styles.correctFeedback,
          outcome === 'wrong' && styles.wrongFeedback,
        ]}
      >
        {outcome === 'correct'
          ? 'DING! Correct Ring'
          : outcome === 'wrong'
            ? 'Wrong Ring'
            : 'Tap your side to ring'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 10,
  },
  bell: {
    width: 190,
    minHeight: 118,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: '#B78913',
    backgroundColor: '#F4CC4D',
    shadowColor: '#6B5213',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 3,
  },
  bellIcon: {
    position: 'absolute',
    top: 17,
    fontSize: 43,
  },
  ringZones: {
    width: '100%',
    marginTop: 54,
  },
  ringZone: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 27,
  },
  topZone: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(73, 59, 16, 0.24)',
  },
  bottomZone: {},
  zoneText: {
    color: '#493B10',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.97 }],
  },
  feedback: {
    minHeight: 21,
    marginTop: 5,
    color: '#69747D',
    fontSize: 12,
    fontWeight: '800',
  },
  correctFeedback: {
    color: '#24724C',
  },
  wrongFeedback: {
    color: '#B23A32',
  },
});
