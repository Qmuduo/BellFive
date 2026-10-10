import { AuthClientError } from '../../../src/auth/contracts';
import type { AuthStore } from '../../../src/auth/createAuthStoreApi';
import type { GameStore } from '../../../src/store/createGameStoreApi';
import type { PlayerProfileStore } from '../../../src/store/createProfileStoreApi';
import type { SettingsStore } from '../../../src/store/createSettingsStoreApi';
import { translate, formatGameError, type TranslationKey } from '../../../src/i18n';
import { formatAuthError } from '../../../src/i18n/translations';
import { AVATAR_EMOJI } from '../../../src/profile';
import { gameColors } from '../../../src/theme/gameColors';
import { getWechatLoginCode } from '../platform/wechatLogin';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp, MiniGameAppState, OnlineIntent, InputField } from '../runtime/navigation';
import { clipTapTargetsToContent, type Rect, type ScreenLayout, type TapTarget } from '../runtime/layout';
import { drawAvatarBadge, drawCanvasButton, drawInputField, drawRoundedPanel } from '../runtime/ui';
import type { MiniGameStores } from '../stores/gameStore';
import { dispatchAccountAction } from './account';
import { dispatchLobbyAction } from './lobby';

export interface ScreenSnapshot {
  readonly app: MiniGameAppState;
  readonly auth: AuthStore;
  readonly profile: PlayerProfileStore;
  readonly settings: SettingsStore;
  readonly game: Readonly<GameStore>;
  readonly pendingCreate?: boolean;
}
const pendingCreates = new WeakMap<MiniGameApp, { cancel(): void }>();
export function getScreenSnapshot(app: MiniGameApp, stores: MiniGameStores): ScreenSnapshot {
  return { app: app.getState(), auth: stores.auth.getState(), profile: stores.profile.getState(),
    settings: stores.settings.getState(), game: stores.game.getState(), pendingCreate: pendingCreates.has(app) };
}
export function label(snapshot: ScreenSnapshot, key: TranslationKey): string { return translate(snapshot.settings.language, key); }
export function appError(snapshot: ScreenSnapshot): string {
  const code = snapshot.app.errorCode ?? snapshot.auth.errorCode;
  if (code === 'INVALID_ROOM_CODE') return label(snapshot, 'entry.invalidRoomCode');
  if (code === 'TRANSFER_CONFIRMATION_REQUIRED') return snapshot.settings.language === 'en'
    ? 'Confirm moving this WeChat identity to the existing account.' : '请明确确认将微信身份绑定到已有账号。';
  return code ? formatAuthError(snapshot.settings.language, code)
    : snapshot.game.error ? formatGameError(snapshot.settings.language, snapshot.game.error.code) : '';
}
export interface ScreenRow { id?: string; text: string; enabled?: boolean; accent?: boolean; }

/** A small native Canvas layout shared by the three menu screens. Hit boxes equal painted rows. */
export function drawMenu(context: CanvasContext2D, layout: ScreenLayout, title: string,
  status: string, rows: readonly ScreenRow[]): TapTarget[] {
  const { content } = layout;
  const margin = Math.min(18, content.width / 12, content.height / 16);
  const width = Math.max(0, content.width - 2 * margin);
  const titleHeight = Math.min(42, content.height / 10);
  const statusHeight = Math.min(70, content.height / 6);
  const gap = Math.min(8, content.height / 80);
  const top = content.y + margin + titleHeight + statusHeight;
  const rowHeight = Math.min(48, Math.max(0, (content.y + content.height - margin - top - gap * (rows.length - 1)) / Math.max(1, rows.length)));
  const fit = (text: string, maximum: number) => {
    let chars = Array.from(text);
    while (chars.length && context.measureText(chars.join('')).width > maximum) chars = chars.slice(0, -1);
    return chars.length < Array.from(text).length ? `${chars.slice(0, -1).join('')}…` : text;
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = '#f5f1e8'; context.fillRect(content.x, content.y, content.width, content.height);
  context.textAlign = 'left'; context.textBaseline = 'middle'; context.fillStyle = '#493450';
  context.font = 'bold 26px sans-serif'; context.fillText(fit(title, width), content.x + margin, content.y + margin + titleHeight / 2);
  context.font = '13px sans-serif';
  // Status wraps across at most three lines so account and network errors remain readable.
  const lines: string[] = []; let current = '';
  for (const char of Array.from(status)) {
    if (current && context.measureText(current + char).width > width) { lines.push(current); current = ''; }
    current += char;
  }
  if (current) lines.push(current);
  lines.slice(0, 3).forEach((line, index) => context.fillText(line, content.x + margin, content.y + margin + titleHeight + 12 + index * 17));
  const targets: TapTarget[] = [];
  rows.forEach((row, index) => {
    const rect = { x: content.x + margin, y: top + index * (rowHeight + gap), width, height: rowHeight };
    context.fillStyle = row.enabled === false ? '#e6e1e8' : row.accent ? '#dff38e' : '#fffefa';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    context.fillStyle = row.enabled === false ? '#817586' : '#493450';
    context.font = `${row.accent ? 'bold ' : ''}${Math.min(16, Math.max(10, rowHeight / 2.8))}px sans-serif`;
    context.fillText(fit(row.text, width - 20), rect.x + 10, rect.y + rect.height / 2);
    if (row.id && row.enabled !== false && rect.height > 0) targets.push({ id: row.id, rect, enabled: true });
  });
  context.restore(); return targets;
}

const HOME_MARGIN = 18;
const HOME_GAP = 12;
const HOME_ROOM_HEIGHT = 64;

/** Includes the safe content origin only through the runtime's viewport height. */
export function homeContentHeight(layout: ScreenLayout, snapshot: ScreenSnapshot): number {
  const rooms = Math.min(2, snapshot.game.openRooms.length);
  const extras = snapshot.pendingCreate ? 44 : snapshot.app.pendingIntent ? 88 : 0;
  const status = appError(snapshot) || snapshot.pendingCreate || snapshot.app.onlineBusy ? 42 : 0;
  return 12 + 36 + 132 + 86 + 58 + 134 + 38 + (rooms ? rooms * (HOME_ROOM_HEIGHT + 8) : 52)
    + 24 + 56 + 56 + extras + status + 34 + HOME_MARGIN;
}

export function drawScreenText(context: CanvasContext2D, text: string, x: number, y: number,
  size: number, color: string, align: 'left' | 'center' | 'right' = 'left', maxWidth?: number): void {
  context.save(); context.fillStyle = color; context.font = `900 ${size}px sans-serif`;
  context.textAlign = align; context.textBaseline = 'middle';
  if (maxWidth && context.measureText(text).width > maxWidth) {
    while (text.length > 1 && context.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
    text += '…';
  }
  context.fillText(text, x, y); context.restore();
}

export function drawRoomCard(context: CanvasContext2D, rect: Rect, room: ScreenSnapshot['game']['openRooms'][number],
  snapshot: ScreenSnapshot, enabled: boolean): Rect {
  drawRoundedPanel(context, rect, { fill: gameColors.surface, border: gameColors.border, radius: 14 });
  drawAvatarBadge(context, { x: rect.x + 10, y: rect.y + 12, width: 38, height: 38 }, AVATAR_EMOJI[room.hostProfile.avatarId],
    { background: gameColors.lavenderSurface, foreground: gameColors.plum, fontSize: 22, radius: 19 });
  const buttonWidth = Math.min(72, rect.width * 0.27);
  const button = { x: rect.x + rect.width - buttonWidth - 10, y: rect.y + 13, width: buttonWidth, height: 38 };
  drawScreenText(context, room.hostProfile.nickname || label(snapshot, 'waiting.unnamed'), rect.x + 56, rect.y + 24, 12, gameColors.plum,
    'left', Math.max(25, button.x - rect.x - 64));
  drawScreenText(context, room.roomCode, rect.x + 56, rect.y + 43, 10, gameColors.muted);
  drawCanvasButton(context, button, label(snapshot, 'entry.join'), { variant: 'secondary', enabled, fontSize: 10, radius: 10 });
  return button;
}

export function renderHome(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { content } = layout;
  const margin = Math.min(HOME_MARGIN, content.width / 12);
  const x = content.x + margin; const width = content.width - margin * 2;
  let y = content.y + 12 - layout.scrollY;
  const targets: TapTarget[] = [];
  const busy = snapshot.app.onlineBusy || snapshot.app.accountBusy || snapshot.pendingCreate;
  const keyboardUnavailable = snapshot.app.errorCode === 'KEYBOARD_UNAVAILABLE';
  const profile = snapshot.auth.profileVerified && snapshot.auth.user ? snapshot.auth.user.profile : snapshot.profile.profile;
  const action = (id: string, rect: Rect, title: string, variant: 'primary' | 'secondary' | 'lime' | 'text', enabled = true, fontSize = 13) => {
    drawCanvasButton(context, rect, title, { variant, enabled, fontSize, radius: 14 });
    if (enabled) targets.push({ id, rect });
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
  action('settings.language', { x, y, width: Math.min(110, width * 0.4), height: 36 }, snapshot.settings.language === 'en' ? 'English' : '简体中文', 'text', true, 10);
  action('home.account', { x: x + width - Math.min(110, width * 0.4), y, width: Math.min(110, width * 0.4), height: 36 }, label(snapshot, 'entry.account'), 'secondary', !busy, 10);
  y += 50;
  const bell = { x: x + width / 2 - 28, y, width: 56, height: 56 };
  drawRoundedPanel(context, bell, { fill: gameColors.lime, radius: 18 });
  drawScreenText(context, '🔔', x + width / 2, y + 28, 30, gameColors.plum, 'center');
  drawScreenText(context, 'BellFive', x + width / 2, y + 86, 30, gameColors.plum, 'center');
  drawScreenText(context, label(snapshot, 'entry.description'), x + width / 2, y + 111, 11, gameColors.muted, 'center', width);
  y += 132;
  const profileRect = { x, y, width, height: 74 };
  drawRoundedPanel(context, profileRect, { fill: gameColors.surface, border: gameColors.border, radius: 18 });
  drawAvatarBadge(context, { x: x + 12, y: y + 15, width: 44, height: 44 }, AVATAR_EMOJI[profile.avatarId],
    { background: gameColors.lavenderSurface, foreground: gameColors.plum, fontSize: 24, radius: 22 });
  drawScreenText(context, label(snapshot, 'entry.profile'), x + 66, y + 24, 9, gameColors.muted);
  drawScreenText(context, profile.nickname || label(snapshot, 'account.guest'), x + 66, y + 48, 15, gameColors.plum, 'left', width - 80);
  y += 86;
  action('home.create', { x, y, width, height: 58 }, snapshot.pendingCreate ? label(snapshot, 'entry.connecting') : label(snapshot, 'entry.createRoom'), 'primary', !busy, 16);
  y += 70;
  drawRoundedPanel(context, { x, y, width, height: 122 }, { fill: gameColors.surface, radius: 16 });
  drawRoundedPanel(context, { x: x + 10, y: y + 10, width: width - 20, height: 46 }, { fill: gameColors.lime, radius: 14 });
  drawScreenText(context, label(snapshot, 'entry.singlePlayer'), x + width / 2, y + 33, 13, gameColors.plum, 'center', width - 32);
  drawScreenText(context, label(snapshot, 'entry.chooseDifficulty'), x + width / 2, y + 70, 9, gameColors.muted, 'center');
  const gap = 6; const difficultyWidth = (width - 32 - gap * 2) / 3;
  (['easy', 'normal', 'hard'] as const).forEach((difficulty, index) => action(`home.solo.${difficulty}`,
    { x: x + 16 + index * (difficultyWidth + gap), y: y + 84, width: difficultyWidth, height: 30 },
    label(snapshot, `difficulty.${difficulty}`), 'secondary', !snapshot.pendingCreate, 10));
  y += 134;
  drawScreenText(context, label(snapshot, 'entry.openRooms'), x, y + 17, 12, gameColors.plum);
  action('home.lobby', { x: x + width - 94, y, width: 94, height: 34 }, label(snapshot, 'entry.refresh'), 'text', !busy, 10);
  y += 38;
  const rooms = snapshot.game.openRooms.slice(0, 2);
  if (rooms.length) rooms.forEach(room => {
    const rect = drawRoomCard(context, { x, y, width, height: HOME_ROOM_HEIGHT }, room, snapshot, !busy && !snapshot.game.localApplicationId && !snapshot.game.applyingRoomCode);
    if (!busy && !snapshot.game.localApplicationId && !snapshot.game.applyingRoomCode) targets.push({ id: `lobby.apply.${room.roomCode}`, rect });
    y += HOME_ROOM_HEIGHT + 8;
  });
  else {
    drawRoundedPanel(context, { x, y, width, height: 44 }, { fill: gameColors.surface, radius: 12 });
    drawScreenText(context, snapshot.auth.sessionToken ? (snapshot.game.lobbySnapshotReceived ? label(snapshot, 'entry.emptyRooms') : label(snapshot, 'entry.connecting')) : label(snapshot, 'entry.onlineSignIn'),
      x + width / 2, y + 22, 10, gameColors.muted, 'center', width - 20);
    y += 52;
  }
  y += HOME_GAP;
  drawScreenText(context, label(snapshot, 'entry.joinByCode'), x + width / 2, y + 12, 10, gameColors.muted, 'center');
  y += 24;
  const input = { x, y, width, height: 52 };
  drawInputField(context, input, label(snapshot, 'entry.roomCode'), snapshot.app.fields.roomCode || '______',
    { focused: false, enabled: !busy, fontSize: 16, radius: 14 });
  if (!busy) targets.push({ id: 'field.roomCode', rect: input });
  y += 56;
  action('home.join', { x, y, width, height: 52 }, label(snapshot, 'entry.joinRoom'), 'secondary', !busy && !keyboardUnavailable, 14);
  y += 56;
  if (snapshot.pendingCreate) { action('home.cancelCreate', { x, y, width, height: 40 }, snapshot.settings.language === 'en' ? 'Cancel room creation' : '取消创建房间', 'text'); y += 44; }
  else if (snapshot.app.pendingIntent) {
    if (!busy) action('auth.retry', { x, y, width, height: 40 }, label(snapshot, 'entry.refresh'), 'text');
    y += 44; action('auth.cancel', { x, y, width, height: 40 }, label(snapshot, 'auth.back'), 'text'); y += 44;
  }
  const status = appError(snapshot) || (busy ? label(snapshot, 'entry.connecting') : '');
  if (status) drawScreenText(context, status, x + width / 2, y + 20, 10, gameColors.muted, 'center', width);
  context.restore();
  return clipTapTargetsToContent(targets, content);
}

/** Auth completion does not complete room creation. Keep its intent locked until the
 * real GameStore receives a session, a matching terminal error, or a cancellation. */
function createPendingRoom(app: MiniGameApp, stores: MiniGameStores, generation: number): void {
  const baselineVersion = stores.game.getState().roomSessionVersion;
  let requestId = '';
  let started = false;
  let stopGame = () => {};
  let stopApp = () => {};
  const finish = (result: 'success' | 'error' | 'transport-error' | 'cancel') => {
    if (pendingCreates.get(app) !== pending) return;
    pendingCreates.delete(app); stopGame(); stopApp();
    if (result === 'cancel' || result === 'transport-error') stores.game.getState().resetClient();
    if (result === 'error' && app.intentIsCurrent(generation)) app.update({ onlineBusy: false });
    else if (result === 'transport-error' && app.intentIsCurrent(generation)) app.update({ onlineBusy: false, errorCode: 'NETWORK_ERROR' });
    else app.clearIntent();
  };
  const pending = { cancel: () => finish('cancel') };
  const observeGame = () => {
    if (!started) return;
    const game = stores.game.getState();
    if (game.roomSessionVersion !== baselineVersion && game.sessionMode === 'online') finish('success');
    else if (!requestId || !game.client || game.connectionStatus === 'disconnected'
      || (game.error?.requestId === requestId)
      || game.error?.code === 'AUTH_REQUIRED' || game.error?.code === 'CONNECTION_CLOSED') finish('error');
    else if (game.error?.code === 'NETWORK_ERROR') finish('transport-error');
  };
  pendingCreates.set(app, pending);
  stopGame = stores.game.subscribe(observeGame);
  stopApp = app.subscribe(() => { if (!app.intentIsCurrent(generation)) pending.cancel(); });
  try {
    requestId = stores.game.getState().createRoom(); started = true; observeGame();
  } catch (error) { finish('cancel'); throw error; }
}

function codeOf(error: unknown): string {
  return error instanceof AuthClientError ? error.code : 'NETWORK_ERROR';
}
const authorizing = new WeakMap<MiniGameStores, Promise<void>>();
export async function authorizeOnline(stores: MiniGameStores): Promise<void> {
  const existing = authorizing.get(stores); if (existing) return existing;
  const operation = (async () => {
    await stores.ready;
    let auth = stores.auth.getState();
    if (auth.sessionToken && (auth.sessionExpiresAt ?? 0) <= Date.now()) {
      await auth.logout(); auth = stores.auth.getState();
    }
    if (auth.sessionToken && !auth.profileVerified) {
      await auth.refreshSession(); auth = stores.auth.getState();
      if (auth.sessionToken && !auth.profileVerified) throw new AuthClientError(auth.errorCode ?? 'PROFILE_REFRESH_REQUIRED', 'Refresh required.');
    }
    if (!auth.sessionToken) await stores.auth.getState().wechatLogin(await getWechatLoginCode(stores.wx));
    auth = stores.auth.getState();
    if (!auth.user || !auth.profileVerified || !auth.sessionToken || (auth.sessionExpiresAt ?? 0) <= Date.now()) {
      throw new AuthClientError('UNAUTHORIZED', 'A valid account session is required.');
    }
  })();
  authorizing.set(stores, operation);
  try { await operation; } finally { if (authorizing.get(stores) === operation) authorizing.delete(stores); }
}
async function runIntent(intent: OnlineIntent, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  if (app.getState().onlineBusy || app.getState().accountBusy || pendingCreates.has(app)) return;
  const generation = app.beginIntent(intent);
  try {
    await authorizeOnline(stores);
    if (!app.intentIsCurrent(generation)) return;
    const game = stores.game.getState();
    game.clearError();
    if (intent.type === 'create-room') createPendingRoom(app, stores, generation);
    else {
      app.clearIntent();
      if (intent.type === 'open-lobby') game.openLobby(); else game.joinRoom(intent.roomCode);
      app.navigation.navigate('lobby');
    }
  } catch (error) {
    if (app.intentIsCurrent(generation)) app.update({ onlineBusy: false, errorCode: codeOf(error) });
  }
}
export function validatedRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(normalized) ? normalized : null;
}

export async function dispatchScreenAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  if (actionId === 'home.cancelCreate') { pendingCreates.get(app)?.cancel(); return; }
  if (actionId === 'home.join' && app.getState().errorCode === 'KEYBOARD_UNAVAILABLE') return;
  if (pendingCreates.has(app) && (actionId.startsWith('home.') || actionId.startsWith('account.')
    || actionId.startsWith('lobby.') || actionId === 'auth.retry' || actionId === 'field.roomCode')) return;
  if (actionId.startsWith('field.')) {
    const field = actionId.slice(6);
    if (['username', 'password', 'nickname', 'roomCode'].includes(field)) app.focusField(field as InputField);
    return;
  }
  if (actionId === 'settings.language') {
    const settings = stores.settings.getState(); settings.setLanguage(settings.language === 'en' ? 'zh-CN' : 'en'); return;
  }
  if (actionId === 'auth.cancel') { app.clearIntent(); app.clearPasswords(); return; }
  if (actionId === 'auth.retry') {
    const intent = app.getState().pendingIntent; if (intent) await runIntent(intent, app, stores); return;
  }
  if (actionId === 'nav.home') {
    app.clearIntent(); app.clearPasswords(); app.navigation.navigate('home', true); return;
  }
  if (actionId === 'home.account') {
    app.clearIntent(); app.update({ accountMode: 'menu', errorCode: null, notice: null }); app.navigation.navigate('account'); return;
  }
  if (actionId.startsWith('home.solo.')) {
    const difficulty = actionId.slice(10);
    if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return;
    app.clearIntent(); app.clearPasswords();
    const auth = stores.auth.getState();
    stores.game.getState().startSinglePlayer(auth.profileVerified && auth.user ? auth.user.profile : stores.profile.getState().profile, difficulty);
    app.navigation.navigate('solo'); return;
  }
  if (actionId === 'home.create') { await runIntent({ type: 'create-room' }, app, stores); return; }
  if (actionId === 'home.lobby') { await runIntent({ type: 'open-lobby' }, app, stores); return; }
  if (actionId === 'home.join') {
    const roomCode = validatedRoomCode(app.getState().fields.roomCode);
    if (!roomCode) { app.update({ errorCode: 'INVALID_ROOM_CODE' }); return; }
    await runIntent({ type: 'join-room', roomCode }, app, stores); return;
  }
  if (actionId.startsWith('account.')) { await dispatchAccountAction(actionId, app, stores); return; }
  if (actionId.startsWith('lobby.')) await dispatchLobbyAction(actionId, app, stores);
}
