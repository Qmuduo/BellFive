import { Text, View } from '@tarojs/components';
import type { GameClientStatus } from '../../../src/network/GameClient';
import type { GameSessionMode } from '../../../src/store/createGameStore';
import type { PlayerId } from '../../../src/game/types';
import type { RoomSnapshot } from '../../../src/network/protocol';
import type { Language } from '../../../src/i18n/types';
import { translate } from '../../../src/i18n/translations';
import { getPlayerDisplayName } from '../../../src/profile';
import { miniText } from '../uiText';

export type MatchStatusProps = Readonly<{
  snapshot: RoomSnapshot;
  localPlayerId: PlayerId | null;
  connectionStatus: GameClientStatus;
  sessionMode: GameSessionMode;
  language: Language;
}>;

function formatTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safeSeconds / 60).toString().padStart(2, '0')}:${(safeSeconds % 60).toString().padStart(2, '0')}`;
}

export function MatchStatus({ snapshot, localPlayerId, connectionStatus, sessionMode, language }: MatchStatusProps): JSX.Element {
  const isSolo = sessionMode === 'single-player';
  const localName = localPlayerId
    ? getPlayerDisplayName(snapshot.players[localPlayerId].profile, localPlayerId, language)
    : translate(language, 'player.seatA');
  const opponentId: PlayerId = localPlayerId === 'A' ? 'B' : 'A';
  const opponentName = isSolo
    ? translate(language, 'solo.opponent')
    : getPlayerDisplayName(snapshot.players[opponentId].profile, opponentId, language);
  const turnName = snapshot.turn === localPlayerId
    ? translate(language, 'match.youLabel')
    : snapshot.turn ? (snapshot.turn === opponentId ? opponentName : localName) : '—';
  const phaseCopy = snapshot.phase === 'finished'
    ? translate(language, 'game.roundComplete')
    : snapshot.phase === 'connection-paused'
      ? miniText(language, 'matchPaused')
      : miniText(language, 'matchPlaying');
  const winnerCopy = snapshot.phase !== 'finished'
    ? null
    : snapshot.winner === null
      ? translate(language, 'game.draw')
      : snapshot.winner === localPlayerId
        ? translate(language, 'game.youWin')
        : translate(language, 'game.playerWins', { playerLabel: snapshot.winner === opponentId ? opponentName : localName });
  const connectionLabel = translate(language, `status.connection.${connectionStatus}` as Parameters<typeof translate>[1]);

  return (
    <View className="mini-match-status">
      <View className="mini-status-heading">
        <Text className="mini-status-room">{isSolo ? translate(language, 'game.singlePlayer') : snapshot.roomCode}</Text>
        <Text className={`mini-connection-state ${connectionStatus === 'connected' || isSolo ? 'mini-connection-online' : 'mini-connection-offline'}`}>
          {isSolo ? translate(language, 'debug.singlePlayer') : connectionLabel}
        </Text>
      </View>
      <View className="mini-status-grid">
        <View className="mini-status-cell">
          <Text className="mini-status-label">{miniText(language, 'matchPhase')}</Text>
          <Text className="mini-status-value">{phaseCopy}</Text>
        </View>
        <View className="mini-status-cell">
          <Text className="mini-status-label">{miniText(language, 'matchTime')}</Text>
          <Text className="mini-status-value mini-status-time">{formatTime(snapshot.remainingSeconds)}</Text>
        </View>
        <View className="mini-status-cell mini-status-turn">
          <Text className="mini-status-label">{miniText(language, 'matchTurn')}</Text>
          <Text className="mini-status-value">{turnName}</Text>
        </View>
      </View>
      {winnerCopy ? <Text className="mini-winner-banner">{winnerCopy}</Text> : null}
      {!isSolo && snapshot.phase === 'finished' ? (
        <View className="mini-ready-row">
          {(['A', 'B'] as const).map(player => (
            <Text key={player} className={`mini-ready-chip ${snapshot.ready[player] ? 'mini-ready-on' : ''}`}>
              {player === localPlayerId ? translate(language, 'match.youLabel') : opponentName}: {translate(language, snapshot.ready[player] ? 'status.ready' : 'status.waiting')}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
