import { Text, View } from '@tarojs/components';
import type { CardDefinition, GameElement, PlayerId } from '../../../src/game/types';
import { getCardSymbolPositions } from '../../../src/game/cardLayout';

const ELEMENT_EMOJI: Record<GameElement, string> = {
  banana: '🍌',
  grape: '🍇',
  pear: '🍐',
  strawberry: '🍓',
  peach: '🍑',
  bell: '🔔',
};

export type GameCardProps = Readonly<{
  card: CardDefinition | null;
  revealed: boolean;
  orientation: PlayerId;
}>;

export function GameCard({ card, revealed, orientation }: GameCardProps): JSX.Element {
  const visibleCard = revealed ? card : null;
  const positions = visibleCard ? getCardSymbolPositions(visibleCard.id, visibleCard.symbols.length) : [];

  return (
    <View key={visibleCard?.id ?? `hidden-${orientation}`} className={`mini-game-card mini-game-card-${orientation.toLowerCase()} ${visibleCard ? 'mini-game-card-revealed' : 'mini-game-card-hidden'}`}>
      {visibleCard ? (
        <View className="mini-card-symbols">
          {visibleCard.symbols.map((symbol, index) => {
            const position = positions[index];
            return (
              <Text
                key={`${visibleCard.id}-${index}`}
                className="mini-card-symbol"
                style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
              >
                {ELEMENT_EMOJI[symbol]}
              </Text>
            );
          })}
        </View>
      ) : (
        <View className="mini-card-back">
          <Text className="mini-card-back-mark">🔔</Text>
          <Text className="mini-card-back-word">铃果派对</Text>
        </View>
      )}
    </View>
  );
}
