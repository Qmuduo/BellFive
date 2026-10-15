/** @jest-environment node */
import { hitTest, layoutForScreen } from '../../runtime/layout';
import { homeContentHeight, renderHome } from '../home';
import { gameColors } from '../../../../src/theme/gameColors';

const context = () => ({
  fills: [] as string[], texts: [] as string[],
  fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'middle',
  save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fill() { this.fills.push(this.fillStyle); }, stroke() {},
  fillRect() { this.fills.push(this.fillStyle); }, fillText(text: string) { this.texts.push(text); },
  measureText(text: string) { return { width: Array.from(text).length * 8 }; },
});
const snapshot = (overrides: any = {}) => ({
  app: { fields: { roomCode: '' }, soloDifficulty: 'normal', pendingIntent: null, onlineBusy: false, accountBusy: false, errorCode: null, ...overrides.app },
  auth: { profileVerified: false, user: null, ...overrides.auth },
  profile: { profile: { nickname: 'Guest', avatarId: 'bell' } }, settings: { language: 'en' },
  game: { openRooms: [], lobbySnapshotReceived: false, ...overrides.game }, pendingCreate: overrides.pendingCreate ?? false,
}) as any;

test.each([
  [320, 568, 20, 20, { x: 230, y: 20, width: 84, height: 32 }],
  [375, 667, 44, 34, { x: 280, y: 48, width: 88, height: 32 }],
  [390, 844, 44, 34, { x: 294, y: 48, width: 88, height: 32 }],
] as const)('home presents one fully visible solo start on %s×%s', (w, h, top, bottom, capsule) => {
  const c = context(); const layout = layoutForScreen(w, h, { top, bottom }, capsule);
  const targets = renderHome(c as any, layout, snapshot());
  const start = targets.find(item => item.id === 'home.solo.normal')!;
  expect(start).toBeDefined();
  expect(start.rect.height).toBeGreaterThanOrEqual(56);
  expect(start.rect.y + start.rect.height).toBeLessThanOrEqual(h - bottom);
  expect(targets.filter(item => item.id.startsWith('home.solo.'))).toHaveLength(1);
  expect(targets.map(item => item.id)).toEqual(expect.arrayContaining(['home.difficulty.easy', 'home.difficulty.normal', 'home.difficulty.hard']));
  expect(targets.find(item => item.id === 'home.account')!.rect.y).toBeGreaterThanOrEqual(capsule.y + capsule.height);
  expect(c.texts).toContain('铃果派对');
  expect(c.fills).toContain(gameColors.purple);
  expect(c.fills).toContain(gameColors.lime);
  expect(targets.every(item => item.rect.y >= top && item.rect.y + item.rect.height <= h - bottom)).toBe(true);
});

test('changing difficulty changes the single start target', () => {
  const layout = layoutForScreen(390, 844, { top: 44, bottom: 34 });
  const targets = renderHome(context() as any, layout, snapshot({ app: { soloDifficulty: 'hard' } }));
  expect(targets.filter(item => item.id.startsWith('home.solo.')).map(item => item.id)).toEqual(['home.solo.hard']);
});

test('all home controls remain reachable by scrolling with comfortable touch areas', () => {
  const data = snapshot();
  const layout = layoutForScreen(320, 568, { top: 20, bottom: 20 });
  const ids = new Set<string>();
  const maxScroll = Math.max(0, homeContentHeight(layout, data) - layout.content.height);
  for (const scroll of [0, maxScroll / 2, maxScroll]) {
    layout.scrollY = scroll;
    const targets = renderHome(context() as any, layout, data);
    targets.forEach(target => {
      ids.add(target.id);
      if (target.rect.height >= 44) expect(hitTest({ x: target.rect.x + target.rect.width / 2, y: target.rect.y + target.rect.height / 2 }, targets)).toBe(target.id);
    });
  }
  expect([...ids]).toEqual(expect.arrayContaining(['home.account', 'settings.language', 'home.create', 'field.roomCode', 'home.join', 'home.lobby']));
  const bottom = renderHome(context() as any, layout, data);
  for (const id of ['field.roomCode', 'home.join', 'home.lobby', 'settings.language']) {
    expect(bottom.find(target => target.id === id)!.rect.height).toBeGreaterThanOrEqual(44);
  }
});

test('room updates do not displace homepage controls; browsing belongs to the lobby', () => {
  const layout = layoutForScreen(390, 844, { top: 44, bottom: 34 });
  const rooms = snapshot({ game: { openRooms: [{ roomCode: 'ABCD23', hostProfile: { nickname: 'Mira', avatarId: 'bell' } }] } });
  expect(homeContentHeight(layout, rooms)).toBe(homeContentHeight(layout, snapshot()));
  const targets = renderHome(context() as any, layout, rooms);
  expect(targets.some(target => target.id === 'home.lobby')).toBe(true);
  expect(targets.some(target => target.id.startsWith('lobby.apply.'))).toBe(false);
});

test('home scrolling is continuous across the capsule boundary', () => {
  const data = snapshot();
  const layout = layoutForScreen(320, 568, { top: 20, bottom: 20 }, { x: 230, y: 20, width: 84, height: 32 });
  const startY = (scroll: number) => {
    layout.scrollY = scroll;
    return renderHome(context() as any, layout, data).find(item => item.id === 'home.solo.normal')!.rect.y;
  };
  expect(startY(47) + 47).toBe(startY(48) + 48);
});

test('pending room creation keeps cancellation reachable and disables starting another game', () => {
  const data = snapshot({ pendingCreate: true });
  const layout = layoutForScreen(320, 568, { top: 20, bottom: 20 });
  layout.scrollY = Math.max(0, homeContentHeight(layout, data) - layout.content.height);
  const targets = renderHome(context() as any, layout, data);
  expect(targets.some(item => item.id === 'home.cancelCreate')).toBe(true);
  expect(targets.some(item => item.id.startsWith('home.solo.') || item.id.startsWith('home.difficulty.') || ['home.create', 'home.join', 'home.lobby'].includes(item.id))).toBe(false);
});
