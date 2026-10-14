import { AuthClientError } from '../../../src/auth/contracts';
import type { AuthStore } from '../../../src/auth/createAuthStoreApi';
import type { GameStore } from '../../../src/store/createGameStoreApi';
import type { PlayerProfileStore } from '../../../src/store/createProfileStoreApi';
import type { SettingsStore } from '../../../src/store/createSettingsStoreApi';
import { translate, formatGameError, type TranslationKey } from '../../../src/i18n';
import { formatAuthError } from '../../../src/i18n/translations';
import { AVATAR_EMOJI, DEFAULT_PLAYER_PROFILE } from '../../../src/profile';
import { gameColors } from '../../../src/theme/gameColors';
import { getWechatLoginCode } from '../platform/wechatLogin';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp, MiniGameAppState, OnlineIntent, InputField } from '../runtime/navigation';
import { clipTapTargetsToContent, type Rect, type ScreenLayout, type TapTarget } from '../runtime/layout';
import { drawAvatarBadge, drawCanvasButton, drawInputField, drawRoundedPanel } from '../runtime/ui';
import { drawText } from '../runtime/drawText';
import type { MiniGameStores } from '../stores/gameStore';
import { dispatchAccountAction } from './account';
import { dispatchLobbyAction } from './lobby';
import { applyMinorGrantAfterLogin, beginProtectedAction, currentAuthPrivacy, invalidateGuardianAuthorization, privacyReady } from '../privacy/coordinator';
import type { ProtectedAction } from '../privacy/policy';

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
/** One geometry source for paint, hit targets and the runtime's scroll limit. */
function getHomeLayout(layout: ScreenLayout, snapshot: ScreenSnapshot) {
  const { content } = layout;
  const margin = Math.min(HOME_MARGIN, content.width / 12);
  const x = content.x + margin;
  const width = Math.max(0, content.width - margin * 2);
  // Reserve the native capsule before placing the homepage header.
  let y = Math.max(content.y + 12, layout.menuButton ? layout.menuButton.y + layout.menuButton.height + 12 : 0);
  const row = (height: number, gap: number): Rect => {
    const rect = { x, y, width, height }; y += height + gap; return rect;
  };
  const header = row(44, 16);
  const hero = row(content.height < 600 ? 244 : 260, 10);
  const difficulty = row(44, 22);
  const friends = row(156, 10);
  const busy = snapshot.app.onlineBusy || snapshot.app.accountBusy || snapshot.pendingCreate;
  const status = appError(snapshot) || (busy ? label(snapshot, 'entry.connecting') : '');
  const notice = status ? row(64, 8) : null;
  const recovery = snapshot.pendingCreate || snapshot.app.pendingIntent ? row(44, 8) : null;
  y += 8;
  const lobby = row(64, 12);
  const language = row(44, 18);
  return { header, hero, difficulty, friends, notice, recovery, lobby, language, status, height: y - content.y };
}

export function homeContentHeight(layout: ScreenLayout, snapshot: ScreenSnapshot): number {
  return getHomeLayout(layout, snapshot).height;
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

/** A concrete five-fruit example explains the game before the first tap. */
function drawHomeExample(context: CanvasContext2D, rect: Rect): void {
  const left = rect.x + rect.width / 2 - 112;
  const card = (x: number, count: 2 | 3) => {
    drawRoundedPanel(context, { x, y: rect.y, width: 52, height: 64 },
      { fill: gameColors.surface, radius: 12 });
    context.save(); context.font = '20px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    if (count === 3) {
      context.fillText('🍓', x + 15, rect.y + 18); context.fillText('🍓', x + 37, rect.y + 18);
      context.fillText('🍓', x + 26, rect.y + 43);
    } else {
      context.fillText('🍓', x + 26, rect.y + 18); context.fillText('🍓', x + 26, rect.y + 43);
    }
    context.restore();
  };
  card(left, 3); card(left + 78, 2);
  drawScreenText(context, '+', left + 65, rect.y + 32, 20, gameColors.onDark, 'center');
  drawScreenText(context, '→', left + 149, rect.y + 32, 22, gameColors.onDark, 'center');
  drawRoundedPanel(context, { x: left + 171, y: rect.y + 4, width: 56, height: 56 }, { fill: gameColors.lime, radius: 28 });
  drawScreenText(context, '🔔', left + 199, rect.y + 32, 30, gameColors.plum, 'center');
}

export function renderHome(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { content } = layout;
  const geometry = getHomeLayout(layout, snapshot);
  const scrolled = (rect: Rect): Rect => ({ ...rect, y: rect.y - layout.scrollY });
  const header = scrolled(geometry.header);
  const hero = scrolled(geometry.hero);
  const difficultyRow = scrolled(geometry.difficulty);
  const friends = scrolled(geometry.friends);
  const lobby = scrolled(geometry.lobby);
  const targets: TapTarget[] = [];
  const busy = snapshot.app.onlineBusy || snapshot.app.accountBusy || snapshot.pendingCreate;
  const soloEnabled = !snapshot.pendingCreate;
  const keyboardUnavailable = snapshot.app.errorCode === 'KEYBOARD_UNAVAILABLE';
  const profile = snapshot.auth.profileVerified && snapshot.auth.user ? snapshot.auth.user.profile : snapshot.profile.profile;
  const selectedDifficulty = snapshot.app.soloDifficulty ?? 'normal';
  const action = (id: string, rect: Rect, title: string, variant: 'primary' | 'secondary' | 'lime' | 'text', enabled = true, fontSize = 14) => {
    drawCanvasButton(context, rect, title, { variant, enabled, fontSize, radius: 14 });
    if (enabled) targets.push({ id, rect });
  };
  const text = (value: string, x: number, y: number, size = 13, color: string = gameColors.muted,
    maxWidth?: number, align: 'left' | 'center' | 'right' = 'left', bold = false) => {
    context.save(); context.font = `${bold ? 'bold ' : ''}${size}px sans-serif`; context.fillStyle = color;
    context.textAlign = align; context.textBaseline = 'middle';
    if (maxWidth && context.measureText(value).width > maxWidth) {
      const characters = Array.from(value);
      while (characters.length && context.measureText(`${characters.join('')}…`).width > maxWidth) characters.pop();
      value = `${characters.join('')}…`;
    }
    context.fillText(value, x, y); context.restore();
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);

  // Small brand and profile bar: both give context without competing with play.
  text('BellFive', header.x, header.y + 22, 22, gameColors.plum, undefined, 'left', true);
  const account = { x: header.x + header.width - 120, y: header.y, width: 120, height: 44 };
  drawRoundedPanel(context, account, { fill: gameColors.surface, radius: 22 });
  drawAvatarBadge(context, { x: account.x + 6, y: account.y + 6, width: 32, height: 32 }, AVATAR_EMOJI[profile.avatarId],
    { background: gameColors.lavenderSurface, foreground: gameColors.plum, fontSize: 19, radius: 16 });
  text(profile.nickname || label(snapshot, 'account.guest'), account.x + 45, account.y + 15, 12, gameColors.plum, 66, 'left', true);
  text(label(snapshot, 'home.account'), account.x + 45, account.y + 31, 10);
  if (!busy) targets.push({ id: 'home.account', rect: account });

  // A single main action starts the selected offline mode immediately.
  drawRoundedPanel(context, hero, { fill: gameColors.purple, radius: 26 });
  const center = hero.x + hero.width / 2;
  text(label(snapshot, 'home.soloHint'), center, hero.y + 23, 11, gameColors.onDark, undefined, 'center');
  text(label(snapshot, 'home.headline'), center, hero.y + 53, hero.width < 320 ? 22 : 24, gameColors.onDark, hero.width - 28, 'center', true);
  text(label(snapshot, 'home.rule'), center, hero.y + 80, 12, gameColors.onDark, undefined, 'center');
  drawHomeExample(context, { x: hero.x, y: hero.y + 96, width: hero.width, height: 64 });
  action(`home.solo.${selectedDifficulty}`, { x: hero.x + 16, y: hero.y + hero.height - 76, width: hero.width - 32, height: 56 },
    label(snapshot, 'home.startSolo'), 'lime', soloEnabled, 18);

  text(label(snapshot, 'home.difficulty'), difficultyRow.x, difficultyRow.y + 22, 12);
  const difficultyX = difficultyRow.x + 62;
  const gap = 6; const difficultyWidth = (difficultyRow.width - 62 - gap * 2) / 3;
  (['easy', 'normal', 'hard'] as const).forEach((difficulty, index) => {
    const rect = { x: difficultyX + index * (difficultyWidth + gap), y: difficultyRow.y, width: difficultyWidth, height: 44 };
    const selected = difficulty === selectedDifficulty;
    drawRoundedPanel(context, rect, { fill: selected ? gameColors.lavenderSurface : gameColors.canvas,
      border: selected ? gameColors.purple : gameColors.border, radius: 14 });
    text(`${selected ? '✓ ' : ''}${label(snapshot, `difficulty.${difficulty}`)}`, rect.x + rect.width / 2, rect.y + 22,
      snapshot.settings.language === 'en' ? 10 : 12, soloEnabled ? gameColors.plum : gameColors.muted, rect.width - 8, 'center', selected);
    if (soloEnabled) targets.push({ id: `home.difficulty.${difficulty}`, rect });
  });

  text(label(snapshot, 'home.friends'), friends.x, friends.y + 10, 17, gameColors.plum, friends.width, 'left', true);
  text(label(snapshot, 'home.friendsHint'), friends.x, friends.y + 32, 11);
  action('home.create', { x: friends.x, y: friends.y + 46, width: friends.width, height: 48 },
    snapshot.pendingCreate || snapshot.app.onlineBusy && snapshot.app.pendingIntent?.type === 'create-room'
      ? label(snapshot, 'entry.connecting') : label(snapshot, 'home.create'), 'secondary', !busy);
  const joinWidth = snapshot.settings.language === 'en' ? 94 : 90;
  const input = { x: friends.x, y: friends.y + 104, width: friends.width - joinWidth - 8, height: 52 };
  drawInputField(context, input, label(snapshot, 'home.code'), snapshot.app.fields.roomCode || '— — — — — —',
    { focused: snapshot.app.focusedField === 'roomCode', enabled: !busy, fontSize: 13, radius: 14 });
  if (!busy) targets.push({ id: 'field.roomCode', rect: input });
  action('home.join', { x: input.x + input.width + 8, y: input.y, width: joinWidth, height: 52 },
    label(snapshot, 'home.join'), 'secondary', !busy && !keyboardUnavailable, 12);

  // Feedback stays with the online controls. Text wraps rather than hiding recovery instructions.
  if (geometry.notice) {
    const notice = scrolled(geometry.notice);
    drawRoundedPanel(context, notice, { fill: gameColors.lavenderSurface, radius: 12 });
    drawText(context, { x: notice.x + 12, y: notice.y + 6, width: notice.width - 24, height: notice.height - 12 },
      geometry.status, { fontSize: 12, lineHeight: 17, color: gameColors.plum, maxLines: 3 });
  }
  if (geometry.recovery) {
    const recovery = scrolled(geometry.recovery);
    if (snapshot.pendingCreate) action('home.cancelCreate', recovery, label(snapshot, 'home.cancel'), 'secondary');
    else {
      const half = (recovery.width - 8) / 2;
      action('auth.retry', { ...recovery, width: half }, label(snapshot, 'home.retry'), 'secondary', !busy);
      action('auth.cancel', { ...recovery, x: recovery.x + half + 8, width: half }, label(snapshot, 'home.cancel'), 'text');
    }
  }

  drawRoundedPanel(context, lobby, { fill: gameColors.surface, radius: 18 });
  text(label(snapshot, 'home.lobby'), lobby.x + 16, lobby.y + 23, 14, busy ? gameColors.muted : gameColors.plum,
    lobby.width - 56, 'left', true);
  text(label(snapshot, 'home.lobbyHint'), lobby.x + 16, lobby.y + 44, 11);
  text('→', lobby.x + lobby.width - 22, lobby.y + 32, 20, gameColors.purple, undefined, 'center', true);
  if (!busy) targets.push({ id: 'home.lobby', rect: lobby });
  const language = scrolled(geometry.language);
  text(snapshot.settings.language === 'en' ? 'Language · English / 中文' : '语言 · 简体中文 / English',
    language.x + language.width / 2, language.y + 22, 11, gameColors.muted, undefined, 'center');
  targets.push({ id: 'settings.language', rect: language });
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
export async function authorizeOnline(stores: MiniGameStores, app?: MiniGameApp): Promise<void> {
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
    const privacy = app ? currentAuthPrivacy(app) : undefined;
    let authenticatedNow = false;
    if (!auth.sessionToken) {
      await stores.auth.getState().wechatLogin(await getWechatLoginCode(stores.wx), privacy);
      authenticatedNow = true;
    }
    auth = stores.auth.getState();
    if (!auth.user || !auth.profileVerified || !auth.sessionToken || (auth.sessionExpiresAt ?? 0) <= Date.now()) {
      throw new AuthClientError('UNAUTHORIZED', 'A valid account session is required.');
    }
    if (!authenticatedNow && privacy?.privacyPolicyVersion) {
      if (privacy.guardianGrant) await auth.recordGuardianConsent(privacy.guardianGrant, privacy.privacyPolicyVersion);
      else await auth.recordPrivacyConsent(privacy.privacyPolicyVersion);
    }
    if (app && privacy?.guardianGrant) await applyMinorGrantAfterLogin(app);
  })();
  authorizing.set(stores, operation);
  try { await operation; } finally { if (authorizing.get(stores) === operation) authorizing.delete(stores); }
}
async function runIntent(intent: OnlineIntent, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  if (app.getState().onlineBusy || app.getState().accountBusy || pendingCreates.has(app)) return;
  const generation = app.beginIntent(intent);
  try {
    await authorizeOnline(stores, app);
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
    const code = codeOf(error);
    invalidateGuardianAuthorization(app, code);
    if (app.intentIsCurrent(generation)) app.update({ onlineBusy: false, errorCode: code });
  }
}
export function validatedRoomCode(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-HJ-NP-Z2-9]{6}$/.test(normalized) ? normalized : null;
}

export async function dispatchScreenAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  const protectedAction = actionId === 'home.create' || actionId === 'home.join' || actionId === 'home.lobby'
    || actionId === 'account.refresh' || actionId === 'account.wechat'
    || actionId === 'account.mode.profile' || actionId === 'account.mode.login' || actionId === 'account.mode.register'
    || actionId === 'account.mode.credentials' || actionId === 'account.mode.link' || actionId === 'account.mode.reset'
    || actionId === 'account.submit' && app.getState().accountMode !== 'menu' && app.getState().accountMode !== 'delete'
    || actionId.startsWith('account.avatar.') || actionId === 'account.useWechatNickname';
  if (protectedAction && !privacyReady(app)) {
    const action: ProtectedAction = actionId === 'home.join'
      ? { actionId, roomCode: app.getState().fields.roomCode } : { actionId };
    beginProtectedAction(action, app);
    return;
  }
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
  if (actionId.startsWith('home.difficulty.')) {
    const difficulty = actionId.slice('home.difficulty.'.length);
    if (difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') app.update({ soloDifficulty: difficulty });
    return;
  }
  if (actionId.startsWith('home.solo.')) {
    const difficulty = actionId.slice(10);
    if (difficulty !== 'easy' && difficulty !== 'normal' && difficulty !== 'hard') return;
    app.clearIntent(); app.clearPasswords();
    const auth = stores.auth.getState();
    const profile = privacyReady(app)
      ? auth.profileVerified && auth.user ? auth.user.profile : stores.profile.getState().profile
      : DEFAULT_PLAYER_PROFILE;
    stores.game.getState().startSinglePlayer(profile, difficulty);
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
