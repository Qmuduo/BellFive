import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RingFeedbackEvent } from '../network/protocol';
import type { PlayerId } from '../game/types';

type RingActivityLogProps = Readonly<{
  events: readonly RingFeedbackEvent[];
  localPlayerId: PlayerId;
}>;

export function RingActivityLog({ events, localPlayerId }: RingActivityLogProps) {
  const scrollRef = useRef<ScrollView>(null);
  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>RING LOG</Text>
        <Text style={styles.count}>{events.length}/12</Text>
      </View>
      {events.length === 0 ? (
        <Text style={styles.empty}>No ring calls yet.</Text>
      ) : (
        <ScrollView
          ref={scrollRef}
          accessibilityLabel="Ring activity log"
          style={styles.scroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {events.map(event => (
            <View key={event.version} style={styles.row}>
              <View style={[styles.dot, event.outcome === 'correct' ? styles.correctDot : styles.wrongDot]} />
              <Text style={styles.message}>{formatRingActivity(event, localPlayerId)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function formatRingActivity(event: RingFeedbackEvent, localPlayerId: PlayerId): string {
  const isLocalCaller = event.caller === localPlayerId;
  const callerName = event.caller === 'A' ? '1号玩家' : '2号玩家';
  const count = event.movedCardCount;

  if (event.outcome === 'correct') {
    if (count === 0) return isLocalCaller ? '拍铃正确，桌面没有可收取的牌' : `${callerName}拍铃正确，桌面没有可收取的牌`;
    return isLocalCaller ? `拍铃正确，获得 ${count} 张牌` : `${callerName}拍铃正确，获得 ${count} 张牌`;
  }
  if (count === 0) return isLocalCaller ? '拍铃错误，没有牌可交出' : `${callerName}拍铃错误，没有牌转移`;
  return isLocalCaller ? `拍铃错误，交出 ${count} 张牌` : `${callerName}拍铃错误，你获得 ${count} 张牌`;
}

const styles = StyleSheet.create({
  panel: { marginTop: 12, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 7, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7E9', backgroundColor: '#FFFFFF' },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  heading: { color: '#56616B', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  count: { color: '#929AA2', fontSize: 8, fontWeight: '800' },
  scroll: { maxHeight: 116 },
  row: { minHeight: 29, flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F1F0' },
  dot: { width: 6, height: 6, marginRight: 8, borderRadius: 3 },
  correctDot: { backgroundColor: '#48A878' },
  wrongDot: { backgroundColor: '#D76D67' },
  message: { flex: 1, color: '#53616D', fontSize: 10, fontWeight: '700' },
  empty: { paddingVertical: 8, color: '#9AA2A9', fontSize: 10 },
});
