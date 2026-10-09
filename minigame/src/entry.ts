import { createWxKeyboard } from './platform/keyboard';
import { createWxRuntimePlatform, type FrameScheduler, type MiniGameWxApi } from './platform/wxApi';
import { CanvasRuntime, type CanvasScreen } from './runtime/canvas';
import { connectRoomNavigation, createMiniGameApp, type MiniGameApp } from './runtime/navigation';
import { createMiniGameStores, type MiniGameStores, type MiniGameStoreOptions } from './stores/gameStore';
import { dispatchScreenAction, drawMenu, getScreenSnapshot, label, renderHome, type ScreenSnapshot } from './screens/home';
import { renderAccount } from './screens/account';
import { renderLobby } from './screens/lobby';
import { dispatchWaitingAction, renderWaiting } from './screens/waiting';

export type BootWxApi = MiniGameWxApi;
export interface MiniGameBootOptions extends MiniGameStoreOptions {
  scheduler?: FrameScheduler;
  /** Later gameplay screens attach to this same native runtime. */
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
  // Keep the single-player and upcoming table UI on the same Canvas and socket lifecycle.
  const sessionScreen = (context: Parameters<typeof renderHome>[0], layout: Parameters<typeof renderHome>[1], snapshot: ScreenSnapshot) =>
    drawMenu(context, layout, label(snapshot, snapshot.game.sessionMode === 'single-player' ? 'game.singlePlayer' : 'waiting.title'),
      snapshot.game.roomCode ?? label(snapshot, 'game.ready'), [{ id: 'session.leave', text: label(snapshot, 'game.leaveRoom') }]);
  const session = screen(sessionScreen);
  session.onAction = actionId => {
    if (actionId === 'session.leave') {
      const mode = stores.game.getState().sessionMode;
      stores.game.getState().leaveRoom();
      if (mode === 'single-player') app.navigation.navigate('home', true);
    }
  };
  session.onBack = () => {
    const mode = stores.game.getState().sessionMode;
    stores.game.getState().leaveRoom();
    if (mode === 'single-player') app.navigation.navigate('home', true);
  };
  const waitingScreen: CanvasScreen = {
    render(context, layout) { return renderWaiting(context, layout, getScreenSnapshot(app, stores)); },
    onAction(actionId) { void dispatchWaitingAction(actionId, app, stores); },
    onBack() { void dispatchWaitingAction('waiting.leave', app, stores); },
    onHide() { app.clearPasswords(); app.clearIntent(); },
  };
  const stopRoomNavigation = connectRoomNavigation(app, stores.game);
  const screens = { home: screen(renderHome), account: screen(renderAccount), lobby: screen(renderLobby),
    solo: session, waiting: waitingScreen, match: session, ...options.screens?.(app, stores) };
  const runtime = new CanvasRuntime({ platform, keyboard, navigation: app.navigation, screens,
    stores: [app, stores.auth, stores.profile, stores.settings, stores.game] });
  return { canvas: platform.canvas, runtime, app, stores, screens,
    destroy() { stopRoomNavigation(); runtime.destroy(); app.dispose(); stores.dispose(); },
  };
}

if (typeof wx !== 'undefined') startMiniGame(wx);
