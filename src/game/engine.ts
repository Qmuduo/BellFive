import { CARD_DEFINITIONS } from './cards';
import type { CardDefinition, GameState, PlayerId } from './types';

export type RandomSource = () => number;

export function shuffleDeck(
  deck: readonly CardDefinition[],
  random: RandomSource = Math.random,
): CardDefinition[] {
  const shuffled = [...deck];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

export function createGame(random: RandomSource = Math.random): GameState {
  const shuffledDeck = shuffleDeck(CARD_DEFINITIONS, random);

  return {
    status: 'playing',
    turn: 'A',
    winner: null,
    lastRingOutcome: null,
    players: {
      A: { drawPile: shuffledDeck.slice(0, 30), playedPile: [] },
      B: { drawPile: shuffledDeck.slice(30), playedPile: [] },
    },
  };
}

export function flipCard(state: GameState): GameState {
  if (state.status !== 'playing') return state;

  const playerState = state.players[state.turn];
  if (playerState.drawPile.length === 0) return state;

  const [card, ...remainingDrawPile] = playerState.drawPile;
  const nextTurn: PlayerId = state.turn === 'A' ? 'B' : 'A';

  return {
    ...state,
    turn: nextTurn,
    lastRingOutcome: null,
    players: {
      ...state.players,
      [state.turn]: {
        drawPile: remainingDrawPile,
        playedPile: [card, ...playerState.playedPile],
      },
    },
  };
}

export function restartGame(random: RandomSource = Math.random): GameState {
  return createGame(random);
}
