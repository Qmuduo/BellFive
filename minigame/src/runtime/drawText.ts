import type { CanvasContext2D } from '../platform/wxApi';
import type { Rect } from './layout';

export interface TextStyle {
  fontSize?: number; color?: string; bold?: boolean; align?: 'left' | 'center' | 'right';
  maxLines?: number; lineHeight?: number;
}

/** Wrap and clip native Canvas text within the same logical rectangle used by layout. */
export function drawText(context: CanvasContext2D, rect: Rect, text: string, style: TextStyle = {}): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const fontSize = Math.min(style.fontSize ?? 14, rect.height / 1.25);
  const lineHeight = Math.min(rect.height, style.lineHeight ?? fontSize * 1.25);
  const maxLines = Math.max(1, Math.min(style.maxLines ?? 1, Math.floor(rect.height / lineHeight) || 1));
  context.save(); context.beginPath(); context.rect(rect.x, rect.y, rect.width, rect.height); context.clip();
  context.font = `${style.bold ? 'bold ' : ''}${fontSize}px sans-serif`;
  context.fillStyle = style.color ?? '#34214F';
  context.textAlign = style.align ?? 'left'; context.textBaseline = 'middle';
  const lines: string[] = []; let current = '';
  for (const character of Array.from(text)) {
    if (character === '\n') { lines.push(current); current = ''; continue; }
    if (current && context.measureText(current + character).width > rect.width) { lines.push(current); current = ''; }
    current += character;
  }
  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const characters = Array.from(visible[maxLines - 1]);
    while (characters.length && context.measureText(`${characters.join('')}…`).width > rect.width) characters.pop();
    visible[maxLines - 1] = `${characters.join('')}…`;
  }
  const x = context.textAlign === 'center' ? rect.x + rect.width / 2 : context.textAlign === 'right' ? rect.x + rect.width : rect.x;
  const top = rect.y + Math.max(0, (rect.height - visible.length * lineHeight) / 2);
  visible.forEach((line, index) => context.fillText(line, x, top + (index + 0.5) * lineHeight));
  context.restore();
}
