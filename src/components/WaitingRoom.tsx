import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { GameClientError, GameClientStatus } from '../network/GameClient';
import type { JoinApplication, RoomSnapshot } from '../network/protocol';
import type { PlayerId } from '../game/types';
import { AVATAR_EMOJI, getPlayerDisplayName } from '../profile';
import type { PlayerProfile } from '../profile';
import { LanguageSettings } from './LanguageSettings';
import { formatGameError, translate } from '../i18n/translations';
import type { TranslationKey } from '../i18n/translations';
import type { Language } from '../i18n/types';
import { useTranslation } from '../i18n/useTranslation';

type WaitingRoomProps = Readonly<{
  roomCode: string;
  localPlayerId: PlayerId;
  snapshot: RoomSnapshot;
  connectionStatus: GameClientStatus;
  error: GameClientError | null;
  onLeave: () => void;
  pendingApplications?: readonly JoinApplication[];
  onDecideApplication?: (applicationId: string, approved: boolean) => void;
  onSetReady?: (ready: boolean) => void;
}>;

export function WaitingRoom({
  roomCode,
  localPlayerId,
  snapshot,
  connectionStatus,
  error,
  onLeave,
  pendingApplications = [],
  onDecideApplication = () => undefined,
  onSetReady = () => undefined,
}: WaitingRoomProps) {
  const { language, t } = useTranslation();
  const otherPlayer: PlayerId = localPlayerId === 'A' ? 'B' : 'A';
  const localReady = snapshot.ready[localPlayerId];
  const playersConnected = snapshot.players.A.connected && snapshot.players.B.connected;
  const readyEnabled = connectionStatus === 'connected' && playersConnected;
  const shareInvite = () => Share.share({
    message: t('waiting.shareMessage', { roomCode }),
  });

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.settingsRow}><LanguageSettings /></View>
      <Text style={styles.eyebrow}>{t('waiting.eyebrow')}</Text>
      <Text style={styles.title}>{t('waiting.title')}</Text>
      <Text style={styles.description}>{t('waiting.description')}</Text>

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>{t('waiting.roomCode')}</Text>
        <Text selectable style={styles.code}>{roomCode}</Text>
      </View>

      <View style={styles.playerCard}>
        <PlayerStatus playerId={localPlayerId} profile={snapshot.players[localPlayerId].profile} connected={snapshot.players[localPlayerId].connected} ready={snapshot.ready[localPlayerId]} local language={language} />
        <PlayerStatus playerId={otherPlayer} profile={snapshot.players[otherPlayer].profile} connected={snapshot.players[otherPlayer].connected} ready={snapshot.ready[otherPlayer]} language={language} />
      </View>

      {pendingApplications.length > 0 ? (
        <View style={styles.requestsPanel}>
          <Text style={styles.requestsTitle}>{t('waiting.joinRequests')}</Text>
          {pendingApplications.map(application => (
            <View key={application.applicationId} style={styles.requestRow}>
              <View style={styles.requestIdentity}>
                <Text style={styles.requestAvatar}>{AVATAR_EMOJI[application.profile.avatarId]}</Text>
                <Text style={styles.requestName}>{t('waiting.wantsToJoin', { nickname: application.profile.nickname || t('waiting.unnamed') })}</Text>
              </View>
              <View style={styles.requestActions}>
                <Pressable accessibilityRole="button" accessibilityLabel={t('waiting.approveLabel', { nickname: application.profile.nickname || t('waiting.unnamed') })} onPress={() => onDecideApplication(application.applicationId, true)} style={styles.approveButton}>
                  <Text style={styles.approveText}>{t('waiting.approve')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('waiting.rejectLabel', { nickname: application.profile.nickname || t('waiting.unnamed') })} onPress={() => onDecideApplication(application.applicationId, false)} style={styles.rejectButton}>
                  <Text style={styles.rejectText}>{t('waiting.reject')}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.connection}>
        {error ? formatGameError(language, error.code) : connectionStatus === 'reconnecting' ? t('waiting.reconnecting') : localReady ? t('waiting.youAreReady') : t('waiting.autoStart')}
      </Text>

      <Pressable
        role="button"
        accessibilityState={{ disabled: !readyEnabled }}
        disabled={!readyEnabled}
        onPress={() => onSetReady(!localReady)}
        style={({ pressed }) => [styles.readyButton, localReady && styles.readyButtonOn, !readyEnabled && styles.disabled, pressed && readyEnabled && styles.pressed]}
      >
        <Text style={[styles.readyText, localReady && styles.readyTextOn]}>{localReady ? t('waiting.cancelReady') : t('waiting.ready')}</Text>
      </Pressable>

      <Pressable role="button" onPress={shareInvite} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
        <Text style={styles.shareText}>{t('waiting.shareInvite')}</Text>
      </Pressable>
      <Pressable role="button" onPress={onLeave} style={styles.leaveButton}>
        <Text style={styles.leaveText}>{t('waiting.leaveRoom')}</Text>
      </Pressable>
    </ScrollView>
  );
}

function PlayerStatus({ playerId, profile, connected, ready, local = false, language }: { playerId: PlayerId; profile: PlayerProfile; connected: boolean; ready: boolean; local?: boolean; language: Language }) {
  const t = (key: TranslationKey) => translate(language, key);
  return (
    <View style={styles.playerRow}>
      <View style={[styles.statusDot, connected ? styles.online : styles.offline]} />
      <View style={styles.avatar}><Text style={styles.avatarEmoji}>{AVATAR_EMOJI[profile.avatarId]}</Text></View>
      <Text style={styles.playerName}>{getPlayerDisplayName(profile, playerId, language)}{local ? ` · ${t('waiting.you')}` : ''}</Text>
      <Text style={[styles.status, connected ? styles.onlineText : null]}>{!connected ? t('status.waiting') : ready ? t('status.ready') : t('status.connected')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 20, backgroundColor: '#F6F5F1' },
  settingsRow: { alignItems: 'flex-end', marginBottom: 10 },
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
  requestsPanel: { marginTop: 13, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF' },
  requestsTitle: { marginBottom: 7, color: '#87909B', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  requestRow: { paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#F0F1F2' },
  requestIdentity: { flexDirection: 'row', alignItems: 'center' },
  requestAvatar: { marginRight: 7, fontSize: 19 },
  requestName: { color: '#364451', fontSize: 11, fontWeight: '800' },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 7 },
  approveButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: '#E4F3E9' },
  approveText: { color: '#35744F', fontSize: 9, fontWeight: '900' },
  rejectButton: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: '#FBE6E3' },
  rejectText: { color: '#A6534D', fontSize: 9, fontWeight: '900' },
  readyButton: { minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 15, borderRadius: 16, backgroundColor: '#F2C4CC' },
  readyButtonOn: { backgroundColor: '#E3F1E7' },
  readyText: { color: '#633E45', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
  readyTextOn: { color: '#35744F' },
  disabled: { opacity: 0.5 },
  shareButton: { minHeight: 56, alignItems: 'center', justifyContent: 'center', marginTop: 25, borderRadius: 18, backgroundColor: '#F2C4CC' },
  shareText: { color: '#633E45', fontSize: 15, fontWeight: '900' },
  leaveButton: { alignItems: 'center', justifyContent: 'center', padding: 15 },
  leaveText: { color: '#7E8790', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
