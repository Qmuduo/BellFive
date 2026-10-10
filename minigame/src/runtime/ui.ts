import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import type { Rect } from './layout';

export interface RoundedPanelOptions { fill: string; border?: string; radius: number; borderWidth?: number; }
export interface CanvasButtonOptions {
  variant: 'primary' | 'secondary' | 'lime' | 'text'; enabled: boolean; fontSize: number; radius: number;
}
export interface InputFieldOptions { focused: boolean; enabled: boolean; fontSize: number; radius: number; }
export interface AvatarBadgeOptions { background: string; foreground: string; fontSize: number; radius: number; }

function roundedPath(context: CanvasContext2D, rect: Rect, requestedRadius: number): void {
  const radius = Math.max(0, Math.min(requestedRadius, rect.width / 2, rect.height / 2));
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  context.beginPath();
  context.moveTo(rect.x + radius, rect.y);
  context.lineTo(right - radius, rect.y);
  context.quadraticCurveTo(right, rect.y, right, rect.y + radius);
  context.lineTo(right, bottom - radius);
  context.quadraticCurveTo(right, bottom, right - radius, bottom);
  context.lineTo(rect.x + radius, bottom);
  context.quadraticCurveTo(rect.x, bottom, rect.x, bottom - radius);
  context.lineTo(rect.x, rect.y + radius);
  context.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y);
  context.closePath();
}

export function drawRoundedPanel(context: CanvasContext2D, rect: Rect, options: RoundedPanelOptions): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  context.save();
  roundedPath(context, rect, options.radius);
  context.fillStyle = options.fill;
  context.fill();
  if (options.border && (options.borderWidth ?? 1) > 0) {
    context.strokeStyle = options.border;
    context.lineWidth = options.borderWidth ?? 1;
    context.stroke();
  }
  context.restore();
}

/** Draw a horizontal one-device-pixel divider on a half-pixel coordinate. */
export function drawDivider(context: CanvasContext2D, rect: Rect, color: string): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const y = Math.floor(rect.y + rect.height / 2) + 0.5;
  context.save();
  context.beginPath();
  context.moveTo(rect.x, y);
  context.lineTo(rect.x + rect.width, y);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

export function drawCanvasButton(
  context: CanvasContext2D, rect: Rect, label: string, options: CanvasButtonOptions,
): Rect {
  const palettes = {
    primary: { fill: gameColors.purpleAction, border: gameColors.purpleShadow, text: gameColors.onAction },
    secondary: { fill: gameColors.surface, border: gameColors.border, text: gameColors.plum },
    lime: { fill: gameColors.lime, border: gameColors.lime, text: gameColors.onLimeMuted },
    text: { fill: gameColors.surface, border: undefined, text: gameColors.purple },
  } as const;
  const palette = options.enabled ? palettes[options.variant] : {
    fill: gameColors.lavenderSurface, border: gameColors.border, text: gameColors.muted,
  };
  drawRoundedPanel(context, rect, { fill: palette.fill, border: palette.border, radius: options.radius });
  context.save();
  context.font = `900 ${options.fontSize}px sans-serif`;
  context.fillStyle = palette.text;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.restore();
  return rect;
}

export function drawInputField(
  context: CanvasContext2D, rect: Rect, label: string, value: string, options: InputFieldOptions,
): void {
  const fill = options.enabled ? gameColors.surface : gameColors.lavenderSurface;
  drawRoundedPanel(context, rect, {
    fill,
    border: options.focused && options.enabled ? gameColors.purple : gameColors.border,
    borderWidth: options.focused && options.enabled ? 2 : 1,
    radius: options.radius,
  });
  const inset = Math.min(12, rect.width / 8);
  context.save();
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.font = `${Math.max(10, options.fontSize * 0.78)}px sans-serif`;
  context.fillStyle = options.enabled ? gameColors.muted : gameColors.muted;
  context.fillText(label, rect.x + inset, rect.y + rect.height * 0.28);
  context.font = `${options.fontSize}px sans-serif`;
  context.fillStyle = options.enabled ? gameColors.ink : gameColors.muted;
  context.fillText(value, rect.x + inset, rect.y + rect.height * 0.72);
  context.restore();
}

const badgePalette = {
  neutral: { fill: gameColors.lavenderSurface, border: gameColors.border, text: gameColors.plum },
  success: { fill: gameColors.lime, border: gameColors.lime, text: gameColors.plum },
  warning: { fill: gameColors.purpleActionBorder, border: gameColors.purpleActionBorder, text: gameColors.plum },
  error: { fill: gameColors.purple, border: gameColors.purple, text: gameColors.onAction },
} as const;

export function drawStatusBadge(context: CanvasContext2D, rect: Rect, label: string,
  tone: 'neutral' | 'success' | 'warning' | 'error'): void {
  const palette = badgePalette[tone];
  drawRoundedPanel(context, rect, { fill: palette.fill, border: palette.border, radius: rect.height / 2 });
  context.save();
  context.font = `900 ${Math.min(14, rect.height * 0.48)}px sans-serif`;
  context.fillStyle = palette.text;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.restore();
}

export function drawAvatarBadge(context: CanvasContext2D, rect: Rect, avatar: string, options: AvatarBadgeOptions): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  const radius = Math.max(0, Math.min(options.radius, rect.width / 2, rect.height / 2));
  context.save();
  context.beginPath();
  context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, radius, 0, Math.PI * 2);
  context.fillStyle = options.background;
  context.fill();
  context.font = `${options.fontSize}px sans-serif`;
  context.fillStyle = options.foreground;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(avatar, rect.x + rect.width / 2, rect.y + rect.height / 2);
  context.restore();
}
