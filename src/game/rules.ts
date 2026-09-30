import { FRUIT_TYPES } from './types';
import type { FruitType, GameState, VisibleCounts } from './types';

export function countVisibleItems(state: GameState): VisibleCounts {
  const counts: Record<FruitType, number> & { wildBellCount: number } = {
    banana: 0,
    grape: 0,
    pear: 0,
    strawberry: 0,
    peach: 0,
    wildBellCount: 0,
  };

  for (const player of Object.values(state.players)) {
    const visibleCard = player.playedPile[0];
    if (!visibleCard) continue;

    for (const symbol of visibleCard.symbols) {
      if (symbol === 'bell') {
        counts.wildBellCount += 1;
      } else {
        counts[symbol] += 1;
      }
    }
  }

  return counts;
}

export function canRing(counts: VisibleCounts): boolean {
  return FRUIT_TYPES.some(
    fruit => counts[fruit] <= 5 && counts[fruit] + counts.wildBellCount >= 5,
  );
}
