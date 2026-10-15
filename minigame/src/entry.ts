import { createWxKeyboard } from './platform/keyboard';
import { connectMatchFeedback, createWxFeedback } from './platform/feedback';
import { createWxRuntimePlatform, type CanvasContext2D, type FrameScheduler, type MiniGameWxApi } from './platform/wxApi';
import { CanvasRuntime, type CanvasScreen } from './runtime/canvas';
import type { ScreenLayout } from './runtime/layout';
import { connectRoomNavigation, createMiniGameApp, type MiniGameApp } from './runtime/navigation';
import { createMiniGameStores, type MiniGameStores, type MiniGameStoreOptions } from './stores/gameStore';
import { dispatchScreenAction, getScreenSnapshot, homeContentHeight, renderHome } from './screens/home';
import { accountContentHeight, renderAccount, saveWechatNickname } from './screens/account';
import { renderLobby } from './screens/lobby';
import { dispatchWaitingAction, renderWaiting } from './screens/waiting';
import { dispatchMatchAction, renderMatch, type MatchTransferAnimation } from './screens/match';
import { createWechatNicknameButton } from './platform/wechatProfile';
import { acceptPrivacyAge, cancelPrivacyFlow, clearGuardianSecret, completeGuardianGrant, openPrivacyContract, sendGuardianRequest } from './privacy/coordinator';
import { privacyContentHeight, renderPrivacy } from './screens/privacy';
import { createWxBackgroundMusic } from './platform/backgroundMusic';
import { dispatchSettingsAction, renderSettings, settingsContentHeight } from './screens/settings';

declare const __BELLFIVE_AUTH_URL__: string;
declare const __BELLFIVE_SOCKET_URL__: string;

export type BootWxApi = MiniGameWxApi;
export interface MiniGameBootOptions extends MiniGameStoreOptions {
  scheduler?: FrameScheduler;
  /** Optional Canvas screen overrides share the native runtime and stores. */
  screens?: (app: MiniGameApp, stores: MiniGameStores) => Readonly<Record<string, CanvasScreen>>;
}

export function startMiniGame(wxApi: BootWxApi, options: MiniGameBootOptions = {}) {
  const platform = createWxRuntimePlatform(wxApi, options.scheduler);
  const keyboard = createWxKeyboard(wxApi);
  const stores = createMiniGameStores(wxApi, options);
  const app = createMiniGameApp(keyboard);
  const music = createWxBackgroundMusic(wxApi, stores.settings);
  const stopMusicGesture = platform.subscribe('touchstart', () => music.startFromGesture());
  const stopMusicHide = platform.subscribe('hide', () => music.setForeground(false));
  const stopMusicShow = platform.subscribe('show', () => music.setForeground(true));
  const stopPrivacySecret = platform.subscribe('hide', () => clearGuardianSecret(app));
  const nicknameButton = createWechatNicknameButton(wxApi,
    nickname => { void saveWechatNickname(app, stores, nickname); },
    () => app.update({ notice: 'account.wechatNicknameUnavailable', errorCode: null }));
  const screen = (render: typeof renderHome): CanvasScreen => ({
    render(context, layout) { return render(context, layout, getScreenSnapshot(app, stores)); },
    onAction(actionId) { void dispatchScreenAction(actionId, app, stores); },
    onBack() { void dispatchScreenAction('nav.home', app, stores); },
    onHide() { app.clearPasswords(); app.clearIntent(); },
  });
  const resumeProtectedAction = async (action: { actionId: string; roomCode?: string }) => {
    if (action.roomCode) app.setField('roomCode', action.roomCode);
    if (action.actionId.startsWith('home.')) app.navigation.navigate('home', true);
    else if (action.actionId.startsWith('account.')) app.navigation.navigate('account', true);
    await dispatchScreenAction(action.actionId, app, stores);
  };
  const privacyScreen: CanvasScreen = {
    render(context, layout) { return renderPrivacy(context, layout, getScreenSnapshot(app, stores)); },
    scrollContentHeight(layout) { return privacyContentHeight(layout, getScreenSnapshot(app, stores)); },
    onAction(actionId) {
      const flow = app.getState().privacy;
      if (actionId === 'field.privacyEmail') { app.focusField('privacyEmail'); return; }
      if (actionId === 'field.guardianGrant') { app.focusField('guardianGrant'); return; }
      if (actionId === 'privacy.continue') { app.update({ privacy: { ...flow, step: 'age', errorCode: null } }); return; }
      if (actionId === 'privacy.read') { app.update({ privacy: { ...flow, step: 'policy', errorCode: null } }); return; }
      if (actionId === 'privacy.platformContract') { void openPrivacyContract(wxApi, app); return; }
      if (actionId === 'privacy.backToNotice') { app.update({ privacy: { ...flow, step: 'notice', errorCode: null } }); return; }
      if (actionId === 'privacy.age.14plus') { void acceptPrivacyAge('14plus', wxApi, app, stores, resumeProtectedAction); return; }
      if (actionId === 'privacy.age.under14') { void acceptPrivacyAge('under14', wxApi, app, stores, resumeProtectedAction); return; }
      if (actionId === 'privacy.sendGuardian') { void sendGuardianRequest(wxApi, options.authUrl ?? 'http://localhost:8787', app); return; }
      if (actionId === 'privacy.confirmGuardian') { void completeGuardianGrant(app, stores, resumeProtectedAction); return; }
      if (actionId === 'privacy.resend') { app.setField('guardianGrant', ''); app.update({ privacy: { ...flow, step: 'guardian-email', errorCode: null } }); return; }
      if (actionId === 'privacy.cancel') cancelPrivacyFlow(app);
    },
    onBack() { cancelPrivacyFlow(app); },
    onHide() { clearGuardianSecret(app); app.clearPasswords(); },
  };
  let feedbackActive = true;
  const feedback = createWxFeedback(wxApi);
  let lastMatchSessionVersion: number | null = null;
  let lastRingVersion = 0;
  let activeTransfer: MatchTransferAnimation | null = null;
  const matchScreen: CanvasScreen = {
    render(context, layout, timestamp) {
      const snapshot = getScreenSnapshot(app, stores);
      const game = snapshot.game;
      if (lastMatchSessionVersion !== game.roomSessionVersion) {
        lastMatchSessionVersion = game.roomSessionVersion;
        lastRingVersion = game.roomSnapshot?.ringVersion ?? game.roomSnapshot?.lastRingEvent?.version ?? 0;
        activeTransfer = null;
      } else {
        const room = game.roomSnapshot;
        const ringVersion = room?.ringVersion ?? room?.lastRingEvent?.version ?? 0;
        if (room && ringVersion > lastRingVersion) {
          lastRingVersion = ringVersion;
          const event = room.lastRingEvent?.version === ringVersion
            ? room.lastRingEvent
            : room.ringHistory.find(item => item.version === ringVersion) ?? null;
          activeTransfer = event && event.movedCardCount > 0 ? { event, startedAt: timestamp } : null;
        }
      }
      if (activeTransfer && timestamp - activeTransfer.startedAt >= 950) activeTransfer = null;
      return renderMatch(context, layout, snapshot, timestamp, activeTransfer);
    },
    onAction(actionId) { dispatchMatchAction(actionId, app, stores); },
    onBack() { dispatchMatchAction('match.leave', app, stores); },
    onHide() { app.clearPasswords(); app.clearIntent(); },
  };
  const waitingScreen: CanvasScreen = {
    render(context, layout) { return renderWaiting(context, layout, getScreenSnapshot(app, stores)); },
    onAction(actionId) { void dispatchWaitingAction(actionId, app, stores); },
    onBack() { void dispatchWaitingAction('waiting.leave', app, stores); },
    onHide() { app.clearPasswords(); app.clearIntent(); },
  };
  const stopRoomNavigation = connectRoomNavigation(app, stores.game);
  let lobbySubscribed = false;
  let lifecycleActive = true;
  const syncLobby = () => {
    if (!lifecycleActive) return;
    const auth = stores.auth.getState();
    const visible = app.navigation.current === 'lobby';
    const valid = auth.hydrated && auth.profileVerified && Boolean(auth.user && auth.sessionToken)
      && (auth.sessionExpiresAt ?? 0) > Date.now();
    const wanted = visible && valid && stores.game.getState().sessionMode === 'none'
      && !app.getState().pendingIntent;
    if (wanted && !lobbySubscribed) {
      lobbySubscribed = true;
    } else if (!wanted && lobbySubscribed) {
      lobbySubscribed = false;
      stores.game.getState().closeLobby();
    }
  };
  const stopLobbyNavigation = app.navigation.subscribe(syncLobby);
  const stopLobbyAuth = stores.auth.subscribe(syncLobby);
  void stores.ready.then(syncLobby);
  const hideNicknameButtonOutsideProfile = () => {
    if (app.navigation.current !== 'account' || app.getState().accountMode !== 'profile') nicknameButton.hide();
  };
  const stopNicknameButtonNavigation = app.navigation.subscribe(hideNicknameButtonOutsideProfile);
  const stopNicknameButtonApp = app.subscribe(hideNicknameButtonOutsideProfile);
  const stopFeedback = connectMatchFeedback(stores.game, feedback, undefined,
    () => feedbackActive && (app.navigation.current === 'solo' || app.navigation.current === 'match'));
  const stopFeedbackHide = platform.subscribe('hide', () => { feedbackActive = false; });
  const stopFeedbackShow = platform.subscribe('show', () => { feedbackActive = true; });
  const screens = { home: { ...screen(renderHome), scrollContentHeight(layout: ScreenLayout) {
    return homeContentHeight(layout, getScreenSnapshot(app, stores));
  } }, account: { ...screen(renderAccount), render(context: CanvasContext2D, layout: ScreenLayout) {
    return renderAccount(context, layout, getScreenSnapshot(app, stores), {
      wechatNicknameButtonAvailable: nicknameButton.available,
      syncWechatNicknameButton(rect, title, language) { nicknameButton.place(rect, title, language); },
    });
  }, onAction(actionId: string) { void dispatchScreenAction(actionId, app, stores); },
  onBack() { void dispatchScreenAction('nav.home', app, stores); },
  onHide() { nicknameButton.hide(); app.clearPasswords(); app.clearIntent(); }, scrollContentHeight(layout: ScreenLayout) {
    return accountContentHeight(layout, getScreenSnapshot(app, stores));
  } }, lobby: screen(renderLobby), privacy: privacyScreen,
    settings: {
      render(context: CanvasContext2D, layout: ScreenLayout) { return renderSettings(context, layout, getScreenSnapshot(app, stores)); },
      scrollContentHeight: settingsContentHeight,
      onAction(actionId: string) { if (actionId === 'settings.back') app.navigation.back(); else dispatchSettingsAction(actionId, stores); },
      onBack() { app.navigation.back(); },
    },
    solo: matchScreen, waiting: waitingScreen, match: matchScreen, ...options.screens?.(app, stores) };
  const runtime = new CanvasRuntime({ platform, keyboard, navigation: app.navigation, screens,
    stores: [app, stores.auth, stores.profile, stores.settings, stores.game] });
  return { canvas: platform.canvas, runtime, app, stores, screens,
    destroy() { lifecycleActive = false; clearGuardianSecret(app); stopLobbyNavigation(); stopLobbyAuth(); stopNicknameButtonNavigation(); stopNicknameButtonApp(); stopPrivacySecret();
      nicknameButton.destroy(); if (lobbySubscribed) stores.game.getState().closeLobby();
      stopFeedback(); stopFeedbackHide(); stopFeedbackShow(); feedback.dispose();
      stopMusicGesture(); stopMusicHide(); stopMusicShow(); music.dispose();
      stopRoomNavigation(); runtime.destroy(); app.dispose(); stores.dispose(); },
  };
}

if (typeof wx !== 'undefined') startMiniGame(wx, {
  authUrl: __BELLFIVE_AUTH_URL__,
  socketUrl: __BELLFIVE_SOCKET_URL__,
});
