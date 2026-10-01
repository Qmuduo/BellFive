export type CardSymbolPosition = Readonly<{ x: number; y: number }>;

const SYMBOL_PATTERNS: Readonly<Record<number, readonly CardSymbolPosition[]>> = {
  1: [{ x: 0.5, y: 0.5 }],
  2: [{ x: 0.26, y: 0.25 }, { x: 0.74, y: 0.75 }],
  3: [{ x: 0.27, y: 0.27 }, { x: 0.73, y: 0.43 }, { x: 0.48, y: 0.76 }],
  4: [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.28 },
    { x: 0.28, y: 0.72 },
    { x: 0.72, y: 0.72 },
  ],
  5: [
    { x: 0.25, y: 0.23 },
    { x: 0.74, y: 0.28 },
    { x: 0.51, y: 0.5 },
    { x: 0.29, y: 0.77 },
    { x: 0.76, y: 0.73 },
  ],
};

export function getCardSymbolPositions(
  cardId: string,
  count: number,
): readonly CardSymbolPosition[] {
  const pattern = SYMBOL_PATTERNS[count];
  if (!pattern) throw new RangeError('Card symbols must be between one and five.');

  const hash = stableHash(cardId);
  const rotation = hash % 4;
  const mirrored = (hash & 4) !== 0;

  return pattern.map(({ x, y }) => {
    let normalizedX = mirrored ? 1 - x : x;
    let normalizedY = y;
    for (let turn = 0; turn < rotation; turn += 1) {
      [normalizedX, normalizedY] = [1 - normalizedY, normalizedX];
    }
    return { x: normalizedX, y: normalizedY };
  });
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16_777_619);
  }
  return hash >>> 0;
}
