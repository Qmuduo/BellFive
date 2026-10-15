import { translate } from '../../../src/i18n';
import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import { clipTapTargetsToContent, type ScreenLayout, type TapTarget } from '../runtime/layout';
import { drawCanvasButton, drawRoundedPanel } from '../runtime/ui';
import { drawText } from '../runtime/drawText';
import type { MiniGameStores } from '../stores/gameStore';
import type { ScreenSnapshot } from './home';

export function dispatchSettingsAction(actionId: string, stores: Pick<MiniGameStores, 'settings'>): boolean {
  if (!actionId.startsWith('settings.music.')) return false;
  const settings = stores.settings.getState();
  if (!settings.hydrated) return true;
  if (actionId === 'settings.music.toggle') settings.setMusicEnabled(!settings.musicEnabled);
  else if (actionId === 'settings.music.quieter') settings.setMusicVolume(Math.round((settings.musicVolume - 0.1) * 100) / 100);
  else if (actionId === 'settings.music.louder') settings.setMusicVolume(Math.round((settings.musicVolume + 0.1) * 100) / 100);
  return true;
}

function topOfSettings(layout: ScreenLayout): number {
  return Math.max(layout.content.y + 16, (layout.menuButton?.y ?? 0) + (layout.menuButton?.height ?? 0) + 12);
}

export function settingsContentHeight(layout: ScreenLayout): number {
  return topOfSettings(layout) - layout.content.y + 350;
}

export function renderSettings(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { content } = layout;
  const x = content.x + 18; const width = content.width - 36;
  const y = topOfSettings(layout) - layout.scrollY;
  const settings = snapshot.settings;
  const t = (key: Parameters<typeof translate>[1]) => translate(settings.language, key);
  const targets: TapTarget[] = [];
  const text = (value: string, ty: number, size: number, color: string = gameColors.plum, tx = x, w = width) =>
    drawText(context, { x: tx, y: ty, width: w, height: size + 12 }, value, { fontSize: size, color, bold: true });
  const button = (id: string, title: string, bx: number, by: number, bw: number, enabled = true) => {
    const rect = { x: bx, y: by, width: bw, height: 44 };
    drawCanvasButton(context, rect, title, { variant: id === 'settings.music.toggle' && settings.musicEnabled ? 'lime' : 'secondary',
      enabled, fontSize: 13, radius: 13 });
    if (enabled) targets.push({ id, rect });
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
  text(t('settings.game'), y, 23);
  drawRoundedPanel(context, { x, y: y + 50, width, height: 84 }, { fill: gameColors.surface, radius: 18 });
  text(t('settings.backgroundMusic'), y + 62, 14, gameColors.plum, x + 14, width - 120);
  text(t('settings.savedLocally'), y + 88, 10, gameColors.muted, x + 14, width - 120);
  button('settings.music.toggle', t(settings.musicEnabled ? 'settings.musicOn' : 'settings.musicOff'),
    x + width - 94, y + 70, 80, settings.hydrated);

  drawRoundedPanel(context, { x, y: y + 148, width, height: 140 }, { fill: gameColors.surface, radius: 18 });
  text(t('settings.musicVolume'), y + 163, 14, gameColors.plum, x + 14, width - 100);
  text(`${Math.round(settings.musicVolume * 100)}%`, y + 162, 18, gameColors.purple, x + width - 68, 60);
  button('settings.music.quieter', '−', x + 14, y + 212, 44, settings.hydrated && settings.musicVolume > 0);
  button('settings.music.louder', '+', x + width - 58, y + 212, 44, settings.hydrated && settings.musicVolume < 1);
  const track = { x: x + 72, y: y + 230, width: Math.max(0, width - 144), height: 8 };
  drawRoundedPanel(context, track, { fill: gameColors.lavenderSurface, radius: 4 });
  if (settings.musicVolume > 0) drawRoundedPanel(context, { ...track, width: track.width * settings.musicVolume },
    { fill: gameColors.purple, radius: 4 });
  button('settings.back', t('settings.close'), x, y + 306, width);
  context.restore();
  return clipTapTargetsToContent(targets, content);
}
