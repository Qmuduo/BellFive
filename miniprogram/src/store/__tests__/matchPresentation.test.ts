import type { RoomSnapshot, RingFeedbackEvent } from '../../../../src/network/protocol';

let presentation: Record<string, (...args: any[]) => any> = {};
try {
  presentation = require('../matchPresentation') as typeof presentation;
} catch {
  // Keep the red phase as an assertion failure while the presentation helper is absent.
}

test('enables solo flip for the local turn and lets the shared rules judge any unblocked ring', () => {
  const controls = presentation.getMiniMatchControls?.({
    snapshot: makeSnapshot({ phase: 'playing', turn: 'A', canRing: false }),
    localPlayerId: 'A',
    sessionMode: 'single-player',
    connectionStatus: 'idle',
    leavingRoom: false,
  });

  expect(controls).toMatchObject({ canFlip: true, canRing: true, canReplay: false, canLeave: true });

  const blockedRing = presentation.getMiniMatchControls?.({
    snapshot: makeSnapshot({ phase: 'playing', turn: 'B', canRing: true, ringBlockedUntilFlip: { A: true, B: false } }),
    localPlayerId: 'A',
    sessionMode: 'single-player',
    connectionStatus: 'idle',
    leavingRoom: false,
  });
  expect(blockedRing).toMatchObject({ canFlip: false, canRing: false });
});

test('pauses online actions while disconnected and exposes replay readiness after finish', () => {
  const paused = presentation.getMiniMatchControls?.({
    snapshot: makeSnapshot({ phase: 'playing', turn: 'A', canRing: true }),
    localPlayerId: 'A',
    sessionMode: 'online',
    connectionStatus: 'reconnecting',
    leavingRoom: false,
  });
  expect(paused).toMatchObject({ canFlip: false, canRing: false, connectionPaused: true });

  const finished = presentation.getMiniMatchControls?.({
    snapshot: makeSnapshot({ phase: 'finished', winner: 'A', ready: { A: false, B: false } }),
    localPlayerId: 'A',
    sessionMode: 'online',
    connectionStatus: 'connected',
    leavingRoom: false,
  });
  expect(finished).toMatchObject({ canFlip: false, canRing: false, canReplay: true, replayAction: 'ready' });
});

test('keeps stale snapshots inert after the shared store leaves its match session', () => {
  const controls = presentation.getMiniMatchControls?.({
    snapshot: makeSnapshot({ phase: 'playing', turn: 'A' }),
    localPlayerId: 'A',
    sessionMode: 'none',
    connectionStatus: 'connected',
    leavingRoom: false,
  });
  expect(controls).toMatchObject({ canFlip: false, canRing: false, canReplay: false, canLeave: false });
});

test('dispatches only enabled shared-store actions and uses ready for online rematches', () => {
  const calls: string[] = [];
  const actions = {
    flip: () => calls.push('flip'),
    ring: () => calls.push('ring'),
    setReady: (ready: boolean) => calls.push(`ready:${ready}`),
    rematch: () => calls.push('rematch'),
    leaveRoom: () => calls.push('leave'),
  };
  const snapshot = makeSnapshot({ phase: 'finished', ready: { A: false, B: false } });
  const disabled = presentation.dispatchMiniMatchAction?.('flip', {
    canFlip: false,
    canRing: false,
    canReplay: true,
    canLeave: true,
    replayAction: 'ready',
  }, snapshot, 'A', actions);
  expect(disabled).toBe(false);
  expect(calls).toEqual([]);

  const enabled = presentation.dispatchMiniMatchAction?.('rematch', {
    canFlip: false,
    canRing: false,
    canReplay: true,
    canLeave: true,
    replayAction: 'ready',
  }, snapshot, 'A', actions);
  expect(enabled).toBe(true);
  expect(calls).toEqual(['ready:true']);
});

test('selects the latest twelve ring events and formats them in the selected language', () => {
  const events = Array.from({ length: 14 }, (_, index): RingFeedbackEvent => ({
    version: index + 1,
    caller: index % 2 === 0 ? 'A' : 'B',
    outcome: index % 2 === 0 ? 'correct' : 'wrong',
    movedCardCount: 1,
  }));
  const latestEvent: RingFeedbackEvent = { version: 15, caller: 'A', outcome: 'wrong', movedCardCount: 0 };
  const entries = presentation.getMiniRingLogEntries?.(events, latestEvent, 'A', 'en');

  expect(entries).toHaveLength(12);
  expect(entries[0]).toMatchObject({ event: { version: 4 } });
  expect(entries[entries.length - 1]).toMatchObject({ event: { version: 15 } });
  expect(entries[entries.length - 1]?.message).toBe('Wrong ring — no cards to give');
});

test('formats Mini ring history with the opponent nickname for either local seat', () => {
  const callerA: RingFeedbackEvent = { version: 1, caller: 'A', outcome: 'correct', movedCardCount: 2 };
  const callerB: RingFeedbackEvent = { version: 2, caller: 'B', outcome: 'wrong', movedCardCount: 1 };

  expect(presentation.getMiniRingLogEntries?.([callerA], null, 'B', 'zh-CN', 'Mira · 玩家 1')[0]?.message)
    .toBe('Mira · 玩家 1拍铃正确，获得 2 张牌');
  expect(presentation.getMiniRingLogEntries?.([callerB], null, 'A', 'zh-CN', 'Mira · 玩家 2')[0]?.message)
    .toBe('Mira · 玩家 2拍铃错误，你获得 1 张牌');
});

function makeSnapshot(overrides: Partial<RoomSnapshot>): RoomSnapshot {
  return {
    roomCode: 'ABC123',
    phase: 'playing',
    localPlayerId: 'A',
    players: {
      A: { connected: true, drawCount: 20, playedCount: 1, topCard: null, profile: { nickname: 'A', avatarId: 'banana' } },
      B: { connected: true, drawCount: 20, playedCount: 1, topCard: null, profile: { nickname: 'B', avatarId: 'grape' } },
    },
    turn: 'A',
    winner: null,
    lastRingOutcome: null,
    visibleCounts: null,
    canRing: false,
    tableVersion: 1,
    remainingSeconds: 60,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null,
    lastFlipEvent: null,
    ready: { A: false, B: false },
    ringHistory: [],
    ...overrides,
  };
}
