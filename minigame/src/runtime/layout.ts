export interface Point { x: number; y: number; }
export interface Rect extends Point { width: number; height: number; }
export interface SafeAreaInsets { top: number; bottom: number; left?: number; right?: number; }
export interface TapTarget { id: string; rect: Rect; enabled?: boolean; }
export interface ScreenLayout {
  width: number; height: number; content: Rect;
  primaryButton: Rect; secondaryButton: Rect; cards: readonly Rect[]; targets: readonly TapTarget[];
}

export function contains(point: Point, rect: Rect): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height;
}

export function hitTest(point: Point, targets: readonly TapTarget[]): string | null {
  for (let index = targets.length - 1; index >= 0; index--) {
    const target = targets[index];
    if (target.enabled !== false && contains(point, target.rect)) return target.id;
  }
  return null;
}

export function logicalPoint(point: Point, pixelRatio: number, space: 'logical' | 'device'): Point {
  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) throw new Error('Invalid pixel ratio.');
  return space === 'device' ? { x: point.x / pixelRatio, y: point.y / pixelRatio } : { x: point.x, y: point.y };
}

export function layoutForScreen(width: number, height: number, safeArea: SafeAreaInsets): ScreenLayout {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid screen dimensions.');
  const inset = (value: number | undefined, maximum: number) => Math.min(maximum, Math.max(0, Number.isFinite(value) ? value! : 0));
  const top = inset(safeArea.top, height); const bottom = inset(safeArea.bottom, height - top);
  const left = inset(safeArea.left, width); const right = inset(safeArea.right, width - left);
  const content = { x: left, y: top, width: width - left - right, height: height - top - bottom };
  const margin = Math.min(24, content.width / 8, content.height / 12);
  const buttonHeight = Math.min(56, content.height / 6);
  const primaryButton = { x: left + margin, y: top + content.height - margin - buttonHeight, width: content.width - margin * 2, height: buttonHeight };
  const secondaryButton = { ...primaryButton, y: primaryButton.y - buttonHeight - Math.min(12, margin) };
  const gap = Math.min(24, margin);
  const cardWidth = Math.min(128, (content.width - margin * 2 - gap) / 2);
  const cardHeight = Math.min(cardWidth * 1.4, content.height / 3);
  const cards = [0, 1].map(index => ({ x: left + (content.width - cardWidth * 2 - gap) / 2 + index * (cardWidth + gap),
    y: top + margin, width: cardWidth, height: cardHeight }));
  return { width, height, content, primaryButton, secondaryButton, cards,
    targets: [{ id: 'secondary', rect: secondaryButton }, { id: 'primary', rect: primaryButton }],
  };
}
