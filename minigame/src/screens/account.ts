import { AuthClientError } from '../../../src/auth/contracts';
import { AVATAR_EMOJI, AVATAR_OPTIONS, isAvatarId, sanitizePlayerProfile } from '../../../src/profile';
import type { TranslationKey } from '../../../src/i18n';
import { getWechatLoginCode } from '../platform/wechatLogin';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp, AccountMode } from '../runtime/navigation';
import type { ScreenLayout, TapTarget } from '../runtime/layout';
import type { MiniGameStores } from '../stores/gameStore';
import { appError, authorizeOnline, drawMenu, label, type ScreenSnapshot, type ScreenRow } from './home';

function local(snapshot: ScreenSnapshot, en: string, zh: string): string { return snapshot.settings.language === 'en' ? en : zh; }

export function renderAccount(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { app, auth } = snapshot;
  const busy = app.accountBusy || app.onlineBusy || auth.pending;
  const keyboardUnavailable = app.errorCode === 'KEYBOARD_UNAVAILABLE';
  const signedIn = Boolean(auth.user && auth.sessionToken);
  const editable = !busy && (!signedIn || auth.profileVerified);
  const rows: ScreenRow[] = [];
  if (app.accountMode === 'menu') {
    rows.push({ id: 'account.mode.profile', text: label(snapshot, 'account.profile'), enabled: editable });
    if (signedIn) {
      rows.push({ id: 'account.refresh', text: label(snapshot, 'account.refreshProfile'), enabled: !busy });
      if (!auth.user?.username) rows.push({ id: 'account.mode.credentials', text: label(snapshot, 'account.credentials'), enabled: editable });
      rows.push({ id: 'account.mode.link', text: local(snapshot, 'Link an existing account', '绑定已有用户名账号'), enabled: editable });
      if (auth.user?.wechatLinked) rows.push({ id: 'account.mode.reset', text: label(snapshot, 'account.recovery'), enabled: !busy });
      rows.push({ id: 'account.logout', text: label(snapshot, 'account.signOut'), enabled: !busy });
    } else {
      rows.push({ id: 'account.wechat', text: local(snapshot, 'Sign in with WeChat', '微信登录'), accent: true, enabled: !busy });
      rows.push({ id: 'account.mode.login', text: label(snapshot, 'auth.login'), enabled: !busy });
      rows.push({ id: 'account.mode.register', text: label(snapshot, 'auth.register'), enabled: !busy });
      rows.push({ id: 'account.mode.reset', text: label(snapshot, 'account.recovery'), enabled: !busy });
    }
    rows.push({ id: 'settings.language', text: label(snapshot, 'settings.open'), enabled: !busy });
  } else if (app.accountMode === 'profile') {
    rows.push({ id: 'field.nickname', text: `${label(snapshot, 'account.nickname')}: ${app.fields.nickname}`, enabled: editable });
    for (const avatar of AVATAR_OPTIONS) rows.push({ id: `account.avatar.${avatar}`,
      text: `${AVATAR_EMOJI[avatar]} ${app.avatarId === avatar ? '✓' : ''}`, enabled: editable });
    rows.push({ id: 'account.submit', text: label(snapshot, 'account.saveProfile'), enabled: editable, accent: true });
  } else {
    if (app.accountMode !== 'reset') rows.push({ id: 'field.username', text: `${label(snapshot, 'auth.username')}: ${app.fields.username}`, enabled: !busy });
    rows.push({ id: 'field.password', text: `${label(snapshot, 'auth.password')}: ${'•'.repeat(Math.min(20, Array.from(app.fields.password).length))}`, enabled: !busy });
    if (app.accountMode === 'link') rows.push({ id: 'account.confirmTransfer',
      text: `${app.confirmTransfer ? '✓' : '□'} ${local(snapshot, 'Confirm identity transfer', '确认微信身份转移')}`, enabled: !busy });
    const titles: Record<Exclude<AccountMode, 'menu' | 'profile'>, TranslationKey> = {
      login: 'auth.login', register: 'auth.register', credentials: 'account.addCredentials', link: 'account.wechatLinked', reset: 'account.recovery',
    };
    rows.push({ id: 'account.submit', text: label(snapshot, titles[app.accountMode]),
      enabled: !busy && !keyboardUnavailable && (app.accountMode !== 'link' || app.confirmTransfer), accent: true });
  }
  if (app.accountMode !== 'menu') rows.push({ id: 'account.mode.menu', text: label(snapshot, 'auth.back'), enabled: !busy });
  rows.push({ id: 'nav.home', text: label(snapshot, 'account.back') });
  const profile = signedIn ? auth.user?.profile : snapshot.profile.profile;
  const defaultStatus = app.accountMode === 'link' ? local(snapshot,
    'Moves this WeChat identity to the existing account. Conflicting credentials are never merged.',
    '将当前微信身份转移至已有账号；凭据冲突不会覆盖或合并。')
    : app.accountMode === 'reset' ? local(snapshot, 'Only an account linked to this WeChat identity can reset its password.', '仅可找回当前微信身份已绑定账号的密码。')
    : signedIn && !auth.profileVerified ? label(snapshot, 'account.profileRefreshRequired')
    : `${profile ? AVATAR_EMOJI[profile.avatarId] : ''} ${profile?.nickname || label(snapshot, 'account.guest')} · ${auth.user?.username ?? (signedIn ? label(snapshot, 'account.wechatOnly') : label(snapshot, 'account.guest'))}`;
  const status = appError(snapshot) || (busy ? label(snapshot, 'entry.connecting') : app.notice ? label(snapshot, app.notice as TranslationKey) : defaultStatus);
  return drawMenu(context, layout, label(snapshot, 'account.title'), status, rows);
}

async function accountOperation(app: MiniGameApp, operation: () => Promise<void>, notice?: TranslationKey) {
  if (app.getState().accountBusy || app.getState().onlineBusy) return;
  app.update({ accountBusy: true, errorCode: null, notice: null });
  try { await operation(); if (notice) app.update({ notice }); }
  catch (error) { app.update({ errorCode: error instanceof AuthClientError ? error.code : 'NETWORK_ERROR' }); }
  finally { app.update({ accountBusy: false }); }
}
export async function dispatchAccountAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  if (app.getState().accountBusy || app.getState().onlineBusy) return;
  if (actionId === 'account.submit' && app.getState().errorCode === 'KEYBOARD_UNAVAILABLE') return;
  if (actionId.startsWith('account.mode.')) {
    const mode = actionId.slice(13);
    if (!['menu', 'profile', 'login', 'register', 'credentials', 'link', 'reset'].includes(mode)) return;
    app.clearPasswords(); stores.auth.getState().clearError();
    const profile = stores.auth.getState().profileVerified && stores.auth.getState().user
      ? stores.auth.getState().user!.profile : stores.profile.getState().profile;
    app.update(current => ({ accountMode: mode as AccountMode, confirmTransfer: false, notice: null, errorCode: null,
      avatarId: profile.avatarId, fields: { ...current.fields, username: '', nickname: profile.nickname } }));
    app.navigation.navigate('account'); return;
  }
  if (actionId.startsWith('account.avatar.')) {
    const avatar = actionId.slice(15); if (isAvatarId(avatar)) app.update({ avatarId: avatar }); return;
  }
  if (actionId === 'account.confirmTransfer') { app.update(current => ({
    confirmTransfer: !current.confirmTransfer,
    errorCode: current.errorCode === 'KEYBOARD_UNAVAILABLE' ? current.errorCode : null,
  })); return; }
  if (actionId === 'account.wechat') { await accountOperation(app, () => authorizeOnline(stores)); return; }
  if (actionId === 'account.refresh') {
    await accountOperation(app, async () => {
      await stores.ready; await stores.auth.getState().refreshSession();
      const auth = stores.auth.getState();
      if (!auth.profileVerified || !auth.user) throw new AuthClientError(auth.errorCode ?? 'UNAUTHORIZED', 'Account refresh failed.');
    }); return;
  }
  if (actionId === 'account.logout') {
    app.clearIntent(); app.clearPasswords(); app.update({ accountMode: 'menu', confirmTransfer: false, notice: null });
    await accountOperation(app, () => stores.auth.getState().logout()); return;
  }
  if (actionId !== 'account.submit') return;
  const draft = app.getState(); const { username, password, nickname } = draft.fields;
  app.clearPasswords();
  await accountOperation(app, async () => {
    await stores.ready;
    const auth = stores.auth.getState();
    if (draft.accountMode === 'profile') {
      const profile = sanitizePlayerProfile({ nickname, avatarId: draft.avatarId }, 'A');
      if (auth.sessionToken) await auth.updateProfile(profile); else stores.profile.getState().setProfile(profile);
    } else {
      if (draft.accountMode === 'link' && !draft.confirmTransfer) throw new AuthClientError('TRANSFER_CONFIRMATION_REQUIRED', 'Transfer must be confirmed.');
      if (password.length < 8 || password.length > 128 || (draft.accountMode !== 'reset' && !/^[A-Za-z0-9_]{3,24}$/.test(username.trim()))) {
        throw new AuthClientError('INVALID_INPUT', 'Check the credential requirements.');
      }
      switch (draft.accountMode) {
        case 'login': await auth.login(username.trim(), password); break;
        case 'register': await auth.register(username.trim(), password, stores.profile.getState().profile); break;
        case 'credentials': await auth.addCredentials(username.trim(), password); break;
        case 'link': await auth.linkWechat({ code: await getWechatLoginCode(stores.wx), username: username.trim(), password, confirmedTransfer: true }); break;
        case 'reset': await auth.resetPasswordWithWechat(await getWechatLoginCode(stores.wx), password); break;
        default: return;
      }
    }
  }, draft.accountMode === 'profile' ? 'account.profileSaved' : draft.accountMode === 'credentials' ? 'account.credentialsSaved' : undefined);
}
