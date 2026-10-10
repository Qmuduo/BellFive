/** @jest-environment node */
import { layoutForScreen } from '../../runtime/layout';
import { createMiniGameApp } from '../../runtime/navigation';
import { dispatchLobbyAction, renderLobby } from '../lobby';

const ctx = () => ({ fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left', textBaseline: 'middle',
  save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, fillRect() {}, fillText() {}, measureText: (text: string) => ({ width: text.length * 8 }) });
const room = (roomCode: string) => ({ roomCode, hostProfile: { nickname: 'Mira', avatarId: 'bell' } });
const snapshot = (rooms: any[], applicationId: string | null = null) => ({
  app: { fields: { roomCode: '' }, lobbyPage: 0, pendingIntent: null, onlineBusy: false, accountBusy: false, pendingCancelApplicationId: null },
  auth: {}, profile: {}, settings: { language: 'en' },
  game: { openRooms: rooms, localApplicationId: applicationId, applyingRoomCode: null, localApplicationStatus: null, lobbySnapshotReceived: true, connectionStatus: 'connected', error: null },
}) as any;

test('lobby room actions occupy separate card button and remain inside safe viewport', () => {
  const targets = renderLobby(ctx() as any, layoutForScreen(320, 568, { top: 20, bottom: 20 }), snapshot([room('ABCD23')]));
  const apply = targets.find(item => item.id === 'lobby.apply.ABCD23')!;
  expect(apply.rect.width).toBeLessThan(120);
  expect(targets.map(item => item.id)).toEqual(expect.arrayContaining(['lobby.refresh', 'field.roomCode', 'home.join', 'nav.home']));
  expect(targets.every(item => item.rect.y >= 20 && item.rect.y + item.rect.height <= 548)).toBe(true);
});

test('pending application disables room actions and shows cancel', () => {
  const targets = renderLobby(ctx() as any, layoutForScreen(320, 568, { top: 20, bottom: 20 }), snapshot([room('ABCD23')], 'application-1'));
  expect(targets.some(item => item.id === 'lobby.apply.ABCD23')).toBe(false);
  expect(targets.some(item => item.id === 'lobby.cancel')).toBe(true);
});

test('lobby pagination dispatch uses the same page size as the rendered rooms', async () => {
  const rooms = ['ABCD23', 'ABCD24', 'ABCD25', 'ABCD26', 'ABCD27'].map(room);
  const app = createMiniGameApp();
  const stores = { game: { getState: () => ({ openRooms: rooms }) } } as any;
  await dispatchLobbyAction('lobby.next', app, stores);
  await dispatchLobbyAction('lobby.next', app, stores);
  await dispatchLobbyAction('lobby.next', app, stores);
  expect(app.getState().lobbyPage).toBe(2);
  const page = { ...snapshot(rooms), app: { ...snapshot(rooms).app, lobbyPage: app.getState().lobbyPage } };
  const targets = renderLobby(ctx() as any, layoutForScreen(320, 568, { top: 20, bottom: 20 }), page as any);
  expect(targets.some(item => item.id === 'lobby.apply.ABCD27')).toBe(true);
  expect(targets.some(item => item.id === 'lobby.apply.ABCD26')).toBe(false);
  await dispatchLobbyAction('lobby.previous', app, stores);
  expect(app.getState().lobbyPage).toBe(1);
  app.dispose();
});
