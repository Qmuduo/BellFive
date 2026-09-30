import { CARD_DEFINITIONS } from '../cards';

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
});
