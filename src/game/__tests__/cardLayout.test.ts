import { getCardSymbolPositions } from '../cardLayout';

describe('getCardSymbolPositions', () => {
  it.each([1, 2, 3, 4, 5])('places %i symbols in stable normalized positions', count => {
    const positions = getCardSymbolPositions(`C00${count}`, count);

    expect(positions).toHaveLength(count);
    expect(positions).toEqual(getCardSymbolPositions(`C00${count}`, count));
    for (const position of positions) {
      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThanOrEqual(1);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThanOrEqual(1);
    }
  });

  it('centers one symbol and arranges two symbols diagonally', () => {
    expect(getCardSymbolPositions('C001', 1)).toEqual([{ x: 0.5, y: 0.5 }]);
    const [first, second] = getCardSymbolPositions('C002', 2);
    expect(first.x).not.toBe(second.x);
    expect(first.y).not.toBe(second.y);
  });
});
