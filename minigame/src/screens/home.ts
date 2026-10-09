import { AuthClientError } from '../../../src/auth/contracts';
import type { AuthStore } from '../../../src/auth/createAuthStoreApi';
import type { GameStore } from '../../../src/store/createGameStoreApi';
import type { PlayerProfileStore } from '../../../src/store/createProfileStoreApi';
import type { SettingsStore } from '../../../src/store/createSettingsStoreApi';
import { translate, formatGameError, type TranslationKey } from '../../../src/i18n';
import { formatAuthError } from '../../../src/i18n/translations';
import { AVATAR_EMOJI } from '../../../src/profile';
import { getWechatLoginCode } from '../platform/wechatLogin';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp, MiniGameAppState, OnlineIntent, InputField } from '../runtime/navigation';
import type { ScreenLayout, TapTarget } from '../runtime/layout';
import type { MiniGameStores } from '../stores/gameStore';
import { dispatchAccountAction } from './account';
import { dispatchLobbyAction } from './lobby';

export interface ScreenSnapshot {
  readonly app: MiniGameAppState;
  readonly auth: AuthStore;
  readonly profile: PlayerProfileStore;
  readonly settings: SettingsStore;
  readonly game: Readonly<GameStore>;
}
export function getScreenSnapshot(app: MiniGameApp, stores: MiniGameStores): ScreenSnapshot {
  return { app: app.getState(), auth: stores.auth.getState(), profile: stores.profile.getState(),
    settings: stores.settings.getState(), game: stores.game.getState() };
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

export function renderHome(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const busy = snapshot.app.onlineBusy || snapshot.app.accountBusy;
  const profile = snapshot.auth.profileVerified && snapshot.auth.user ? snapshot.auth.user.profile : snapshot.profile.profile;
  const rows: ScreenRow[] = [
    ...(['easy', 'normal', 'hard'] as const).map(difficulty => ({ id: `home.solo.${difficulty}`,
      text: `${label(snapshot, 'entry.singlePlayer')} · ${label(snapshot, `difficulty.${difficulty}`)}`, accent: true })),
    { id: 'home.create', text: label(snapshot, 'entry.createRoom'), enabled: !busy },
    { id: 'home.lobby', text: label(snapshot, 'entry.openRooms'), enabled: !busy },
    { id: 'field.roomCode', text: `${label(snapshot, 'entry.roomCode')}: ${snapshot.app.fields.roomCode || '______'}`, enabled: !busy },
    { id: 'home.join', text: label(snapshot, 'entry.joinRoom'), enabled: !busy },
    { id: 'home.account', text: label(snapshot, 'entry.account'), enabled: !busy },
    { id: 'settings.language', text: `${label(snapshot, 'settings.title')}: ${snapshot.settings.language === 'en' ? 'English' : '简体中文'}` },
  ];
  if (snapshot.app.pendingIntent) {
    if (!busy) rows.push({ id: 'auth.retry', text: label(snapshot, 'entry.refresh') });
    rows.push({ id: 'auth.cancel', text: label(snapshot, 'auth.back') });
  }
  const status = appError(snapshot) || (busy ? label(snapshot, 'entry.connecting')
    : `${AVATAR_EMOJI[profile.avatarId]} ${profile.nickname || label(snapshot, 'account.guest')}`);
  return drawMenu(context, layout, 'BellFive', status, rows);
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
  if (app.getState().onlineBusy || app.getState().accountBusy) return;
  const generation = app.beginIntent(intent);
  try {
    await authorizeOnline(stores);
    if (!app.intentIsCurrent(generation)) return;
    app.clearIntent();
    const game = stores.game.getState();
    game.clearError();
    if (intent.type === 'create-room') game.createRoom();
    else {
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
    app.clearIntent(); app.clearPasswords(); stores.game.getState().closeLobby(); app.navigation.navigate('home', true); return;
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
