import { ScrollView, Text, View } from '@tarojs/components';
import type { RoomSnapshot } from '../../../src/network/protocol';
import type { PlayerId } from '../../../src/game/types';
import type { Language } from '../../../src/i18n/types';
import { translate } from '../../../src/i18n/translations';
import { getMiniRingLogEntries } from '../store/matchPresentation';

export type RingActivityLogProps = Readonly<{
  snapshot: RoomSnapshot;
  localPlayerId: PlayerId;
  language: Language;
  opponentName?: string;
}>;

export function RingActivityLog({ snapshot, localPlayerId, language, opponentName }: RingActivityLogProps): JSX.Element {
  const entries = getMiniRingLogEntries(snapshot.ringHistory, snapshot.lastRingEvent, localPlayerId, language, opponentName);
  return (
    <View className="mini-ring-log">
      <View className="mini-ring-log-heading">
        <Text className="mini-panel-title">{translate(language, 'log.heading')}</Text>
        <Text className="mini-ring-count">{entries.length}/12</Text>
      </View>
      {entries.length === 0 ? (
        <Text className="mini-ring-empty">{translate(language, 'log.empty')}</Text>
      ) : (
        <ScrollView className="mini-ring-scroll" scrollY>
          {entries.map(({ event, message }) => (
            <View key={event.version} className="mini-ring-row">
              <View className={`mini-ring-dot ${event.outcome === 'correct' ? 'mini-ring-dot-correct' : 'mini-ring-dot-wrong'}`} />
              <Text className="mini-ring-message">{message}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
