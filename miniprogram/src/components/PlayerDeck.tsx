import { Button, Text, View } from '@tarojs/components';
import type { CardDefinition, PlayerId } from '../../../src/game/types';
import { AVATAR_EMOJI, getPlayerDisplayName } from '../../../src/profile';
import type { PlayerProfile } from '../../../src/profile';
import type { Language } from '../../../src/i18n/types';
import { translate } from '../../../src/i18n/translations';
import { GameCard } from './GameCard';

export type PlayerDeckProps = Readonly<{
  playerId: PlayerId;
  profile: PlayerProfile;
  displayName?: string;
  topCard: CardDefinition | null;
  drawCount: number | null;
  playedCount: number | null;
  isTurnOwner: boolean;
  isLocalPlayer: boolean;
  canFlip: boolean;
  language: Language;
  movement?: 'collect' | 'penalty' | null;
  cardKey?: number;
  onFlip: () => void;
}>;

export function PlayerDeck({
  playerId,
  profile,
  displayName,
  topCard,
  drawCount,
  playedCount,
  isTurnOwner,
  isLocalPlayer,
  canFlip,
  language,
  movement = null,
  cardKey = 0,
  onFlip,
}: PlayerDeckProps): JSX.Element {
  const playerLabel = displayName ?? getPlayerDisplayName(profile, playerId, language);
  const count = drawCount ?? 0;
  const movementClass = movement ? ` mini-deck-${movement}` : '';
  return (
    <View className={`mini-player-deck ${playerId === 'A' ? 'mini-player-deck-a' : 'mini-player-deck-b'} ${isTurnOwner ? 'mini-player-deck-active' : ''}${movementClass}`}>
      <View className="mini-player-heading">
        <Text className="mini-player-avatar">{AVATAR_EMOJI[profile.avatarId]}</Text>
        <View className="mini-player-copy">
          <Text className="mini-player-name">{playerLabel}{isLocalPlayer ? ` · ${translate(language, 'deck.you')}` : ''}</Text>
          <Text id={`mini-draw-count-${playerId.toLowerCase()}`} className="mini-player-count">{translate(language, 'deck.cards', { count, cardWord: translate(language, count === 1 ? 'deck.cardWord.one' : 'deck.cardWord.many') })}</Text>
        </View>
        {isTurnOwner ? <Text className="mini-turn-badge">{isLocalPlayer ? translate(language, 'match.youLabel') : playerLabel}</Text> : null}
      </View>
      <Button id={`mini-card-source-${playerId.toLowerCase()}`} className="mini-card-action" disabled={!canFlip} onClick={onFlip} aria-label={translate(language, 'game.playerDeck', { playerLabel })}>
        {topCard
          ? <GameCard key={`${playerId}-${cardKey}`} card={topCard} revealed orientation={playerId} />
          : <View className="mini-empty-card"><Text>—</Text><Text className="mini-empty-card-hint">{translate(language, 'card.ready')}</Text></View>}
      </Button>
      <View className="mini-played-count">
        <Text>{translate(language, 'deck.table', { count: playedCount ?? 0 })}</Text>
      </View>
    </View>
  );
}
