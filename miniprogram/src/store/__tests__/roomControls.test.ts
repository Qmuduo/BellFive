import type { RoomSnapshot } from '../../../../src/network/protocol';
import { normalizeMiniRoomCode } from '../roomCode';
import { canChangeMiniReady } from '../waitingRoomRules';
import { getMiniLobbyViewState } from '../lobbyViewState';

test('normalizes a six-character room code and rejects malformed input', () => {
  expect(normalizeMiniRoomCode(' abcd23 ')).toBe('ABCD23');
  expect(normalizeMiniRoomCode('ABCDE')).toBeNull();
  expect(normalizeMiniRoomCode('AB-CD3')).toBeNull();
  expect(normalizeMiniRoomCode('')).toBeNull();
});

test('shows loading and confirmed-empty lobby states separately', () => {
  expect(getMiniLobbyViewState({ authenticated: false, connectionStatus: 'idle', snapshotReceived: false, roomCount: 0 }))
    .toBe('sign-in');
  expect(getMiniLobbyViewState({ authenticated: true, connectionStatus: 'connecting', snapshotReceived: false, roomCount: 0 }))
    .toBe('loading');
  expect(getMiniLobbyViewState({ authenticated: true, connectionStatus: 'connected', snapshotReceived: false, roomCount: 0 }))
    .toBe('syncing');
  expect(getMiniLobbyViewState({ authenticated: true, connectionStatus: 'connected', snapshotReceived: true, roomCount: 0 }))
    .toBe('empty');
  expect(getMiniLobbyViewState({ authenticated: true, connectionStatus: 'connected', snapshotReceived: true, roomCount: 2 }))
    .toBe('rooms');
});

test('enables ready only while waiting and both players are connected on a connected client', () => {
  const snapshot = makeWaitingSnapshot(true, true);
  expect(canChangeMiniReady('connected', snapshot)).toBe(true);
  expect(canChangeMiniReady('reconnecting', snapshot)).toBe(false);
  expect(canChangeMiniReady('connected', makeWaitingSnapshot(false, true))).toBe(false);
  expect(canChangeMiniReady('connected', { ...snapshot, phase: 'playing' })).toBe(false);
  expect(canChangeMiniReady('connected', null)).toBe(false);
});

function makeWaitingSnapshot(aConnected: boolean, bConnected: boolean): RoomSnapshot {
  return {
    roomCode: 'ABCD23',
    phase: 'waiting',
    localPlayerId: 'A',
    players: {
      A: { connected: aConnected, drawCount: null, playedCount: null, topCard: null, profile: { nickname: '', avatarId: 'pear' } },
      B: { connected: bConnected, drawCount: null, playedCount: null, topCard: null, profile: { nickname: '', avatarId: 'banana' } },
    },
    turn: null,
    winner: null,
    lastRingOutcome: null,
    visibleCounts: null,
    canRing: false,
    tableVersion: 0,
    remainingSeconds: null,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null,
    lastFlipEvent: null,
    ready: { A: false, B: false },
    ringHistory: [],
  };
}
