import { StyleSheet, Text, View } from 'react-native';
import type { GameClientStatus } from '../network/GameClient';
import type { RoomSnapshot } from '../network/protocol';

type DebugPanelProps = Readonly<{
  snapshot: RoomSnapshot;
  connectionStatus: GameClientStatus;
}>;

export function DebugPanel({ snapshot, connectionStatus }: DebugPanelProps) {
  const counts = snapshot.visibleCounts;
  return (
    <View style={styles.panel}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>DEBUG</Text>
        <Text style={styles.summary}>Room: {snapshot.roomCode}</Text>
        <Text style={styles.summary}>You: {snapshot.localPlayerId}</Text>
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.summary}>Connection: {connectionStatus}</Text>
        <Text style={styles.summary}>Turn: {snapshot.turn ?? '—'}</Text>
        <Text style={styles.summary}>Can Ring: {String(snapshot.canRing)}</Text>
      </View>

      <View style={styles.pileGrid}>
        <View style={styles.pileColumn}>
          <Text style={styles.line}>A draw pile: {snapshot.players.A.drawCount ?? 0}</Text>
          <Text style={styles.line}>A played pile: {snapshot.players.A.playedCount ?? 0}</Text>
        </View>
        <View style={styles.pileColumn}>
          <Text style={styles.line}>B draw pile: {snapshot.players.B.drawCount ?? 0}</Text>
          <Text style={styles.line}>B played pile: {snapshot.players.B.playedCount ?? 0}</Text>
        </View>
      </View>

      <Text style={styles.section}>Visible fruit counts:</Text>
      <View style={styles.fruitGrid}>
        <Text style={styles.fruitLine}>banana: {counts?.banana ?? 0}</Text>
        <Text style={styles.fruitLine}>grape: {counts?.grape ?? 0}</Text>
        <Text style={styles.fruitLine}>pear: {counts?.pear ?? 0}</Text>
        <Text style={styles.fruitLine}>strawberry: {counts?.strawberry ?? 0}</Text>
        <Text style={styles.fruitLine}>peach: {counts?.peach ?? 0}</Text>
        <Text style={styles.fruitLine}>wild: {counts?.wildBellCount ?? 0}</Text>
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
