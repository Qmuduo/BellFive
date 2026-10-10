/** @jest-environment node */
import { connectRoomNavigation, createMiniGameApp } from '../../runtime/navigation';
import { layoutForScreen } from '../../runtime/layout';
import { renderWaiting, canStartWaitingMatch, dispatchWaitingAction } from '../waiting';
import { renderLobby, dispatchLobbyAction } from '../lobby';
import { startMiniGame } from '../../entry';
import type { ScreenSnapshot } from '../home';
import type { RoomSnapshot } from '../../../../src/network/protocol';

const host = { nickname: 'Host', avatarId: 'bell' as const };
const guest = { nickname: 'Guest', avatarId: 'banana' as const };
const application = { applicationId: 'apply-1', roomCode: 'ABC234', profile: guest };
function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: 'ABC234', phase: 'waiting', localPlayerId: 'A',
    players: {
      A: { connected: true, drawCount: null, playedCount: null, topCard: null, profile: host },
      B: { connected: false, drawCount: null, playedCount: null, topCard: null, profile: { nickname: '', avatarId: 'strawberry' } },
    },
    turn: null, winner: null, lastRingOutcome: null, visibleCounts: null, canRing: false, tableVersion: 0,
    remainingSeconds: null, ringBlockedUntilFlip: { A: false, B: false }, lastRingEvent: null, lastFlipEvent: null,
    ready: { A: false, B: false }, ringHistory: [], ...overrides,
  };
}
function snapshot(overrides: Partial<ScreenSnapshot['game']> = {}): ScreenSnapshot {
  return {
    app: { pendingIntent: null, onlineBusy: false, accountBusy: false, errorCode: null, notice: null,
      accountMode: 'menu', confirmTransfer: false, avatarId: 'strawberry', lobbyPage: 0, waitingApplicationPage: 0,
      pendingReadyAction: null, pendingCancelApplicationId: null,
      fields: { username: '', password: '', nickname: '', roomCode: '' } },
    auth: { errorCode: null } as any, profile: { profile: { nickname: 'Player', avatarId: 'strawberry' } } as any,
    settings: { language: 'en' } as any,
    game: {
      sessionMode: 'online', connectionStatus: 'connected', roomSnapshot: room(), roomCode: 'ABC234',
      localPlayerId: 'A', leavingRoom: false, error: null, pendingApplications: [], localApplicationId: null,
      localApplicationStatus: null, applyingRoomCode: null, openRooms: [], lobbySnapshotReceived: true,
      roomSessionVersion: 0,
      client: {} as any,
      ...overrides,
    } as any,
  } as ScreenSnapshot;
}
const geometry = layoutForScreen(320, 640, { top: 20, bottom: 20 });
function context() {
  const texts: string[] = [];
  return { texts, fillRect: jest.fn(), fillText: (text: string) => texts.push(text), clearRect: jest.fn(), setTransform: jest.fn(), save: jest.fn(), restore: jest.fn(),
    beginPath: jest.fn(), rect: jest.fn(), clip: jest.fn(), measureText: (text: string) => ({ width: text.length * 8 }) };
}

test('host sees server join requests, both seats, and ready controls; auto-start requires both connected and ready', () => {
  const initial = snapshot({ pendingApplications: [application] as any });
  const ctx = context(); const targets = renderWaiting(ctx as any, geometry, initial);
  expect(ctx.texts.join(' ')).toContain('ABC234');
  expect(targets.map(item => item.id)).toEqual(expect.arrayContaining(['waiting.share', 'waiting.approve.apply-1', 'waiting.reject.apply-1', 'waiting.ready', 'waiting.leave']));
  expect(ctx.texts.join(' ')).toContain('Guest wants to join');
  expect(ctx.texts.join(' ')).toContain('Host · You · Connected');
  expect(ctx.texts.join(' ')).toContain('A player');
  expect(canStartWaitingMatch(initial.game.roomSnapshot!)).toBe(false);
  expect(canStartWaitingMatch(room({ players: { A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true } }, ready: { A: true, B: false } }))).toBe(false);
  expect(canStartWaitingMatch(room({ players: { A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: false } }, ready: { A: true, B: true } }))).toBe(false);
  expect(canStartWaitingMatch(room({ players: { A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true } }, ready: { A: true, B: true } }))).toBe(true);
  expect(canStartWaitingMatch(room({ phase: 'connection-paused', players: { A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true } }, ready: { A: true, B: true } }))).toBe(false);
});

test('room code stays visible while reconnecting with the retained room snapshot', () => {
  const ctx = context();
  renderWaiting(ctx as any, geometry, snapshot({ connectionStatus: 'reconnecting' }));
  expect(ctx.texts.join(' ')).toContain('ABC234');
  expect(ctx.texts.join(' ')).toContain('Reconnecting');
});

test('guest sees application status and can cancel only a pending request', () => {
  const pending = snapshot({ roomSnapshot: room({ localPlayerId: 'B', players: {
    A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true, profile: guest },
  } }), localPlayerId: 'B', localApplicationId: application.applicationId,
    localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId, status: 'pending', message: 'Waiting' } as any });
  const pendingContext = context();
  expect(renderWaiting(pendingContext as any, geometry, pending).map(item => item.id)).toContain('waiting.cancelApplication');
  expect(pendingContext.texts.join(' ')).toContain('Join request sent.');
  for (const status of ['rejected', 'cancelled', 'room_full'] as const) {
    const ended = snapshot({ localPlayerId: 'B', roomSnapshot: room({ localPlayerId: 'B' }),
      localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId, status, message: status } as any });
    expect(renderWaiting(context() as any, geometry, ended).some(item => item.id === 'waiting.cancelApplication')).toBe(false);
  }
});

test('host can page through the complete server application queue', async () => {
  const applications = Array.from({ length: 4 }, (_, index) => ({ ...application,
    applicationId: `apply-${index + 1}`, profile: { ...guest, nickname: `Guest ${index + 1}` } }));
  const state = snapshot({ pendingApplications: applications as any });
  const app = createMiniGameApp();
  const stores: any = { game: { getState: () => state.game }, settings: { getState: () => state.settings } };
  const firstPage = renderWaiting(context() as any, geometry, state);
  expect(firstPage.map(item => item.id)).toContain('waiting.approve.apply-1');
  expect(firstPage.map(item => item.id)).not.toContain('waiting.approve.apply-2');
  expect(firstPage.map(item => item.id)).toContain('waiting.applications.next');
  await dispatchWaitingAction('waiting.applications.next', app, stores);
  const nextPage = renderWaiting(context() as any, geometry, { ...state, app: { ...state.app, waitingApplicationPage: 1 } });
  expect(nextPage.map(item => item.id)).toContain('waiting.approve.apply-2');
  expect(nextPage.map(item => item.id)).not.toContain('waiting.approve.apply-1');
  await dispatchWaitingAction('waiting.applications.previous', app, stores);
  expect(app.getState().waitingApplicationPage).toBe(0);
  app.dispose();
});

test('ready, approval, rejection, cancellation, leave and share dispatch through existing store and wx contracts', async () => {
  const app = createMiniGameApp();
  const actions = { setReady: jest.fn(), decideApplication: jest.fn(), cancelApplication: jest.fn(), leaveRoom: jest.fn() };
  const wx = { shareAppMessage: jest.fn() };
  const stores: any = { settings: { getState: () => ({ language: 'en' }) }, game: { getState: () => ({
    ...snapshot({ pendingApplications: [application] as any, localApplicationId: application.applicationId,
      localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId, status: 'pending', message: 'Waiting' } as any }).game, setReady: actions.setReady,
    decideApplication: actions.decideApplication, cancelApplication: actions.cancelApplication, clearError: jest.fn(), leaveRoom: actions.leaveRoom,
  }) }, wx };
  await dispatchWaitingAction('waiting.ready', app, stores);
  await dispatchWaitingAction('waiting.approve.apply-1', app, stores);
  await dispatchWaitingAction('waiting.reject.apply-1', app, stores);
  await dispatchWaitingAction('waiting.cancelApplication', app, stores);
  await dispatchWaitingAction('waiting.share', app, stores);
  await dispatchWaitingAction('waiting.leave', app, stores);
  expect(actions.setReady).toHaveBeenCalledWith(true);
  expect(actions.decideApplication.mock.calls).toEqual([['apply-1', true], ['apply-1', false]]);
  expect(actions.cancelApplication).toHaveBeenCalledTimes(1);
  expect(actions.leaveRoom).toHaveBeenCalledTimes(1);
  expect(wx.shareAppMessage).toHaveBeenCalledWith(expect.objectContaining({ query: 'roomCode=ABC234' }));
  app.dispose();

  const closedApp = createMiniGameApp(); closedApp.navigation.navigate('waiting');
  const closedStores: any = { game: { getState: () => ({ ...snapshot().game, sessionMode: 'none', roomSnapshot: null }) } };
  await dispatchWaitingAction('nav.home', closedApp, closedStores);
  expect(closedApp.navigation.current).toBe('home'); closedApp.dispose();
});

test('ready locks while its server response is pending', async () => {
  const app = createMiniGameApp();
  const setReady = jest.fn(() => 'ready-action-1');
  const game = { ...snapshot({ localApplicationId: application.applicationId,
    localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId,
      status: 'pending', message: 'Waiting' } as any }).game, setReady };
  const stores: any = { game: { getState: () => game }, settings: { getState: () => ({ language: 'en' }) } };

  await dispatchWaitingAction('waiting.ready', app, stores);
  await dispatchWaitingAction('waiting.ready', app, stores);
  expect(setReady).toHaveBeenCalledTimes(1);
  expect(app.getState().pendingReadyAction).toEqual({ actionId: 'ready-action-1', playerId: 'A', desiredReady: true,
    roomSessionVersion: 0 });
  expect(renderWaiting(context() as any, geometry, { ...snapshot(), app: app.getState() })
    .some(item => item.id === 'waiting.ready')).toBe(false);
  app.dispose();
});

test('guest cancellation locks while its server response is pending', async () => {
  const app = createMiniGameApp();
  const cancelApplication = jest.fn(() => true);
  const game = { ...snapshot({ localPlayerId: 'B', roomSnapshot: room({ localPlayerId: 'B', players: {
    A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true, profile: guest },
  } }), localApplicationId: application.applicationId,
  localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId,
    status: 'pending', message: 'Waiting' } as any }).game, cancelApplication, clearError: jest.fn() };
  const stores: any = { game: { getState: () => game }, settings: { getState: () => ({ language: 'en' }) } };
  game.roomSnapshot = room({ localPlayerId: 'B', players: {
    A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true, profile: guest },
  } });
  game.localPlayerId = 'B';
  await dispatchWaitingAction('waiting.cancelApplication', app, stores);
  await dispatchWaitingAction('waiting.cancelApplication', app, stores);
  expect(cancelApplication).toHaveBeenCalledTimes(1);
  expect(app.getState().pendingCancelApplicationId).toBe(application.applicationId);
  expect(renderWaiting(context() as any, geometry, { ...snapshot({ localPlayerId: 'B', roomSnapshot: game.roomSnapshot,
    localApplicationId: application.applicationId,
    localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId,
      status: 'pending', message: 'Waiting' } as any }), app: app.getState() })
    .some(item => item.id === 'waiting.cancelApplication')).toBe(false);
  app.dispose();
});

test('lobby cancellation shares the pending-request guard with the waiting screen', async () => {
  const app = createMiniGameApp();
  const cancelApplication = jest.fn(() => true);
  const game = { ...snapshot({ localPlayerId: 'B', localApplicationId: application.applicationId,
    localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId,
      status: 'pending', message: 'Waiting' } as any }).game, cancelApplication, clearError: jest.fn() };
  const stores: any = { game: { getState: () => game }, settings: { getState: () => ({ language: 'en' }) } };
  game.connectionStatus = 'reconnecting';
  await dispatchLobbyAction('lobby.cancel', app, stores);
  expect(cancelApplication).not.toHaveBeenCalled();
  expect(app.getState().pendingCancelApplicationId).toBeNull();
  expect(renderLobby(context() as any, geometry, { ...snapshot({ localPlayerId: 'B', connectionStatus: 'reconnecting',
    localApplicationId: application.applicationId,
    localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId,
      status: 'pending', message: 'Waiting' } as any }), app: app.getState() })
    .some(item => item.id === 'lobby.cancel')).toBe(false);
  game.connectionStatus = 'connected';
  await dispatchLobbyAction('lobby.cancel', app, stores);
  await dispatchLobbyAction('lobby.cancel', app, stores);
  expect(cancelApplication).toHaveBeenCalledTimes(1);
  const lobby = renderLobby(context() as any, geometry, { ...snapshot({ localPlayerId: 'B',
    localApplicationId: application.applicationId,
    localApplicationStatus: { type: 'room.application.status', applicationId: application.applicationId,
      status: 'pending', message: 'Waiting' } as any }), app: app.getState() });
  expect(lobby.some(item => item.id === 'lobby.cancel')).toBe(false);
  app.dispose();
});

test('reconnecting, leaving and room-closed states suppress unsafe actions and keep a recovery route', () => {
  const paused = snapshot({ connectionStatus: 'reconnecting', roomSnapshot: room({ phase: 'connection-paused' }) });
  const pausedContext = context(); const pausedTargets = renderWaiting(pausedContext as any, geometry, paused);
  expect(pausedContext.texts.join(' ')).toContain('Connection lost.');
  expect(pausedTargets.some(item => item.id?.startsWith('waiting.approve.'))).toBe(false);
  expect(pausedTargets.some(item => item.id === 'waiting.ready')).toBe(false);
  const offline = snapshot({ connectionStatus: 'disconnected' });
  expect(renderWaiting(context() as any, geometry, offline).some(item => item.id === 'waiting.leave')).toBe(true);
  const leaving = snapshot({ leavingRoom: true, sessionMode: 'none', roomSnapshot: null });
  const leaveTargets = renderWaiting(context() as any, geometry, leaving);
  expect(leaveTargets.some(item => item.id === 'waiting.leave')).toBe(false);
  const closed = snapshot({ sessionMode: 'none', connectionStatus: 'disconnected', roomSnapshot: null,
    roomCode: null, error: { code: 'ROOM_CLOSED', message: 'Closed' } as any });
  expect(renderWaiting(context() as any, geometry, closed).map(item => item.id)).toContain('nav.home');
});

test('room phase snapshots route waiting, match, reconnect pause, rematch and closure, and unsubscribe cleanly', () => {
  let state: any = { sessionMode: 'none', connectionStatus: 'idle', roomSnapshot: null, roomSessionVersion: 0, leavingRoom: false };
  const listeners = new Set<() => void>();
  const store = { getState: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } };
  const update = (patch: Record<string, unknown>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const app = createMiniGameApp(); const stop = connectRoomNavigation(app, store as any);

  app.update({ waitingApplicationPage: 3 });
  update({ sessionMode: 'online', roomSessionVersion: 1, roomSnapshot: room() });
  expect(app.navigation.current).toBe('waiting');
  expect(app.getState().waitingApplicationPage).toBe(0);
  update({ roomSnapshot: room({ phase: 'playing' }) });
  expect(app.navigation.current).toBe('match');
  update({ roomSnapshot: room({ phase: 'connection-paused' }), connectionStatus: 'reconnecting' });
  expect(app.navigation.current).toBe('match');
  update({ roomSessionVersion: 2, roomSnapshot: room() });
  expect(app.navigation.current).toBe('waiting');
  update({ sessionMode: 'none', leavingRoom: true, roomSnapshot: null });
  expect(app.navigation.current).toBe('waiting');
  update({ leavingRoom: false, error: { code: 'ROOM_CLOSED' } });
  expect(app.navigation.current).toBe('home');
  update({ sessionMode: 'single-player' });
  expect(app.navigation.current).toBe('solo');

  stop(); update({ sessionMode: 'online', roomSessionVersion: 3, roomSnapshot: room() });
  expect(app.navigation.current).toBe('solo');
  app.dispose();
});

test('ready remains locked after action result until an authoritative snapshot confirms the requested state', () => {
  let state: any = { sessionMode: 'online', connectionStatus: 'connected', roomSnapshot: room({ players: {
    A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true },
  }, ready: { A: false, B: true } }), roomSessionVersion: 4, leavingRoom: false,
    localApplicationId: application.applicationId,
    localApplicationStatus: { applicationId: application.applicationId, status: 'pending' },
    lastActionResult: null, error: null };
  const listeners = new Set<() => void>();
  const store = { getState: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); } };
  const update = (patch: Record<string, unknown>) => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  const app = createMiniGameApp(); const stop = connectRoomNavigation(app, store as any);
  app.update({ pendingReadyAction: { actionId: 'ready-1', playerId: 'A', desiredReady: true, roomSessionVersion: 4 },
    pendingCancelApplicationId: application.applicationId });
  update({ lastActionResult: { type: 'action.result', actionId: 'ready-1', accepted: true } });
  expect(app.getState().pendingReadyAction).not.toBeNull();
  expect(app.getState().pendingCancelApplicationId).toBe(application.applicationId);
  update({ roomSnapshot: room({ phase: 'playing', players: {
    A: { ...room().players.A, connected: true }, B: { ...room().players.B, connected: true },
  }, ready: { A: true, B: true } }) });
  expect(app.getState().pendingReadyAction).toBeNull();
  update({ localPlayerId: null, localApplicationId: null,
    localApplicationStatus: { applicationId: application.applicationId, status: 'cancelled' } });
  expect(app.getState().pendingCancelApplicationId).toBeNull();
  stop(); app.dispose();
});

test('native entry registers Canvas waiting screen and routes authoritative room phases', async () => {
  const ctx = context(); const events: Record<string, (...args: any[]) => void> = {};
  const nativeApi: any = {
    getStorage: ({ fail }: any) => fail({ errMsg: 'data not found' }),
    setStorage: ({ success }: any) => success({}), removeStorage: ({ success }: any) => success({}),
    login: jest.fn(), request: jest.fn(), connectSocket: jest.fn(), shareAppMessage: jest.fn(),
    showKeyboard: jest.fn(), hideKeyboard: jest.fn(),
    createCanvas: () => ({ getContext: () => ctx, width: 0, height: 0 }),
    getSystemInfoSync: () => ({ windowWidth: 320, windowHeight: 640, pixelRatio: 1,
      safeArea: { top: 0, bottom: 640, left: 0, right: 320 } }),
  };
  for (const [name, event] of [['TouchStart', 'touchstart'], ['TouchEnd', 'touchend'], ['TouchCancel', 'touchcancel'],
    ['WindowResize', 'resize'], ['Hide', 'hide'], ['Show', 'show'], ['KeyDown', 'back'],
    ['KeyboardInput', 'input'], ['KeyboardConfirm', 'confirm'], ['KeyboardComplete', 'complete']]) {
    nativeApi[`on${name}`] = (listener: (...args: any[]) => void) => { events[event] = listener; };
    nativeApi[`off${name}`] = jest.fn();
  }
  const boot = startMiniGame(nativeApi, { scheduler: { requestFrame: () => 1, cancelFrame: jest.fn() } });
  try {
    await boot.stores.ready;
    expect(boot.screens.waiting.render(ctx as any, geometry).some(item => item.id === 'nav.home')).toBe(true);
    expect(boot.screens.waiting.render(ctx as any, geometry).some(item => item.id === 'session.leave')).toBe(false);
    boot.stores.game.getState().applyServerMessage({ type: 'room.session', requestId: 'request', roomCode: 'ABC234',
      localPlayerId: 'A', seatToken: 'fixture-seat', snapshot: room() });
    expect(boot.app.navigation.current).toBe('waiting');
    boot.stores.game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room({ phase: 'playing' }) });
    expect(boot.app.navigation.current).toBe('match');
    let game = boot.stores.game.getState();
    const leaveRoom = jest.fn(() => boot.stores.game.setState({ sessionMode: 'none', leavingRoom: true,
      roomSnapshot: null, roomCode: null, localPlayerId: null }));
    boot.stores.game.setState({ ...game, sessionMode: 'online', roomSnapshot: room({ phase: 'playing' }),
      leaveRoom } as any);
    boot.screens.match.onAction?.('session.leave');
    expect(leaveRoom).toHaveBeenCalledTimes(1);
    expect(boot.app.navigation.current).toBe('match');
    boot.stores.game.setState({ leavingRoom: false });
    expect(boot.app.navigation.current).toBe('home');
    boot.stores.game.getState().resetClient();
    expect(boot.app.navigation.current).toBe('home');
  } finally { boot.destroy(); }
});
