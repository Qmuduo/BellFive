import { createWxKeyboard } from './platform/keyboard';
import { connectMatchFeedback, createWxFeedback } from './platform/feedback';
import { createWxRuntimePlatform, type FrameScheduler, type MiniGameWxApi } from './platform/wxApi';
import { CanvasRuntime, type CanvasScreen } from './runtime/canvas';
import { connectRoomNavigation, createMiniGameApp, type MiniGameApp } from './runtime/navigation';
import { createMiniGameStores, type MiniGameStores, type MiniGameStoreOptions } from './stores/gameStore';
import { dispatchScreenAction, getScreenSnapshot, renderHome } from './screens/home';
import { renderAccount } from './screens/account';
import { renderLobby } from './screens/lobby';
import { dispatchWaitingAction, renderWaiting } from './screens/waiting';
import { dispatchMatchAction, renderMatch } from './screens/match';

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
  const screen = (render: typeof renderHome): CanvasScreen => ({
    render(context, layout) { return render(context, layout, getScreenSnapshot(app, stores)); },
    onAction(actionId) { void dispatchScreenAction(actionId, app, stores); },
    onBack() { void dispatchScreenAction('nav.home', app, stores); },
    onHide() { app.clearPasswords(); app.clearIntent(); },
  });
  let feedbackActive = true;
  const feedback = createWxFeedback(wxApi);
  const matchScreen: CanvasScreen = {
    render(context, layout) { return renderMatch(context, layout, getScreenSnapshot(app, stores)); },
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
  const stopFeedback = connectMatchFeedback(stores.game, feedback, () => stores.settings.getState().musicEnabled,
    () => feedbackActive && (app.navigation.current === 'solo' || app.navigation.current === 'match'));
  const stopFeedbackHide = platform.subscribe('hide', () => { feedbackActive = false; });
  const stopFeedbackShow = platform.subscribe('show', () => { feedbackActive = true; });
  const screens = { home: screen(renderHome), account: screen(renderAccount), lobby: screen(renderLobby),
    solo: matchScreen, waiting: waitingScreen, match: matchScreen, ...options.screens?.(app, stores) };
  const runtime = new CanvasRuntime({ platform, keyboard, navigation: app.navigation, screens,
    stores: [app, stores.auth, stores.profile, stores.settings, stores.game] });
  return { canvas: platform.canvas, runtime, app, stores, screens,
    destroy() { stopFeedback(); stopFeedbackHide(); stopFeedbackShow(); feedback.dispose();
      stopRoomNavigation(); runtime.destroy(); app.dispose(); stores.dispose(); },
  };
}

if (typeof wx !== 'undefined') startMiniGame(wx, {
  authUrl: __BELLFIVE_AUTH_URL__,
  socketUrl: __BELLFIVE_SOCKET_URL__,
});
