/** @jest-environment node */
import { layoutForScreen } from '../../runtime/layout';
import { homeContentHeight, renderHome } from '../home';
import { gameColors } from '../../../../src/theme/gameColors';

const context = () => ({
  fills: [] as string[], texts: [] as string[], textCalls: [] as { text: string; x: number; y: number }[],
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'middle',
  save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fill() { this.fills.push(this.fillStyle); }, stroke() {},
  fillRect() { this.fills.push(this.fillStyle); }, fillText(text: string, x: number, y: number) { this.texts.push(text); this.textCalls.push({ text, x, y }); },
  measureText(text: string) { return { width: text.length * 8 }; },
});
const snapshot = (overrides: any = {}) => ({
  app: { fields: { roomCode: '' }, pendingIntent: null, onlineBusy: false, accountBusy: false, errorCode: null, ...overrides.app },
  auth: { profileVerified: false, user: null, ...overrides.auth },
  profile: { profile: { nickname: 'Guest', avatarId: 'bell' } }, settings: { language: 'en' },
  game: { openRooms: [], lobbySnapshotReceived: false, ...overrides.game }, pendingCreate: false,
}) as any;

test('home paints Android color hierarchy and keeps all primary actions', () => {
  const c = context(); const layout = layoutForScreen(320, 568, { top: 20, bottom: 20 });
  const targets = renderHome(c as any, layout, snapshot());
  expect(c.texts).toContain('BellFive');
  expect(c.fills).toContain(gameColors.purpleAction);
  expect(c.fills).toContain(gameColors.lime);
  expect(targets.map(item => item.id)).toEqual(expect.arrayContaining(['settings.language', 'home.account', 'home.create', 'home.solo.easy', 'home.solo.normal', 'home.solo.hard', 'home.lobby']));
  const lobby = targets.find(item => item.id === 'home.lobby')!;
  expect(c.textCalls).toContainEqual({ text: 'OPEN ROOMS', x: lobby.rect.x + lobby.rect.width / 2, y: lobby.rect.y + lobby.rect.height / 2 });
  expect(targets.every(item => item.rect.y >= 20 && item.rect.y + item.rect.height <= 548)).toBe(true);
});

test('home room preview has its own join target and bottom code controls remain reachable after scrolling', () => {
  const data = snapshot({ game: { openRooms: [{ roomCode: 'ABCD23', hostProfile: { nickname: 'Mira', avatarId: 'bell' } }] } });
  const layout = layoutForScreen(320, 568, { top: 20, bottom: 20 });
  expect(homeContentHeight(layout, data)).toBeGreaterThan(layout.content.height);
  layout.scrollY = homeContentHeight(layout, data) - layout.content.height;
  const targets = renderHome(context() as any, layout, data);
  expect(targets.some(item => item.id === 'field.roomCode')).toBe(true);
  expect(targets.some(item => item.id === 'home.join')).toBe(true);
  expect(targets.every(item => item.rect.y >= 20 && item.rect.y + item.rect.height <= 548)).toBe(true);
  layout.scrollY = 450;
  expect(renderHome(context() as any, layout, data).some(item => item.id === 'lobby.apply.ABCD23')).toBe(true);
});

test('pending create removes online actions while cancel remains available', () => {
  const layout = layoutForScreen(320, 568, { top: 20, bottom: 20 });
  const data = { ...snapshot(), pendingCreate: true };
  layout.scrollY = homeContentHeight(layout, data) - layout.content.height;
  const targets = renderHome(context() as any, layout, data);
  expect(targets.some(item => item.id === 'home.create')).toBe(false);
  expect(targets.some(item => item.id === 'home.cancelCreate')).toBe(true);
});
