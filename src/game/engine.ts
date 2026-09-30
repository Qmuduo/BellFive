import { CARD_DEFINITIONS } from './cards';
import { canRing, countVisibleItems } from './rules';
import type { CardDefinition, GameState, PlayerId, RingOutcome } from './types';

export type RandomSource = () => number;

export type RingResult = Readonly<{
  state: GameState;
  outcome: RingOutcome;
  movedCardCount: number;
}>;

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

export function collectPlayedCards(state: GameState, caller: PlayerId): GameState {
  const opponent: PlayerId = caller === 'A' ? 'B' : 'A';
  const collectedCards = [
    ...state.players.A.playedPile,
    ...state.players.B.playedPile,
  ];

  return {
    ...state,
    players: {
      ...state.players,
      [caller]: {
        ...state.players[caller],
        drawPile: [...state.players[caller].drawPile, ...collectedCards],
        playedPile: [],
      },
      [opponent]: {
        ...state.players[opponent],
        playedPile: [],
      },
    },
  };
}

export function transferPenaltyCards(
  state: GameState,
  caller: PlayerId,
): Pick<RingResult, 'state' | 'movedCardCount'> {
  const opponent: PlayerId = caller === 'A' ? 'B' : 'A';
  const movedCards = state.players[caller].drawPile.slice(0, 2);
  const remainingCards = state.players[caller].drawPile.slice(movedCards.length);

  return {
    movedCardCount: movedCards.length,
    state: {
      ...state,
      players: {
        ...state.players,
        [caller]: {
          ...state.players[caller],
          drawPile: remainingCards,
        },
        [opponent]: {
          ...state.players[opponent],
          drawPile: [...state.players[opponent].drawPile, ...movedCards],
        },
      },
    },
  };
}

export function ringBell(state: GameState, caller: PlayerId): RingResult {
  const outcome: RingOutcome = canRing(countVisibleItems(state)) ? 'correct' : 'wrong';

  if (outcome === 'correct') {
    const movedCardCount =
      state.players.A.playedPile.length + state.players.B.playedPile.length;

    return {
      state: {
        ...collectPlayedCards(state, caller),
        lastRingOutcome: outcome,
      },
      outcome,
      movedCardCount,
    };
  }

  const penalty = transferPenaltyCards(state, caller);
  return {
    state: { ...penalty.state, lastRingOutcome: outcome },
    outcome,
    movedCardCount: penalty.movedCardCount,
  };
}

export function restartGame(random: RandomSource = Math.random): GameState {
  return createGame(random);
}
