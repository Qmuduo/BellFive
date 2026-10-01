import { canRing, countVisibleItems } from '../rules';
import type { CardDefinition, GameElement, GameState } from '../types';

const makeCard = (id: string, symbols: readonly GameElement[]): CardDefinition => ({
  id,
  symbols,
});

const makeState = (
  playerAPlayed: readonly CardDefinition[] = [],
  playerBPlayed: readonly CardDefinition[] = [],
): GameState => ({
  status: 'playing',
  turn: 'A',
  winner: null,
  ringBlockedUntilFlip: { A: false, B: false },
  lastRingOutcome: null,
  players: {
    A: { drawPile: [], playedPile: playerAPlayed },
    B: { drawPile: [], playedPile: playerBPlayed },
  },
});

describe('visible counts and ring condition', () => {
  it('counts four strawberries and one Wild Bell across the two visible cards', () => {
    const state = makeState(
      [
        makeCard('A-top', ['strawberry', 'strawberry', 'strawberry']),
        makeCard('A-hidden', ['strawberry', 'strawberry', 'strawberry']),
      ],
      [makeCard('B-top', ['strawberry', 'bell'])],
    );

    expect(countVisibleItems(state)).toEqual({
      banana: 0,
      grape: 0,
      pear: 0,
      strawberry: 4,
      peach: 0,
      wildBellCount: 1,
    });
    expect(canRing(countVisibleItems(state))).toBe(true);
  });

  it('allows a fruit count of five to ring while leaving a visible bell unused', () => {
    const state = makeState(
      [makeCard('A-top', ['strawberry', 'strawberry', 'strawberry', 'strawberry', 'strawberry'])],
      [makeCard('B-top', ['bell'])],
    );

    expect(countVisibleItems(state).strawberry).toBe(5);
    expect(canRing(countVisibleItems(state))).toBe(true);
  });

  it('counts multiple visible Wild Bells toward one fruit without reducing raw counts', () => {
    const state = makeState(
      [makeCard('A-top', ['strawberry', 'strawberry', 'strawberry', 'bell'])],
      [makeCard('B-top', ['strawberry', 'bell'])],
    );

    expect(countVisibleItems(state)).toMatchObject({ strawberry: 4, wildBellCount: 2 });
    expect(canRing(countVisibleItems(state))).toBe(true);
  });

  it('does not let a Wild Bell reduce a raw fruit count above five', () => {
    const state = makeState(
      [makeCard('A-top', ['grape', 'grape', 'grape'])],
      [makeCard('B-top', ['grape', 'grape', 'grape', 'bell'])],
    );

    expect(countVisibleItems(state).grape).toBe(6);
    expect(countVisibleItems(state).wildBellCount).toBe(1);
    expect(canRing(countVisibleItems(state))).toBe(false);
  });

  it('ignores cards under each played-pile top card', () => {
    const state = makeState(
      [makeCard('A-top', ['banana']), makeCard('A-hidden', ['strawberry', 'strawberry'])],
      [makeCard('B-top', ['grape']), makeCard('B-hidden', ['strawberry', 'strawberry', 'bell'])],
    );

    expect(countVisibleItems(state)).toEqual({
      banana: 1,
      grape: 1,
      pear: 0,
      strawberry: 0,
      peach: 0,
      wildBellCount: 0,
    });
    expect(canRing(countVisibleItems(state))).toBe(false);
  });

  it('does not allow ringing when both played piles are empty', () => {
    expect(canRing(countVisibleItems(makeState()))).toBe(false);
  });
});
