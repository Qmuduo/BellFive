/** @jest-environment node */
import { createMatchViewModel, dispatchMatchAction, drawMatchScreen, renderMatch } from '../match';
import { drawCard, CARD_SYMBOLS } from '../../runtime/drawCard';
import { drawText } from '../../runtime/drawText';
import { connectMatchFeedback, createWxFeedback } from '../../platform/feedback';
import { connectRoomNavigation, createMiniGameApp } from '../../runtime/navigation';
import { hitTest, layoutForScreen } from '../../runtime/layout';
import { startMiniGame } from '../../entry';
import { createGameStoreApi, type GameClientPort, type GameStore } from '../../../../src/store/createGameStoreApi';
import type { GameClientHandlers } from '../../../../src/network/GameClient';
import type { RoomSnapshot, ServerMessage } from '../../../../src/network/protocol';
import type { ScreenSnapshot } from '../home';

const profile = { nickname: 'Guest', avatarId: 'strawberry' as const };
const ringEvent = { version: 1, caller: 'A' as const, outcome: 'correct' as const, movedCardCount: 6 };
function room(patch: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    roomCode: 'ABC234', phase: 'playing', localPlayerId: 'A', players: {
      A: { connected: true, drawCount: 27, playedCount: 3, topCard: { id: 'test-a', symbols: ['banana', 'bell'] }, profile },
      B: { connected: true, drawCount: 26, playedCount: 4, topCard: { id: 'test-b', symbols: ['grape'] },
        profile: { nickname: 'Peer', avatarId: 'banana' } },
    }, turn: 'A', winner: null, lastRingOutcome: null,
    visibleCounts: { banana: 1, grape: 1, pear: 0, strawberry: 0, peach: 0, wildBellCount: 1 }, canRing: true,
    tableVersion: 1, ringVersion: 0, remainingSeconds: 65, ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null, lastFlipEvent: null, ready: { A: false, B: false }, ringHistory: [], ...patch,
  };
}
function context() {
  const texts: string[] = [];
  const painted: { rect: { x: number; y: number; width: number; height: number }; color: string }[] = [];
  let points: { x: number; y: number }[] = [];
  let fillStyle = '';
  return { texts, font: '', textAlign: '', textBaseline: '',
    painted,
    fillRect: (x: number, y: number, width: number, height: number) => {
      const rect = { x, y, width, height }; painted.push({ rect, color: fillStyle });
    },
    fillText: (text: string) => texts.push(text), clearRect: jest.fn(), setTransform: jest.fn(),
    save: jest.fn(), restore: jest.fn(), beginPath: () => { points = []; }, rect: jest.fn(), clip: jest.fn(),
    moveTo: (x: number, y: number) => { points.push({ x, y }); },
    lineTo: (x: number, y: number) => { points.push({ x, y }); },
    quadraticCurveTo: (x1: number, y1: number, x: number, y: number) => { points.push({ x: x1, y: y1 }, { x, y }); },
    closePath: jest.fn(), stroke: jest.fn(), arc: jest.fn(),
    fill: () => {
      if (!points.length) return;
      const xs = points.map(point => point.x); const ys = points.map(point => point.y);
      const x = Math.min(...xs); const y = Math.min(...ys);
      painted.push({ rect: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, color: fillStyle });
    },
    translate: jest.fn(), rotate: jest.fn(), strokeRect: jest.fn(),
    get fillStyle() { return fillStyle; }, set fillStyle(value: string) { fillStyle = value; },
    measureText: (text: string) => ({ width: Array.from(text).length * 7 }),
  };
}
const options = { language: 'en' as const, sessionMode: 'online' as const, connectionStatus: 'connected' as const };
const geometry = layoutForScreen(390, 844, { top: 44, bottom: 34 });
function screenSnapshot(game: GameStore, app: ReturnType<typeof createMiniGameApp>): ScreenSnapshot {
  return { app: app.getState(), game, settings: { language: 'en', musicEnabled: true } as any,
    auth: {} as any, profile: { profile } as any };
}

test.each([
  ['A', 'A', true], ['B', 'A', false], ['A', 'B', false], ['B', 'B', true], ['A', null, false],
] as const)('flip follows turn %s and local seat %s', (turn, local, enabled) => {
  expect(createMatchViewModel(room({ turn }), local, null, options).controls.flip).toBe(enabled);
});

test('ring remains legal while unlocked even without a correct timing opportunity', () => {
  expect(createMatchViewModel(room(), 'A', null, options).controls.ring).toBe(true);
  expect(createMatchViewModel(room({ canRing: false }), 'A', null, options).controls.ring).toBe(true);
  expect(createMatchViewModel(room({ canRing: false, turn: 'B' }), 'A', null, options).controls.ring).toBe(true);
  expect(createMatchViewModel(room({ ringBlockedUntilFlip: { A: true, B: false } }), 'A', null, options).controls.ring).toBe(false);
});

test('ring action keeps its label and hit target while timing opportunity only changes the hint', () => {
  const opportunity = createMatchViewModel(room(), 'A', null, options);
  const noOpportunity = createMatchViewModel(room({ canRing: false }), 'A', null, options);
  expect(opportunity.ringLabel).toBe('RING'); expect(noOpportunity.ringLabel).toBe('RING');
  expect(noOpportunity.bellHint).not.toBe(opportunity.bellHint);
  const ctx = context(); const targets = drawMatchScreen(ctx as any, geometry, noOpportunity);
  expect(targets.map(target => target.id)).toContain('match.ring');
  expect(ctx.texts).toContain('🔔 RING');
});

test.each(['connection-paused', 'waiting'] as const)('%s rooms disable play controls', phase => {
  const view = createMatchViewModel(room({ phase }), 'A', null, options);
  expect(view.controls.flip).toBe(false); expect(view.controls.ring).toBe(false);
});

test.each(['reconnecting', 'disconnected', 'error'] as const)('transport %s disables online play despite stale playing snapshot', connectionStatus => {
  const view = createMatchViewModel(room(), 'A', null, { ...options, connectionStatus });
  expect(view.connectionPaused).toBe(true);
  expect(view.controls.flip).toBe(false); expect(view.controls.ring).toBe(false);
  expect(view.turnPrompt).toContain('reconnect');
});

test('finished matches expose solo replay or online ready, while leaving locks all actions', () => {
  const finished = room({ phase: 'finished', winner: 'B', remainingSeconds: 0 });
  const online = createMatchViewModel(finished, 'A', null, options);
  expect(online.controls).toMatchObject({ flip: false, ring: false, rematch: false, ready: true, leave: true, returnHome: true });
  expect(createMatchViewModel(finished, 'A', null, { ...options, sessionMode: 'single-player', connectionStatus: 'idle' }).controls)
    .toMatchObject({ rematch: true, ready: false });
  expect(createMatchViewModel(finished, 'A', null, { ...options, readyPending: true }).controls.ready).toBe(false);
  expect(Object.values(createMatchViewModel(finished, 'A', null, { ...options, leavingRoom: true }).controls).every(value => !value)).toBe(true);
});

test('player counts, cards, winner, timer and recent rings come only from the snapshot', () => {
  const view = createMatchViewModel(room({ phase: 'finished', winner: 'B', ringHistory: [ringEvent], lastRingEvent: ringEvent }), 'A', null, options);
  expect(view.players[0]).toMatchObject({ id: 'A', name: 'Guest', drawCount: 27, playedCount: 3, topCard: { symbols: ['banana', 'bell'] } });
  expect(view.players[1]).toMatchObject({ name: 'Peer', drawCount: 26, playedCount: 4 });
  expect(view.winnerLabel).toContain('Peer WINS');
  expect(view.timerLabel).toBe('1:05');
  expect(view.ringFeedback).toContain('collect 6 cards');
  expect(view.ringHistory).toHaveLength(1);
  expect(view.visibleCountLabel).toContain('banana: 1');
  expect(createMatchViewModel(room({ phase: 'finished', winner: null, remainingSeconds: 0 }), 'A', null, options).winnerLabel).toContain('TIED');
});

test('rejected results never become success ring feedback', () => {
  const result: Extract<ServerMessage, { type: 'action.result' }> = { type: 'action.result', actionId: 'x', accepted: false, outcome: 'correct', movedCardCount: 50 };
  const view = createMatchViewModel(room(), 'A', result, options);
  expect(view.resultLabel).toContain('rejected');
  expect(view.ringFeedback).not.toContain('50');
});

test('drawing preserves card definitions and renders all symbols and orientations', () => {
  const ctx = context(); const card = Object.freeze({ id: 'mixed', symbols: Object.freeze(['banana', 'grape', 'pear', 'strawberry', 'bell'] as const) });
  drawCard(ctx as any, { x: 10, y: 20, width: 120, height: 170 }, card, 'opponent');
  expect(ctx.texts).toEqual(expect.arrayContaining(['🍌', '🍇', '🍐', '🍓', '🔔']));
  expect(CARD_SYMBOLS.peach).toBe('🍑');
  expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
  expect(card.symbols).toHaveLength(5);
});

test('bounded text wraps and truncates at the rectangle, preserving whole Unicode characters', () => {
  const ctx = context(); drawText(ctx as any, { x: 0, y: 0, width: 28, height: 30 }, '🍓abcdefghi', { fontSize: 10, maxLines: 2 });
  expect(ctx.texts).toHaveLength(2);
  expect(ctx.texts[0]).toContain('🍓'); expect(ctx.texts[1]).toContain('…');
  expect(ctx.texts.every(text => Array.from(text).length <= 4)).toBe(true);
});

test('short history rows reduce text size so the line fits vertically', () => {
  const ctx = context(); drawText(ctx as any, { x: 0, y: 0, width: 240, height: 12 }, 'RING LOG', { fontSize: 14 });
  expect(Number.parseFloat(ctx.font) * 1.25).toBeLessThanOrEqual(12);
  expect(ctx.texts).toEqual(['RING LOG']);
});

test.each([[390, 844], [320, 568], [844, 390]])('painted controls and hit areas share safe bounds at %sx%s', (width, height) => {
  const ctx = context(); const layout = layoutForScreen(width, height, { top: 20, bottom: 20, left: 5, right: 5 });
  const targets = drawMatchScreen(ctx as any, layout, createMatchViewModel(room(), 'A', null, options));
  expect(targets.map(target => target.id)).toEqual(expect.arrayContaining(['match.flip', 'match.ring', 'match.leave', 'match.home']));
  for (const target of targets) {
    expect(ctx.painted.map(item => item.rect)).toContainEqual(target.rect);
    expect(target.rect.x).toBeGreaterThanOrEqual(layout.content.x);
    expect(target.rect.y).toBeGreaterThanOrEqual(layout.content.y);
    expect(target.rect.x + target.rect.width).toBeLessThanOrEqual(layout.content.x + layout.content.width);
    expect(target.rect.y + target.rect.height).toBeLessThanOrEqual(layout.content.y + layout.content.height);
    expect(hitTest({ x: target.rect.x + target.rect.width / 2, y: target.rect.y + target.rect.height / 2 }, targets)).toBe(target.id);
  }
});

test('match auxiliary controls avoid the native capsule without shrinking short-screen play actions', () => {
  const safeArea = { top: 20, bottom: 20 };
  const capsule = { x: 230, y: 20, width: 84, height: 32 };
  const layout = layoutForScreen(320, 568, safeArea, capsule);
  const baseline = layoutForScreen(320, 568, safeArea);
  const ctx = context();
  const targets = drawMatchScreen(ctx as any, layout, createMatchViewModel(room(), 'A', null, options));
  const original = drawMatchScreen(context() as any, baseline, createMatchViewModel(room(), 'A', null, options));
  const intersects = (a: any, b: any) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const id of ['match.leave', 'match.home']) {
    const rect = targets.find(target => target.id === id)!.rect;
    expect(intersects(rect, capsule)).toBe(false);
  }
  for (const id of ['match.flip', 'match.ring']) {
    const rect = targets.find(target => target.id === id)!.rect;
    const originalRect = original.find(target => target.id === id)!.rect;
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBe(originalRect.height);
    expect(rect.y + rect.height).toBeLessThanOrEqual(layout.content.y + layout.content.height);
  }
});

test.each([[390, 844, 44, 34], [320, 568, 44, 34], [320, 568, 80, 55]])
('match keeps its colored console actions in the safe viewport at %sx%s with insets %s/%s', (width, height, top, bottom) => {
  const ctx = context(); const layout = layoutForScreen(width, height, { top, bottom });
  const targets = drawMatchScreen(ctx as any, layout, createMatchViewModel(room(), 'A', null, options));
  const flip = targets.find(target => target.id === 'match.flip')!;
  const ring = targets.find(target => target.id === 'match.ring')!;
  expect(ctx.painted).toContainEqual({ rect: flip.rect, color: '#9165D2' });
  expect(ctx.painted).toContainEqual({ rect: ring.rect, color: '#E3FB88' });
  expect(ctx.painted.some(item => item.color === '#34214F' && item.rect.y <= flip.rect.y && item.rect.y + item.rect.height >= flip.rect.y + flip.rect.height)).toBe(true);
  for (const target of [flip, ring]) {
    expect(target.rect.height).toBeGreaterThanOrEqual(44);
    expect(target.rect.y + target.rect.height).toBeLessThanOrEqual(layout.content.y + layout.content.height);
  }
});

test('disabled controls are still painted but never tappable; finished replay owns the console action', () => {
  const enabledContext = context();
  const enabled = drawMatchScreen(enabledContext as any, geometry, createMatchViewModel(room(), 'A', null, options));
  const enabledActionRects = enabled.filter(target => target.id === 'match.flip' || target.id === 'match.ring').map(target => target.rect);
  const pausedContext = context();
  const paused = drawMatchScreen(pausedContext as any, geometry, createMatchViewModel(room({ phase: 'connection-paused' }), 'A', null, options));
  expect(paused.map(target => target.id)).not.toContain('match.flip');
  expect(paused.map(target => target.id)).not.toContain('match.ring');
  for (const rect of enabledActionRects) expect(pausedContext.painted).toContainEqual({ rect, color: '#E2D5FF' });
  const finishedContext = context();
  const finished = drawMatchScreen(finishedContext as any, geometry,
    createMatchViewModel(room({ phase: 'finished', winner: 'A' }), 'A', null, { ...options, sessionMode: 'single-player' }));
  expect(finished.map(target => target.id)).toContain('match.rematch');
  expect(finished.map(target => target.id)).not.toContain('match.flip');
  expect(finished.map(target => target.id)).not.toContain('match.ring');
  const replay = finished.find(target => target.id === 'match.rematch')!;
  expect(finishedContext.painted).toContainEqual({ rect: replay.rect, color: '#9165D2' });
  expect(finishedContext.texts.join(' ')).toContain('WINS');
  const pendingContext = context();
  const pending = drawMatchScreen(pendingContext as any, geometry,
    createMatchViewModel(room({ phase: 'finished' }), 'A', null, { ...options, readyPending: true }));
  expect(pending.map(target => target.id)).not.toContain('match.ready');
  expect(pendingContext.painted).toContainEqual({ rect: replay.rect, color: '#E2D5FF' });
});

test('table rendering displays snapshot identities, piles, cards, timer, winner and ring history', () => {
  const ctx = context();
  drawMatchScreen(ctx as any, geometry, createMatchViewModel(room({ phase: 'finished', winner: 'B', lastRingEvent: ringEvent, ringHistory: [ringEvent] }), 'A', null, options));
  const text = ctx.texts.join(' ');
  for (const expected of ['Guest', 'Peer', '27/3', '26/4', '1:05', 'Connected', 'WINS', 'RING LOG', '6 cards', '🍌', '🔔']) expect(text).toContain(expected);
  const paused = drawMatchScreen(context() as any, geometry, createMatchViewModel(room({ phase: 'connection-paused' }), 'A', null, options));
  expect(paused.map(target => target.id)).not.toContain('match.flip');
  expect(paused.map(target => target.id)).not.toContain('match.ring');
});

function onlineStore() {
  let handlers!: GameClientHandlers; const calls: string[] = [];
  const client: GameClientPort = { createRoom: () => 'create', joinRoom: () => 'join', subscribeLobby() {}, refreshLobby() {}, unsubscribeLobby() {},
    applyToRoom: () => 'apply', decideApplication() {}, cancelApplication() {},
    setReady: ready => { calls.push(`ready:${ready}`); return 'ready-1'; },
    flip: () => { calls.push('flip'); return 'flip-1'; }, ring: version => { calls.push(`ring:${version}`); return 'ring-1'; },
    rematch: () => { calls.push('rematch'); return 'rematch-1'; }, leaveRoom: () => { calls.push('leave'); }, disconnect() {},
  };
  const game = createGameStoreApi(callbacks => { handlers = callbacks; return client; }, () => 'fixture-session');
  game.getState().createRoom();
  game.getState().applyServerMessage({ type: 'room.session', requestId: 'create', roomCode: 'ABC234', localPlayerId: 'A', seatToken: 'fixture-seat', snapshot: room() });
  return { game, calls, handlers: () => handlers };
}

test('online dispatch uses existing client actions without changing outcomes and waits for leave acknowledgement', () => {
  const { game, calls, handlers } = onlineStore(); const app = createMiniGameApp(); const stop = connectRoomNavigation(app, game);
  const stores: any = { game };
  const before = game.getState().roomSnapshot;
  dispatchMatchAction('match.flip', app, stores); dispatchMatchAction('match.ring', app, stores);
  expect(calls).toEqual(['flip', 'ring:1']); expect(game.getState().roomSnapshot).toBe(before);
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room({ phase: 'finished' }) });
  dispatchMatchAction('match.ready', app, stores); dispatchMatchAction('match.ready', app, stores);
  expect(calls).toEqual(['flip', 'ring:1', 'ready:true']);
  expect(app.getState().pendingReadyAction?.desiredReady).toBe(true);
  dispatchMatchAction('match.home', app, stores); dispatchMatchAction('match.leave', app, stores);
  expect(calls.filter(call => call === 'leave')).toHaveLength(1);
  expect(app.navigation.current).toBe('match'); expect(game.getState().leavingRoom).toBe(true);
  handlers().onRoomLeft?.(); expect(app.navigation.current).toBe('home');
  stop(); app.dispose();
});

test('stale direct actions cannot flip or ring while disconnected, flip out of turn, or ring while locked', () => {
  const { game, calls } = onlineStore(); const app = createMiniGameApp(); const stores: any = { game };
  game.setState({ connectionStatus: 'reconnecting' });
  dispatchMatchAction('match.flip', app, stores); dispatchMatchAction('match.ring', app, stores);
  game.setState({ connectionStatus: 'connected', roomSnapshot: room({ turn: 'B', canRing: false, ringBlockedUntilFlip: { A: true, B: false } }) });
  dispatchMatchAction('match.flip', app, stores); dispatchMatchAction('match.ring', app, stores);
  expect(calls).toEqual([]); app.dispose();
});

test('online unlocked wrong ring attempts are sent without predicting the server outcome', () => {
  const { game, calls } = onlineStore(); const app = createMiniGameApp();
  const before = room({ turn: 'B', canRing: false }); game.setState({ roomSnapshot: before });
  dispatchMatchAction('match.ring', app, { game } as any);
  expect(calls).toEqual(['ring:1']);
  expect(game.getState().roomSnapshot).toBe(before); expect(game.getState().lastActionResult).toBeNull();
  app.dispose();
});

test('guest solo wrong ring attempts reach the shared penalty and bell lock without a client', () => {
  const game = createGameStoreApi(() => { throw new Error('Guest solo must not create a client'); }, () => null);
  const app = createMiniGameApp();
  try {
    game.getState().startSinglePlayer(profile, 'easy');
    expect(game.getState().roomSnapshot?.canRing).toBe(false);
    dispatchMatchAction('match.ring', app, { game } as any);
    expect(game.getState().lastActionResult).toMatchObject({ accepted: true, outcome: 'wrong', movedCardCount: 1 });
    expect(game.getState().roomSnapshot?.ringBlockedUntilFlip.A).toBe(true);
    const result = game.getState().lastActionResult;
    dispatchMatchAction('match.ring', app, { game } as any);
    expect(game.getState().lastActionResult).toBe(result);
  } finally { game.getState().leaveRoom(); app.dispose(); }
});

test('store-driven solo termination returns Home immediately', () => {
  const game = createGameStoreApi(() => { throw new Error('Guest solo must not create a client'); }, () => null);
  const app = createMiniGameApp(); const stop = connectRoomNavigation(app, game);
  try {
    game.getState().startSinglePlayer(profile, 'easy');
    expect(app.navigation.current).toBe('solo');
    game.getState().leaveRoom();
    expect(app.navigation.current).toBe('home');
  } finally { game.getState().leaveRoom(); stop(); app.dispose(); }
});

test('feedback follows new authoritative events once, suppressing results, replay, reconnect, disabled hardware and disposed subscriptions', () => {
  const { game } = onlineStore(); const played: string[] = []; let vibrations = 0; let destroyed = 0;
  const audio = { src: '', onError() {}, stop() {}, play() { played.push(this.src); }, destroy() { destroyed++; } };
  const feedback = createWxFeedback({ createInnerAudioContext: () => audio, vibrateShort: () => { vibrations++; } } as any);
  let enabled = true; let active = true;
  const stop = connectMatchFeedback(game, feedback, () => enabled, () => active);
  game.getState().applyServerMessage({ type: 'action.result', actionId: 'rejected', accepted: false });
  game.getState().applyServerMessage({ type: 'action.result', actionId: 'accepted', accepted: true });
  expect(played).toEqual([]);
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room({ lastFlipEvent: { version: 1, player: 'A' } }) });
  expect(played).toEqual(['assets/audio/card-flip.wav']); expect(vibrations).toBe(0);
  const ringing = room({ lastFlipEvent: { version: 1, player: 'A' }, lastRingEvent: ringEvent, ringHistory: [ringEvent], ringVersion: 1 });
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: ringing });
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: { ...ringing, remainingSeconds: 64 } });
  expect(played).toEqual(['assets/audio/card-flip.wav', 'assets/audio/bell.wav']); expect(vibrations).toBe(1);
  enabled = false;
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: { ...ringing, lastFlipEvent: { version: 2, player: 'B' } } });
  enabled = true; active = false;
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: { ...ringing, phase: 'finished', winner: 'A' } });
  active = true;
  game.getState().applyServerMessage({ type: 'room.session', requestId: 'reconnect', roomCode: 'ABC234', localPlayerId: 'A', seatToken: 'fixture-seat', snapshot: { ...ringing, phase: 'finished', winner: 'A' } });
  expect(played).toHaveLength(2); expect(vibrations).toBe(1);
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room() });
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room({ lastFlipEvent: { version: 1, player: 'B' } }) });
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room({ phase: 'finished', winner: 'B', lastFlipEvent: { version: 1, player: 'B' } }) });
  expect(played.slice(-2)).toEqual(['assets/audio/card-flip.wav', 'assets/audio/defeat.wav']);
  stop(); feedback.dispose(); feedback.dispose();
  game.getState().applyServerMessage({ type: 'room.snapshot', snapshot: room({ lastRingEvent: { ...ringEvent, version: 2 } }) });
  expect(destroyed).toBe(1); expect(played).toHaveLength(4);
  const absent = createWxFeedback({}); expect(() => { absent.play('none'); absent.vibrate(); absent.dispose(); }).not.toThrow();
});

function nativeFixture() {
  const ctx = context(); const events: Record<string, (...args: any[]) => void> = {};
  const frames = new Map<number, (time: number) => void>(); let sequence = 0;
  const nativeApi: any = {
    getStorage: ({ fail }: any) => fail({ errMsg: 'data not found' }), setStorage: ({ success }: any) => success({}), removeStorage: ({ success }: any) => success({}),
    login: jest.fn(), request: jest.fn(), connectSocket: jest.fn(), shareAppMessage: jest.fn(), showKeyboard: jest.fn(), hideKeyboard: jest.fn(),
    createCanvas: () => ({ getContext: () => ctx, width: 0, height: 0 }),
    getSystemInfoSync: () => ({ windowWidth: 390, windowHeight: 844, pixelRatio: 2, safeArea: { top: 44, bottom: 810, left: 0, right: 390 } }),
  };
  for (const name of ['TouchStart', 'TouchMove', 'TouchEnd', 'TouchCancel', 'WindowResize', 'Hide', 'Show', 'KeyDown', 'KeyboardInput', 'KeyboardConfirm', 'KeyboardComplete']) {
    nativeApi[`on${name}`] = (callback: (...args: any[]) => void) => { events[name] = callback; }; nativeApi[`off${name}`] = jest.fn();
  }
  const scheduler = { requestFrame: (callback: (time: number) => void) => { frames.set(++sequence, callback); return sequence; }, cancelFrame: (id: number) => { frames.delete(id); } };
  const frame = () => { const first = frames.entries().next().value; if (first) { frames.delete(first[0]); first[1](Date.now()); } };
  const tap = (rect: { x: number; y: number; width: number; height: number }) => {
    const input = { changedTouches: [{ identifier: 1, clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 }] };
    events.TouchStart(input); events.TouchEnd(input);
  };
  return { ctx, nativeApi, scheduler, frame, tap, events };
}

test('default native entry completes guest solo via Canvas controls without auth or sockets, supports replay and immediate back', async () => {
  jest.useFakeTimers();
  const fixture = nativeFixture(); const boot = startMiniGame(fixture.nativeApi, { scheduler: fixture.scheduler });
  try {
    await boot.stores.ready; fixture.frame();
    const home = boot.screens.home.render(fixture.ctx as any, boot.runtime.layout, 0);
    fixture.tap(home.find(target => target.id === 'home.solo.easy')!.rect);
    expect(boot.runtime.currentScreen).toBe('solo'); fixture.frame();
    const solo = boot.screens.solo.render(fixture.ctx as any, boot.runtime.layout, 0);
    fixture.tap(solo.find(target => target.id === 'match.flip')!.rect);
    expect(boot.stores.game.getState().roomSnapshot?.players.A.playedCount).toBe(1);
    jest.advanceTimersByTime(1500);
    const aiResponse = boot.stores.game.getState().roomSnapshot;
    expect(aiResponse?.lastFlipEvent?.player === 'B' || aiResponse?.lastRingEvent?.caller === 'B').toBe(true);
    jest.advanceTimersByTime(300_000);
    expect(boot.stores.game.getState().roomSnapshot?.phase).toBe('finished');
    expect(boot.stores.game.getState().roomSnapshot?.remainingSeconds).toBe(0);
    const finished = boot.screens.solo.render(fixture.ctx as any, boot.runtime.layout, 0);
    expect(finished.some(target => target.id === 'match.rematch')).toBe(true);
    boot.screens.solo.onAction?.('match.rematch', boot.runtime);
    expect(boot.stores.game.getState().roomSnapshot?.phase).toBe('playing');
    fixture.events.KeyDown({ key: 'Escape' });
    expect(boot.app.navigation.current).toBe('home'); expect(boot.stores.game.getState().sessionMode).toBe('none');
    expect(fixture.nativeApi.login).not.toHaveBeenCalled(); expect(fixture.nativeApi.request).not.toHaveBeenCalled(); expect(fixture.nativeApi.connectSocket).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  } finally { boot.destroy(); jest.useRealTimers(); }
});

test('rendering retained leave acknowledgement state does not expose a premature home action', () => {
  const { game } = onlineStore(); const app = createMiniGameApp();
  game.setState({ leavingRoom: true, sessionMode: 'none', roomSnapshot: null });
  const ctx = context(); const targets = renderMatch(ctx as any, geometry, screenSnapshot(game.getState(), app));
  expect(targets).toHaveLength(0); expect(ctx.texts.join(' ').toLowerCase()).toContain('leaving'); app.dispose();
});
