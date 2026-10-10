import { AuthClientError } from '../../../src/auth/contracts';
import { AVATAR_EMOJI, AVATAR_OPTIONS, isAvatarId, sanitizePlayerProfile } from '../../../src/profile';
import { gameColors } from '../../../src/theme/gameColors';
import type { TranslationKey } from '../../../src/i18n';
import { getWechatLoginCode } from '../platform/wechatLogin';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp, AccountMode } from '../runtime/navigation';
import { clipTapTargetsToContent, type Rect, type ScreenLayout, type TapTarget } from '../runtime/layout';
import { drawAvatarBadge, drawCanvasButton, drawInputField, drawRoundedPanel, drawStatusBadge } from '../runtime/ui';
import type { MiniGameStores } from '../stores/gameStore';
import { appError, authorizeOnline, drawScreenText, label, type ScreenSnapshot } from './home';

function local(snapshot: ScreenSnapshot, en: string, zh: string): string { return snapshot.settings.language === 'en' ? en : zh; }

function walkAccount(layout: ScreenLayout, snapshot: ScreenSnapshot, context?: CanvasContext2D): { height: number; targets: TapTarget[] } {
  const { app, auth } = snapshot;
  const busy = app.accountBusy || app.onlineBusy || auth.pending;
  const keyboardUnavailable = app.errorCode === 'KEYBOARD_UNAVAILABLE';
  const signedIn = Boolean(auth.user && auth.sessionToken);
  const editable = !busy && (!signedIn || auth.profileVerified);
  const { content } = layout;
  const margin = Math.min(18, content.width / 12);
  const x = content.x + margin;
  const width = content.width - margin * 2;
  let y = content.y + 14 - layout.scrollY;
  const targets: TapTarget[] = [];
  const action = (id: string, rect: Rect, title: string, variant: 'primary' | 'secondary' | 'text', enabled = true) => {
    if (context) drawCanvasButton(context, rect, title, { variant, enabled, fontSize: 12, radius: 13 });
    if (enabled) targets.push({ id, rect });
  };
  const button = (id: string, title: string, variant: 'primary' | 'secondary' | 'text', enabled = true) => {
    action(id, { x, y, width, height: 42 }, title, variant, enabled); y += 49;
  };
  const heading = (title: string) => { if (context) drawScreenText(context, title, x + 4, y + 13, 13, gameColors.plum); y += 29; };
  const field = (id: 'username' | 'password' | 'nickname', title: string, value: string, enabled: boolean) => {
    const rect = { x, y, width, height: 59 };
    if (context) drawInputField(context, rect, title, value, {
      focused: app.focusedField === id, enabled, fontSize: 14, radius: 12,
    });
    if (enabled) targets.push({ id: `field.${id}`, rect });
    y += 67;
  };
  const description = (value: string) => {
    if (context) {
      const words = Array.from(value); const lines: string[] = []; let line = '';
      context.save(); context.font = '11px sans-serif';
      for (const char of words) {
        if (line && context.measureText(line + char).width > width - 20) { lines.push(line); line = ''; }
        line += char;
      }
      if (line) lines.push(line);
      lines.slice(0, 3).forEach((part, index) => drawScreenText(context, part, x + 10, y + 12 + index * 15, 10, gameColors.muted));
      context.restore();
    }
    y += 55;
  };
  if (context) {
    context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
    context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
    drawScreenText(context, label(snapshot, 'account.title'), x, y + 17, 23, gameColors.plum);
  }
  y += 44;
  const profile = signedIn ? auth.user?.profile : snapshot.profile.profile;
  const profileRect = { x, y, width, height: 89 };
  if (context) {
    drawRoundedPanel(context, profileRect, { fill: gameColors.surface, border: gameColors.border, radius: 17 });
    drawAvatarBadge(context, { x: x + 13, y: y + 20, width: 48, height: 48 }, AVATAR_EMOJI[profile?.avatarId ?? 'bell'],
      { background: gameColors.lavenderSurface, foreground: gameColors.plum, fontSize: 25, radius: 24 });
    drawScreenText(context, signedIn ? label(snapshot, 'account.usernameLabel') : label(snapshot, 'account.guest'),
      x + 72, y + 22, 9, gameColors.muted);
    drawScreenText(context, profile?.nickname || label(snapshot, 'account.guest'), x + 72, y + 44, 16, gameColors.plum, 'left', width - 86);
    drawScreenText(context, auth.user?.username ?? (signedIn ? label(snapshot, 'account.wechatOnly') : label(snapshot, 'account.guest')),
      x + 72, y + 67, 10, gameColors.muted, 'left', width - 86);
  }
  y += 101;
  if (signedIn) {
    if (context) drawStatusBadge(context, { x, y, width: Math.min(width, 160), height: 27 },
      label(snapshot, auth.user?.wechatLinked ? 'account.wechatLinked' : 'account.wechatNotLinked'),
      auth.user?.wechatLinked ? 'success' : 'neutral');
    y += 35;
  }
  const defaultStatus = app.accountMode === 'link' ? local(snapshot,
    'Moves this WeChat identity to the existing account. Conflicting credentials are never merged.',
    '将当前微信身份转移至已有账号；凭据冲突不会覆盖或合并。')
    : app.accountMode === 'reset' ? local(snapshot, 'Only an account linked to this WeChat identity can reset its password.', '仅可找回当前微信身份已绑定账号的密码。')
    : signedIn && !auth.profileVerified ? label(snapshot, 'account.profileRefreshRequired')
    : '';
  const error = appError(snapshot);
  const status = error || (busy ? label(snapshot, 'entry.connecting') : app.notice ? label(snapshot, app.notice as TranslationKey) : defaultStatus);
  if (status) {
    if (context) {
      drawRoundedPanel(context, { x, y, width, height: 55 }, {
        fill: error ? '#FBE6E3' : app.notice ? '#E4F3E9' : gameColors.lavenderSurface, radius: 12,
      });
      description(status);
    } else y += 55;
    y += 10;
  }
  if (app.accountMode === 'menu') {
    heading(label(snapshot, 'account.profile'));
    button('account.mode.profile', label(snapshot, 'account.profile'), 'secondary', editable);
    if (signedIn) {
      button('account.refresh', label(snapshot, 'account.refreshProfile'), 'text', !busy);
      heading(label(snapshot, 'account.credentials'));
      if (!auth.user?.username) button('account.mode.credentials', label(snapshot, 'account.credentials'), 'secondary', editable);
      button('account.mode.link', local(snapshot, 'Link an existing account', '绑定已有用户名账号'), 'secondary', editable);
      if (auth.user?.wechatLinked) button('account.mode.reset', label(snapshot, 'account.recovery'), 'text', !busy);
      button('account.logout', label(snapshot, 'account.signOut'), 'text', !busy);
    } else {
      button('account.wechat', local(snapshot, 'Sign in with WeChat', '微信登录'), 'primary', !busy);
      heading(label(snapshot, 'account.credentials'));
      button('account.mode.login', label(snapshot, 'auth.login'), 'secondary', !busy);
      button('account.mode.register', label(snapshot, 'auth.register'), 'secondary', !busy);
      button('account.mode.reset', label(snapshot, 'account.recovery'), 'text', !busy);
    }
    button('settings.language', label(snapshot, 'settings.open'), 'text', !busy);
  } else if (app.accountMode === 'profile') {
    heading(label(snapshot, 'account.profile'));
    field('nickname', label(snapshot, 'account.nickname'), app.fields.nickname, editable);
    heading(label(snapshot, 'account.avatar'));
    const gap = 10; const size = Math.min(50, (width - gap * 2) / 3);
    for (const [index, avatar] of AVATAR_OPTIONS.entries()) {
      const col = index % 3; const row = Math.floor(index / 3);
      const rect = { x: x + col * ((width - size) / 2), y: y + row * 57, width: size, height: 50 };
      if (context) {
        drawRoundedPanel(context, rect, { fill: avatar === app.avatarId ? gameColors.lime : gameColors.surface,
          border: avatar === app.avatarId ? gameColors.purple : gameColors.border, radius: 12 });
        drawScreenText(context, AVATAR_EMOJI[avatar], rect.x + rect.width / 2, rect.y + 25, 25, gameColors.plum, 'center');
      }
      if (editable) targets.push({ id: `account.avatar.${avatar}`, rect });
    }
    y += 124;
    button('account.submit', label(snapshot, 'account.saveProfile'), 'primary', editable);
  } else {
    const titles: Record<Exclude<AccountMode, 'menu' | 'profile'>, TranslationKey> = {
      login: 'auth.login', register: 'auth.register', credentials: 'account.addCredentials', link: 'account.wechatLinked', reset: 'account.recovery',
    };
    heading(label(snapshot, titles[app.accountMode]));
    if (app.accountMode === 'credentials') description(label(snapshot, 'account.credentialsDescription'));
    if (app.accountMode !== 'reset') field('username', label(snapshot, 'auth.username'), app.fields.username, !busy);
    field('password', label(snapshot, 'auth.password'), '•'.repeat(Math.min(20, Array.from(app.fields.password).length)), !busy);
    if (app.accountMode === 'link') {
      const rect = { x, y, width, height: 50 };
      if (context) {
        drawRoundedPanel(context, rect, { fill: app.confirmTransfer ? gameColors.lime : gameColors.surface,
          border: gameColors.border, radius: 12 });
        drawScreenText(context, `${app.confirmTransfer ? '✓' : '□'} ${local(snapshot, 'Confirm identity transfer', '确认微信身份转移')}`,
          x + 12, y + 25, 11, gameColors.plum, 'left', width - 24);
      }
      if (!busy) targets.push({ id: 'account.confirmTransfer', rect });
      y += 58;
    }
    button('account.submit', label(snapshot, titles[app.accountMode]), 'primary',
      !busy && !keyboardUnavailable && (app.accountMode !== 'link' || app.confirmTransfer));
  }
  y += 5;
  if (app.accountMode !== 'menu') button('account.mode.menu', label(snapshot, 'auth.back'), 'text', !busy);
  button('nav.home', label(snapshot, 'account.back'), 'text');
  if (context) context.restore();
  return { height: y + 18 + layout.scrollY - content.y, targets: clipTapTargetsToContent(targets, content) };
}

export function accountContentHeight(layout: ScreenLayout, snapshot: ScreenSnapshot): number {
  return walkAccount(layout, snapshot).height;
}

export function renderAccount(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  return walkAccount(layout, snapshot, context).targets;
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
