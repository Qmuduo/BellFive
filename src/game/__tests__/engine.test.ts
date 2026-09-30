import { CARD_DEFINITIONS } from '../cards';
import { createGame, flipCard, restartGame, shuffleDeck } from '../engine';
import type { CardDefinition, GameState, PlayerId } from '../types';

const makeState = (
  playerA: { drawPile: readonly CardDefinition[]; playedPile: readonly CardDefinition[] },
  playerB: { drawPile: readonly CardDefinition[]; playedPile: readonly CardDefinition[] },
  turn: PlayerId = 'A',
): GameState => ({
  status: 'playing',
  turn,
  winner: null,
  lastRingOutcome: null,
  players: { A: playerA, B: playerB },
});

describe('deck setup and flips', () => {
  it('shuffles deterministically without losing, duplicating, or mutating cards', () => {
    const originalIds = CARD_DEFINITIONS.map(card => card.id);
    const firstShuffle = shuffleDeck(CARD_DEFINITIONS, () => 0);
    const secondShuffle = shuffleDeck(CARD_DEFINITIONS, () => 0);

    expect(firstShuffle.map(card => card.id)).toEqual(secondShuffle.map(card => card.id));
    expect(firstShuffle.map(card => card.id).sort()).toEqual([...originalIds].sort());
    expect(firstShuffle.map(card => card.id)).not.toEqual(originalIds);
    expect(CARD_DEFINITIONS.map(card => card.id)).toEqual(originalIds);
  });

  it('deals every fixed card once into two 30-card piles and starts with Player A', () => {
    const game = createGame(() => 0);
    const dealtIds = [
      ...game.players.A.drawPile.map(card => card.id),
      ...game.players.B.drawPile.map(card => card.id),
    ];

    expect(game.status).toBe('playing');
    expect(game.turn).toBe('A');
    expect(game.winner).toBeNull();
    expect(game.players.A.drawPile).toHaveLength(30);
    expect(game.players.B.drawPile).toHaveLength(30);
    expect(game.players.A.playedPile).toEqual([]);
    expect(game.players.B.playedPile).toEqual([]);
    expect(dealtIds.sort()).toEqual(CARD_DEFINITIONS.map(card => card.id).sort());
  });

  it('moves each turn top card to its played-pile top without mutating prior state', () => {
    const [aTop, aNext, aOldTop, bTop] = CARD_DEFINITIONS;
    const original = makeState(
      { drawPile: [aTop, aNext], playedPile: [aOldTop] },
      { drawPile: [bTop], playedPile: [] },
    );

    const afterAFlip = flipCard(original);

    expect(afterAFlip.players.A.drawPile).toEqual([aNext]);
    expect(afterAFlip.players.A.playedPile).toEqual([aTop, aOldTop]);
    expect(afterAFlip.turn).toBe('B');
    expect(original.players.A.drawPile).toEqual([aTop, aNext]);
    expect(original.players.A.playedPile).toEqual([aOldTop]);

    const afterBFlip = flipCard(afterAFlip);

    expect(afterBFlip.players.B.drawPile).toEqual([]);
    expect(afterBFlip.players.B.playedPile).toEqual([bTop]);
    expect(afterBFlip.turn).toBe('A');
  });

  it('restarts with a fresh shuffled 30/30 deal and empty played piles', () => {
    const restarted = restartGame(() => 0);

    expect(restarted.status).toBe('playing');
    expect(restarted.turn).toBe('A');
    expect(restarted.winner).toBeNull();
    expect(restarted.lastRingOutcome).toBeNull();
    expect(restarted.players.A.drawPile).toHaveLength(30);
    expect(restarted.players.B.drawPile).toHaveLength(30);
    expect(restarted.players.A.playedPile).toEqual([]);
    expect(restarted.players.B.playedPile).toEqual([]);
  });
});
