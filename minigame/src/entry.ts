import { createWxKeyboard } from './platform/keyboard';
import { createWxRuntimePlatform, type FrameScheduler, type MiniGameWxApi } from './platform/wxApi';
import { CanvasRuntime, type CanvasScreen } from './runtime/canvas';
import { createMiniGameApp, type MiniGameApp } from './runtime/navigation';
import { createMiniGameStores, type MiniGameStores, type MiniGameStoreOptions } from './stores/gameStore';
import { dispatchScreenAction, drawMenu, getScreenSnapshot, label, renderHome, type ScreenSnapshot } from './screens/home';
import { renderAccount } from './screens/account';
import { renderLobby } from './screens/lobby';

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
  // Room and table UI arrive in the following plan tasks. Keep their stable screen names
  // and the shared controller available within this same Canvas and socket lifecycle.
  const sessionScreen = (context: Parameters<typeof renderHome>[0], layout: Parameters<typeof renderHome>[1], snapshot: ScreenSnapshot) =>
    drawMenu(context, layout, label(snapshot, snapshot.game.sessionMode === 'single-player' ? 'game.singlePlayer' : 'waiting.title'),
      snapshot.game.roomCode ?? label(snapshot, 'game.ready'), [{ id: 'session.leave', text: label(snapshot, 'game.leaveRoom') }]);
  const session = screen(sessionScreen);
  session.onAction = actionId => {
    if (actionId === 'session.leave') { stores.game.getState().leaveRoom(); app.navigation.navigate('home', true); }
  };
  session.onBack = () => { stores.game.getState().leaveRoom(); app.navigation.navigate('home', true); };
  const screens = { home: screen(renderHome), account: screen(renderAccount), lobby: screen(renderLobby),
    solo: session, waiting: session, match: session, ...options.screens?.(app, stores) };
  const runtime = new CanvasRuntime({ platform, keyboard, navigation: app.navigation, screens,
    stores: [app, stores.auth, stores.profile, stores.settings, stores.game] });
  return { canvas: platform.canvas, runtime, app, stores, screens,
    destroy() { runtime.destroy(); app.dispose(); stores.dispose(); },
  };
}

if (typeof wx !== 'undefined') startMiniGame(wx);
