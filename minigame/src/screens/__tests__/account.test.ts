/** @jest-environment node */
import { gameColors } from '../../../../src/theme/gameColors';
import { layoutForScreen } from '../../runtime/layout';
import { createMiniGameApp } from '../../runtime/navigation';
import { accountContentHeight, renderAccount } from '../account';

function canvas() {
  const texts: string[] = []; const fills: string[] = []; const strokes: { color: string; width: number }[] = [];
  return { texts, fills, strokes, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'middle',
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {},
    fill() { fills.push(this.fillStyle); }, stroke() { strokes.push({ color: this.strokeStyle, width: this.lineWidth }); }, fillRect() { fills.push(this.fillStyle); },
    fillText(text: string) { texts.push(text); }, measureText(text: string) { return { width: text.length * 7 }; } };
}
const data = (mode: string, overrides: any = {}) => ({
  app: { fields: { username: 'player', password: 'secretpassword', nickname: 'Guest', roomCode: '' },
    accountMode: mode, avatarId: 'bell', confirmTransfer: false, accountBusy: false, onlineBusy: false,
    errorCode: null, notice: null, ...overrides.app },
  auth: { user: null, sessionToken: null, pending: false, profileVerified: false, errorCode: null, ...overrides.auth },
  profile: { profile: { nickname: 'Guest', avatarId: 'bell' } },
  settings: { language: 'en' }, game: { error: null },
}) as any;
const geometry = () => layoutForScreen(320, 568, { top: 20, bottom: 20 });

test('guest menu paints grouped account actions and visible Android color surfaces', () => {
  const c = canvas(); const targets = renderAccount(c as any, geometry(), data('menu'));
  const ids = targets.map(item => item.id);
  expect(ids).toEqual(expect.arrayContaining(['account.mode.profile', 'account.wechat', 'account.mode.login',
    'account.mode.register', 'account.mode.reset', 'settings.language', 'nav.home']));
  expect(c.fills).toEqual(expect.arrayContaining([gameColors.canvas, gameColors.surface, gameColors.purpleAction]));
  expect(c.texts).toContain('Guest');
});

test('profile form keeps every avatar and save/back reachable after scrolling a short safe viewport', () => {
  const layout = geometry(); const snapshot = data('profile');
  expect(accountContentHeight(layout, snapshot)).toBeGreaterThan(layout.content.height);
  layout.scrollY = accountContentHeight(layout, snapshot) - layout.content.height;
  const targets = renderAccount(canvas() as any, layout, snapshot);
  expect(targets.map(item => item.id)).toEqual(expect.arrayContaining(['account.submit', 'account.mode.menu', 'nav.home']));
  expect(targets.every(item => item.rect.y >= 20 && item.rect.y + item.rect.height <= 548)).toBe(true);
  layout.scrollY = 220;
  const avatars = renderAccount(canvas() as any, layout, snapshot).map(item => item.id);
  expect(avatars).toEqual(expect.arrayContaining(['account.avatar.banana', 'account.avatar.grape', 'account.avatar.pear',
    'account.avatar.strawberry', 'account.avatar.peach', 'account.avatar.bell']));
});

test.each(['login', 'register', 'credentials', 'link', 'reset'])('%s form labels fields and masks password without exposing it', mode => {
  const c = canvas(); const snapshot = data(mode, { app: { confirmTransfer: true } });
  const layout = geometry(); layout.scrollY = 120;
  const targets = renderAccount(c as any, layout, snapshot).map(item => item.id);
  expect(targets).toContain('field.password');
  if (mode === 'reset') expect(targets).not.toContain('field.username');
  else expect(targets).toContain('field.username');
  if (mode === 'link') expect(targets).toContain('account.confirmTransfer');
  expect(c.texts.join(' ')).toContain('••');
  expect(c.texts.join(' ')).not.toContain('secretpassword');
});

test('link submit requires visible transfer confirmation and keyboard errors keep submit disabled', () => {
  const layout = geometry(); layout.scrollY = 300;
  const unconfirmed = renderAccount(canvas() as any, layout, data('link'));
  expect(unconfirmed.some(item => item.id === 'account.submit')).toBe(false);
  const confirmed = renderAccount(canvas() as any, layout, data('link', { app: { confirmTransfer: true } }));
  expect(confirmed.some(item => item.id === 'account.submit')).toBe(true);
  const broken = renderAccount(canvas() as any, layout, data('link', { app: { confirmTransfer: true, errorCode: 'KEYBOARD_UNAVAILABLE' } }));
  expect(broken.some(item => item.id === 'account.submit')).toBe(false);
});

test('credential failure paints the localized error in a visible error panel', () => {
  const c = canvas();
  renderAccount(c as any, geometry(), data('login', { app: { errorCode: 'INVALID_CREDENTIALS' } }));
  expect(c.fills).toContain('#FBE6E3');
  expect(c.texts.join('')).toContain('The username or password is incorrect.');
});

test('link form heading describes the requested identity transfer in both languages', () => {
  const en = canvas(); renderAccount(en as any, geometry(), data('link'));
  expect(en.texts).toContain('Link an existing account');
  const zh = canvas(); const snapshot = data('link'); snapshot.settings.language = 'zh-CN';
  renderAccount(zh as any, geometry(), snapshot);
  expect(zh.texts).toContain('绑定已有用户名账号');
});

test.each(['menu', 'login', 'register', 'credentials', 'link', 'reset'])('%s footer actions stay reachable at the end of a short screen', mode => {
  const layout = geometry(); const snapshot = data(mode, { app: { confirmTransfer: true } });
  layout.scrollY = Math.max(0, accountContentHeight(layout, snapshot) - layout.content.height);
  const targets = renderAccount(canvas() as any, layout, snapshot);
  expect(targets.map(item => item.id)).toContain('nav.home');
  if (mode !== 'menu') {
    expect(targets.map(item => item.id)).toEqual(expect.arrayContaining(['account.submit', 'account.mode.menu']));
  }
  expect(targets.every(item => item.rect.y >= 20 && item.rect.y + item.rect.height <= 548)).toBe(true);
});

test('signed-in menu exposes account management and paints busy or success feedback', () => {
  const user = { username: null, wechatLinked: true, profile: { nickname: 'Mira', avatarId: 'pear' } };
  const snapshot = data('menu', { auth: { user, sessionToken: 'token', profileVerified: true } });
  const ids = renderAccount(canvas() as any, geometry(), snapshot).map(item => item.id);
  expect(ids).toEqual(expect.arrayContaining(['account.refresh', 'account.mode.credentials', 'account.mode.link',
    'account.mode.reset', 'account.logout']));
  const busy = canvas();
  expect(renderAccount(busy as any, geometry(), data('menu', { app: { accountBusy: true } })).map(item => item.id)).not.toContain('account.wechat');
  expect(busy.texts.join(' ')).toMatch(/CONNECTING|连接/);
  const success = canvas(); renderAccount(success as any, geometry(), data('profile', { app: { notice: 'account.profileSaved' } }));
  expect(success.texts.join(' ')).toMatch(/saved|保存/);
});

test('keyboard focus paints active input border and clears on blur or page navigation', () => {
  const keyboard = { focus: jest.fn(), blur: jest.fn(), dispose: jest.fn() };
  const app = createMiniGameApp(keyboard);
  app.focusField('username');
  expect(app.getState().focusedField).toBe('username');
  const focused = canvas();
  renderAccount(focused as any, geometry(), data('login', { app: { ...app.getState(), accountMode: 'login' } }));
  expect(focused.strokes).toContainEqual({ color: gameColors.purple, width: 2 });
  keyboard.focus.mock.calls[0][0].onConfirm('updated');
  expect(app.getState().focusedField).toBeNull(); expect(app.getState().fields.username).toBe('updated');
  app.focusField('username');
  app.clearPasswords(); expect(app.getState().focusedField).toBeNull(); expect(keyboard.blur).toHaveBeenCalled();
  app.focusField('username'); keyboard.focus.mock.calls.at(-1)[0].onCancel();
  expect(app.getState().focusedField).toBeNull();
  app.focusField('password'); app.navigation.navigate('account');
  expect(app.getState().focusedField).toBeNull();
  app.dispose();
});
