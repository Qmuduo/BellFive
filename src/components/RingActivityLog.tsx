import { useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RingFeedbackEvent } from '../network/protocol';
import type { PlayerId } from '../game/types';
import { translate } from '../i18n/translations';
import type { Language } from '../i18n/types';
import { useTranslation } from '../i18n/useTranslation';

type RingActivityLogProps = Readonly<{
  events: readonly RingFeedbackEvent[];
  localPlayerId: PlayerId;
}>;

export function RingActivityLog({ events, localPlayerId }: RingActivityLogProps) {
  const { language, t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t('log.heading')}</Text>
        <Text style={styles.count}>{events.length}/12</Text>
      </View>
      {events.length === 0 ? (
        <Text style={styles.empty}>{t('log.empty')}</Text>
      ) : (
        <ScrollView
          ref={scrollRef}
          accessibilityLabel={t('log.accessibility')}
          style={styles.scroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {events.map(event => (
            <View key={event.version} style={styles.row}>
              <View style={[styles.dot, event.outcome === 'correct' ? styles.correctDot : styles.wrongDot]} />
              <Text style={styles.message}>{formatRingActivity(event, localPlayerId, language)}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function formatRingActivity(event: RingFeedbackEvent, localPlayerId: PlayerId, language: Language = 'zh-CN'): string {
  const isLocalCaller = event.caller === localPlayerId;
  const callerName = translate(language, event.caller === 'A' ? 'ring.seatA' : 'ring.seatB');
  const count = event.movedCardCount;
  const cardWord = translate(language, count === 1 ? 'deck.cardWord.one' : 'deck.cardWord.many');

  if (event.outcome === 'correct') {
    return isLocalCaller
      ? translate(language, count === 0 ? 'ring.correct.ownEmpty' : 'ring.correct.own', { count, cardWord })
      : translate(language, count === 0 ? 'ring.correct.otherEmpty' : 'ring.correct.other', { count, cardWord, playerLabel: callerName });
  }
  return isLocalCaller
    ? translate(language, count === 0 ? 'ring.wrong.ownEmpty' : 'ring.wrong.own', { count, cardWord })
    : translate(language, count === 0 ? 'ring.wrong.otherEmpty' : 'ring.wrong.other', { count, cardWord, playerLabel: callerName });
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
