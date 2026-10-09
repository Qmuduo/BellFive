import { getCardSymbolPositions } from '../../../src/game/cardLayout';
import type { CardDefinition, GameElement } from '../../../src/game/types';
import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import type { Rect } from './layout';

export const CARD_SYMBOLS: Readonly<Record<GameElement, string>> = {
  banana: '🍌', grape: '🍇', pear: '🍐', strawberry: '🍓', peach: '🍑', bell: '🔔',
};
export interface CardTheme { face: string; back: string; border: string; ink: string; }
const defaultTheme: CardTheme = { face: gameColors.surface, back: gameColors.lavenderSurface,
  border: gameColors.border, ink: gameColors.plum };

/** Presentation only: shared definitions and symbol positions remain the source of the card face. */
export function drawCard(context: CanvasContext2D, rect: Rect, card: CardDefinition | null,
  orientation: 'local' | 'opponent' = 'local', theme: CardTheme = defaultTheme): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  context.save();
  context.translate(rect.x + rect.width / 2, rect.y + rect.height / 2);
  if (orientation === 'opponent') context.rotate(Math.PI);
  context.fillStyle = card ? theme.face : theme.back;
  context.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
  context.strokeStyle = theme.border; context.lineWidth = 2;
  context.strokeRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height);
  context.beginPath(); context.rect(-rect.width / 2, -rect.height / 2, rect.width, rect.height); context.clip();
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = theme.ink;
  context.font = `${Math.min(38, rect.width * 0.28, rect.height * 0.2)}px sans-serif`;
  if (card) {
    const positions = getCardSymbolPositions(card.id, card.symbols.length);
    card.symbols.forEach((symbol, index) => context.fillText(CARD_SYMBOLS[symbol],
      (positions[index].x - 0.5) * rect.width, (positions[index].y - 0.5) * rect.height));
  } else context.fillText('—', 0, 0);
  context.restore();
}
