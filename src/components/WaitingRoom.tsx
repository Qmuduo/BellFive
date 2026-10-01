import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import type { GameClientError, GameClientStatus } from '../network/GameClient';
import type { RoomSnapshot } from '../network/protocol';
import type { PlayerId } from '../game/types';
import { AVATAR_EMOJI, getPlayerDisplayName } from '../profile';
import type { PlayerProfile } from '../profile';

type WaitingRoomProps = Readonly<{
  roomCode: string;
  localPlayerId: PlayerId;
  snapshot: RoomSnapshot;
  connectionStatus: GameClientStatus;
  error: GameClientError | null;
  onLeave: () => void;
}>;

export function WaitingRoom({ roomCode, localPlayerId, snapshot, connectionStatus, error, onLeave }: WaitingRoomProps) {
  const otherPlayer: PlayerId = localPlayerId === 'A' ? 'B' : 'A';
  const shareInvite = () => Share.share({
    message: `Join my BellFive game. Enter room code ${roomCode} in BellFive to play with me.`,
  });

  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>PRIVATE FRIEND ROOM</Text>
      <Text style={styles.title}>You're in.</Text>
      <Text style={styles.description}>Share this code with your friend to start the match.</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>ROOM CODE</Text>
        <Text selectable style={styles.code}>{roomCode}</Text>
      </View>

      <View style={styles.playerCard}>
        <PlayerStatus playerId={localPlayerId} profile={snapshot.players[localPlayerId].profile} connected={snapshot.players[localPlayerId].connected} local />
        <PlayerStatus playerId={otherPlayer} profile={snapshot.players[otherPlayer].profile} connected={snapshot.players[otherPlayer].connected} />
      </View>

      <Text style={styles.connection}>
        {error?.message ?? (connectionStatus === 'reconnecting' ? 'Reconnecting to the game server…' : 'The match starts when both players are connected.')}
      </Text>

      <Pressable role="button" onPress={shareInvite} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
        <Text style={styles.shareText}>Share Invite</Text>
      </Pressable>
      <Pressable role="button" onPress={onLeave} style={styles.leaveButton}>
        <Text style={styles.leaveText}>Leave Room</Text>
      </Pressable>
    </View>
  );
}

function PlayerStatus({ playerId, profile, connected, local = false }: { playerId: PlayerId; profile: PlayerProfile; connected: boolean; local?: boolean }) {
  return (
    <View style={styles.playerRow}>
      <View style={[styles.statusDot, connected ? styles.online : styles.offline]} />
      <View style={styles.avatar}><Text style={styles.avatarEmoji}>{AVATAR_EMOJI[profile.avatarId]}</Text></View>
      <Text style={styles.playerName}>{getPlayerDisplayName(profile, playerId)}{local ? ' · You' : ''}</Text>
      <Text style={[styles.status, connected ? styles.onlineText : null]}>{connected ? 'Connected' : 'Waiting'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: '#F6F5F1' },
  eyebrow: { color: '#87909B', fontSize: 9, fontWeight: '900', letterSpacing: 1.8, textAlign: 'center' },
  title: { marginTop: 7, color: '#202B37', fontSize: 31, fontWeight: '900', textAlign: 'center' },
  description: { marginTop: 7, marginBottom: 25, color: '#75808B', fontSize: 13, textAlign: 'center' },
  codeCard: { alignItems: 'center', paddingVertical: 21, borderWidth: 1.5, borderColor: '#C7D3EC', borderRadius: 22, backgroundColor: '#E8EEFA' },
  codeLabel: { color: '#70809A', fontSize: 9, fontWeight: '900', letterSpacing: 1.6 },
  code: { marginTop: 8, color: '#354D70', fontSize: 35, fontWeight: '900', letterSpacing: 6 },
  playerCard: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 5, borderRadius: 18, backgroundColor: '#FFFFFF' },
  playerRow: { minHeight: 47, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1F1F0' },
  statusDot: { width: 9, height: 9, marginRight: 10, borderRadius: 5 },
  avatar: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', marginRight: 10, borderRadius: 16, backgroundColor: '#FFF3CA' },
  avatarEmoji: { fontSize: 18 },
  online: { backgroundColor: '#48A878' },
  offline: { backgroundColor: '#D7DBDE' },
  playerName: { flex: 1, color: '#364451', fontSize: 13, fontWeight: '800' },
  status: { color: '#929AA2', fontSize: 10, fontWeight: '800' },
  onlineText: { color: '#38845E' },
  connection: { marginTop: 17, color: '#7B858E', fontSize: 11, textAlign: 'center' },
  shareButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: 25, borderRadius: 18, backgroundColor: '#F2C4CC' },
  shareText: { color: '#633E45', fontSize: 15, fontWeight: '900' },
  leaveButton: { alignItems: 'center', justifyContent: 'center', padding: 15 },
  leaveText: { color: '#7E8790', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
