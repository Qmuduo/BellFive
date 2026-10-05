import { StyleSheet, Text, View } from 'react-native';
import type { GameClientStatus } from '../network/GameClient';
import type { RoomSnapshot } from '../network/protocol';
import { playerSeatLabel } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import { useTranslation } from '../i18n/useTranslation';
import type { GameSessionMode } from '../store/gameStore';

const CONNECTION_LABEL_KEYS: Readonly<Record<GameClientStatus, TranslationKey>> = {
  idle: 'status.connection.idle',
  connecting: 'status.connection.connecting',
  connected: 'status.connection.connected',
  reconnecting: 'status.connection.reconnecting',
  disconnected: 'status.connection.disconnected',
  error: 'status.connection.error',
};

type DebugPanelProps = Readonly<{
  snapshot: RoomSnapshot;
  connectionStatus: GameClientStatus;
  sessionMode?: GameSessionMode;
}>;

export function DebugPanel({ snapshot, connectionStatus, sessionMode = 'online' }: DebugPanelProps) {
  const { language, t } = useTranslation();
  const counts = snapshot.visibleCounts;
  const playerA = playerSeatLabel('A', language);
  const playerB = sessionMode === 'single-player' ? t('solo.opponent') : playerSeatLabel('B', language);
  const player = (id: 'A' | 'B' | null) => id
    ? id === 'B' && sessionMode === 'single-player' ? t('solo.opponent') : playerSeatLabel(id, language)
    : t('debug.noTurn');
  const boolean = (value: boolean) => t(value ? 'debug.true' : 'debug.false');
  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{t('debug.heading')}</Text>
        <Text style={styles.summary}>{sessionMode === 'single-player' ? t('debug.singlePlayer') : t('debug.room', { roomCode: snapshot.roomCode })}</Text>
        <Text style={styles.summary}>{t('debug.you', { player: player(snapshot.localPlayerId) })}</Text>
      </View>
      <View style={styles.headingRow}>
        {sessionMode !== 'single-player' ? <Text style={styles.summary}>{t('debug.connection', { status: t(CONNECTION_LABEL_KEYS[connectionStatus]) })}</Text> : null}
        <Text style={styles.summary}>{t('debug.turn', { player: player(snapshot.turn) })}</Text>
        <Text style={styles.summary}>{t('debug.canRing', { value: boolean(snapshot.canRing) })}</Text>
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.summary}>{t('debug.timer', { value: snapshot.remainingSeconds === null ? t('debug.noTurn') : t('debug.seconds', { count: snapshot.remainingSeconds }) })}</Text>
        <Text style={styles.summary}>{t('debug.ringBlocked', { player: playerA, value: boolean(snapshot.ringBlockedUntilFlip.A) })}</Text>
        <Text style={styles.summary}>{t('debug.ringBlocked', { player: playerB, value: boolean(snapshot.ringBlockedUntilFlip.B) })}</Text>
      </View>

      <View style={styles.pileGrid}>
        <View style={styles.pileColumn}>
          <Text style={styles.line}>{t('debug.drawPile', { player: playerA, count: snapshot.players.A.drawCount ?? 0 })}</Text>
          <Text style={styles.line}>{t('debug.playedPile', { player: playerA, count: snapshot.players.A.playedCount ?? 0 })}</Text>
        </View>
        <View style={styles.pileColumn}>
          <Text style={styles.line}>{t('debug.drawPile', { player: playerB, count: snapshot.players.B.drawCount ?? 0 })}</Text>
          <Text style={styles.line}>{t('debug.playedPile', { player: playerB, count: snapshot.players.B.playedCount ?? 0 })}</Text>
        </View>
      </View>

      <Text style={styles.section}>{t('debug.visibleCounts')}</Text>
      <View style={styles.fruitGrid}>
        <Text style={styles.fruitLine}>{t('fruit.banana')}: {counts?.banana ?? 0}</Text>
        <Text style={styles.fruitLine}>{t('fruit.grape')}: {counts?.grape ?? 0}</Text>
        <Text style={styles.fruitLine}>{t('fruit.pear')}: {counts?.pear ?? 0}</Text>
        <Text style={styles.fruitLine}>{t('fruit.strawberry')}: {counts?.strawberry ?? 0}</Text>
        <Text style={styles.fruitLine}>{t('fruit.peach')}: {counts?.peach ?? 0}</Text>
        <Text style={styles.fruitLine}>{t('fruit.wild')}: {counts?.wildBellCount ?? 0}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: 12, padding: 10, borderRadius: 15, borderWidth: 1, borderColor: '#E5E7E9', backgroundColor: '#FFFFFF' },
  headingRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 },
  heading: { marginRight: 12, color: '#56616B', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  summary: { marginRight: 10, color: '#65717C', fontSize: 9, fontWeight: '700' },
  pileGrid: { flexDirection: 'row', paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#F0F1F2' },
  pileColumn: { flex: 1 },
  line: { color: '#606C76', fontSize: 9, lineHeight: 14 },
  section: { marginTop: 2, marginBottom: 3, color: '#56616B', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  fruitGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  fruitLine: { width: '33.333%', color: '#707B85', fontSize: 8, lineHeight: 13 },
});
