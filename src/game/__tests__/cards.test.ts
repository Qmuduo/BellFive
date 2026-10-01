import { CARD_DEFINITIONS } from '../cards';
import { canRing } from '../rules';
import type { CardDefinition, VisibleCounts } from '../types';

const allowedElements = [
  'banana',
  'grape',
  'pear',
  'strawberry',
  'peach',
  'bell',
] as const;

describe('CARD_DEFINITIONS', () => {
  it('contains exactly C001 through C060 in order', () => {
    const expectedIds = Array.from({ length: 60 }, (_, index) =>
      `C${String(index + 1).padStart(3, '0')}`,
    );

    expect(CARD_DEFINITIONS.map(card => card.id)).toEqual(expectedIds);
  });

  it('keeps every card to one through five allowed symbols', () => {
    expect(
      CARD_DEFINITIONS.every(
        card =>
          card.symbols.length >= 1 &&
          card.symbols.length <= 5 &&
          card.symbols.every(symbol => allowedElements.includes(symbol)),
      ),
    ).toBe(true);
  });

  it('defines no more than one Wild Bell on any fixed card', () => {
    expect(CARD_DEFINITIONS).toHaveLength(60);
    expect(
      CARD_DEFINITIONS.every(
        card => card.symbols.filter(symbol => symbol === 'bell').length <= 1,
      ),
    ).toBe(true);
  });

  it('includes every fruit and the Wild Bell in the fixed set', () => {
    const deckElements = new Set(CARD_DEFINITIONS.flatMap(card => card.symbols));

    expect([...deckElements].sort()).toEqual([...allowedElements].sort());
  });

  it('includes repeated and mixed symbols as legal card patterns', () => {
    expect(
      CARD_DEFINITIONS.some(card => new Set(card.symbols).size < card.symbols.length),
    ).toBe(true);
    expect(CARD_DEFINITIONS.some(card => new Set(card.symbols).size > 1)).toBe(true);
  });

  it('includes one card with all five distinct fruit types', () => {
    const fruitTypes = allowedElements.filter(element => element !== 'bell');

    expect(
      CARD_DEFINITIONS.some(card => {
        const fruits = card.symbols.filter(symbol => symbol !== 'bell');
        return fruits.length === 5 && new Set(fruits).size === fruitTypes.length;
      }),
    ).toBe(true);
  });

  it('has a ring opportunity in at least ten percent of distinct card pairs', () => {
    let ringPairs = 0;

    for (let firstIndex = 0; firstIndex < CARD_DEFINITIONS.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < CARD_DEFINITIONS.length; secondIndex += 1) {
        const first = CARD_DEFINITIONS[firstIndex];
        const second = CARD_DEFINITIONS[secondIndex];
        if (first && second && canRing(countsForPair(first, second))) ringPairs += 1;
      }
    }

    const totalPairs = (CARD_DEFINITIONS.length * (CARD_DEFINITIONS.length - 1)) / 2;
    expect(totalPairs).toBe(1770);
    expect(ringPairs).toBeGreaterThanOrEqual(177);
  });
});

function countsForPair(first: CardDefinition, second: CardDefinition): VisibleCounts {
  const counts = {
    banana: 0,
    grape: 0,
    pear: 0,
    strawberry: 0,
    peach: 0,
    wildBellCount: 0,
  };

  for (const symbol of [...first.symbols, ...second.symbols]) {
    if (symbol === 'bell') counts.wildBellCount += 1;
    else counts[symbol] += 1;
  }

  return counts;
}
