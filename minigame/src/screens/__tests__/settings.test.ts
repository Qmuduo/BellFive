/** @jest-environment node */
import { createSettingsStoreApi } from '../../../../src/store/createSettingsStoreApi';
import { layoutForScreen, hitTest } from '../../runtime/layout';
import { dispatchSettingsAction, renderSettings, settingsContentHeight } from '../settings';

test.each([[320, 568], [844, 390]])('settings controls remain reachable and separated at %sx%s', (width, height) => {
  const texts: string[] = [];
  const ctx = { font: '', fillStyle: '', strokeStyle: '', textAlign: '', textBaseline: '', lineWidth: 1,
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {},
    fillText(value: string) { texts.push(value); }, measureText(value: string) { return { width: value.length * 7 }; } };
  const settings = createSettingsStoreApi({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  settings.getState().setLanguage('en');
  const layout = layoutForScreen(width, height, { top: 20, bottom: 20 }, { x: width - 96, y: 20, width: 90, height: 32 });
  const seen = new Set<string>();
  for (const scroll of [0, Math.max(0, settingsContentHeight(layout) - layout.content.height)]) {
    layout.scrollY = scroll;
    const targets = renderSettings(ctx as any, layout, { settings: settings.getState() } as any);
    for (const target of targets) {
      seen.add(target.id);
      expect(hitTest({ x: target.rect.x + target.rect.width / 2, y: target.rect.y + target.rect.height / 2 }, targets)).toBe(target.id);
    }
  }
  expect([...seen]).toEqual(expect.arrayContaining(['settings.music.toggle', 'settings.music.quieter', 'settings.music.louder', 'settings.back']));
  expect(texts).toContain('15%');
  dispatchSettingsAction('settings.music.louder', { settings } as any);
  expect(settings.getState().musicVolume).toBe(0.25);
  dispatchSettingsAction('settings.music.quieter', { settings } as any);
  expect(settings.getState().musicVolume).toBe(0.15);
  settings.getState().setMusicVolume(0);
  dispatchSettingsAction('settings.music.quieter', { settings } as any);
  expect(settings.getState().musicVolume).toBe(0);
  settings.getState().setMusicVolume(1);
  dispatchSettingsAction('settings.music.louder', { settings } as any);
  expect(settings.getState().musicVolume).toBe(1);
});
