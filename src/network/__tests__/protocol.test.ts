import type { GameState } from '../../game/types';
import {
  createRoomSnapshot,
  decodeClientMessage,
  decodeServerMessage,
  type RoomSnapshotSource,
} from '../protocol';

describe('room protocol decoding', () => {
  it.each([
    { type: 'room.create', requestId: 'request-1' },
    { type: 'room.join', requestId: 'request-2', roomCode: 'ABCD23' },
    {
      type: 'room.reconnect',
      requestId: 'request-3',
      roomCode: 'ABCD23',
      seatToken: 'seat-secret',
    },
    { type: 'room.leave', requestId: 'request-4' },
    { type: 'game.flip', actionId: 'action-1' },
    { type: 'game.ring', actionId: 'action-2', tableVersion: 4 },
    { type: 'game.rematch', actionId: 'action-3' },
  ])('accepts valid client message %p', message => {
    expect(decodeClientMessage(JSON.stringify(message))).toEqual(message);
  });

  it.each([
    '{broken json',
    JSON.stringify({ type: 'game.flip' }),
    JSON.stringify({ type: 'game.ring', actionId: 'a', tableVersion: -1 }),
    JSON.stringify({ type: 'room.join', requestId: 'r', roomCode: 'bad' }),
    JSON.stringify({ type: 'unknown.action', actionId: 'a' }),
  ])('rejects malformed client message %p', raw => {
    expect(decodeClientMessage(raw)).toBeNull();
  });

  it('accepts a room session server message and rejects malformed snapshots', () => {
    const snapshot = createRoomSnapshot(createRoomSource(), 'A');
    const message = {
      type: 'room.session',
      requestId: 'request-1',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      seatToken: 'seat-secret',
      snapshot,
    };

    expect(decodeServerMessage(JSON.stringify(message))).toEqual(message);
    const flipSnapshot = { ...snapshot, lastFlipEvent: { version: 2, player: 'B' } };
    expect(decodeServerMessage(JSON.stringify({ type: 'room.snapshot', snapshot: flipSnapshot }))).toEqual({
      type: 'room.snapshot',
      snapshot: flipSnapshot,
    });
    expect(
      decodeServerMessage(
        JSON.stringify({ type: 'room.snapshot', snapshot: { ...snapshot, tableVersion: -1 } }),
      ),
    ).toBeNull();
    expect(
      decodeServerMessage(
        JSON.stringify({ type: 'room.snapshot', snapshot: { ...snapshot, remainingSeconds: -1 } }),
      ),
    ).toBeNull();
    expect(
      decodeServerMessage(
        JSON.stringify({
          type: 'room.snapshot',
          snapshot: { ...snapshot, lastRingEvent: { version: 1, caller: 'C', outcome: 'wrong', movedCardCount: 1 } },
        }),
      ),
    ).toBeNull();
    expect(
      decodeServerMessage(
        JSON.stringify({
          type: 'room.snapshot',
          snapshot: { ...snapshot, lastFlipEvent: { version: -1, player: 'A' } },
        }),
      ),
    ).toBeNull();
  });

  it('accepts room closure notifications and rejects malformed ones', () => {
    expect(decodeServerMessage(JSON.stringify({ type: 'room.left', requestId: 'leave-1' }))).toEqual({
      type: 'room.left',
      requestId: 'leave-1',
    });
    expect(decodeServerMessage(JSON.stringify({
      type: 'room.closed',
      code: 'PEER_LEFT',
      message: 'The other player left the room.',
    }))).toEqual({
      type: 'room.closed',
      code: 'PEER_LEFT',
      message: 'The other player left the room.',
    });
    expect(decodeServerMessage(JSON.stringify({ type: 'room.left' }))).toBeNull();
    expect(decodeServerMessage(JSON.stringify({ type: 'room.closed', code: '', message: 'Closed.' }))).toBeNull();
  });
});

describe('room snapshots', () => {
  it('reveals only top played cards and counts, never hidden card definitions', () => {
    const snapshot = createRoomSnapshot(createRoomSource(), 'B');
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.localPlayerId).toBe('B');
    expect(snapshot.players.A.drawCount).toBe(1);
    expect(snapshot.players.A.playedCount).toBe(2);
    expect(snapshot.players.A.topCard?.id).toBe('C009');
    expect(snapshot.players.B.topCard?.id).toBe('C021');
    expect(snapshot.visibleCounts?.strawberry).toBe(1);
    expect(serialized).not.toContain('C004');
    expect(serialized).not.toContain('C030');
    expect(serialized).not.toContain('drawPile');
    expect(snapshot).toMatchObject({
      remainingSeconds: 300,
      ringBlockedUntilFlip: { A: false, B: false },
      lastRingEvent: { version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 1 },
      lastFlipEvent: null,
    });
  });

  it('represents the waiting room without inventing cards or a turn', () => {
    const snapshot = createRoomSnapshot(
      {
        roomCode: 'ABCD23',
        phase: 'waiting',
        game: null,
        connected: { A: true, B: false },
        tableVersion: 0,
        remainingSeconds: null,
        lastRingEvent: null,
        lastFlipEvent: null,
      },
      'A',
    );

    expect(snapshot.turn).toBeNull();
    expect(snapshot.players.A.drawCount).toBeNull();
    expect(snapshot.players.B.connected).toBe(false);
    expect(snapshot.visibleCounts).toBeNull();
    expect(snapshot.canRing).toBe(false);
    expect(snapshot.remainingSeconds).toBeNull();
    expect(snapshot.lastRingEvent).toBeNull();
    expect(snapshot.lastFlipEvent).toBeNull();
  });
});

function createRoomSource(): RoomSnapshotSource {
  const game: GameState = {
    status: 'playing',
    turn: 'A',
    winner: null,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingOutcome: null,
    players: {
      A: {
        drawPile: [{ id: 'C030', symbols: ['peach'] }],
        playedPile: [
          { id: 'C009', symbols: ['strawberry'] },
          { id: 'C004', symbols: ['banana'] },
        ],
      },
      B: {
        drawPile: [{ id: 'C031', symbols: ['grape'] }],
        playedPile: [{ id: 'C021', symbols: ['pear'] }],
      },
    },
  };

  return {
    roomCode: 'ABCD23',
    phase: 'playing',
    game,
    connected: { A: true, B: true },
    tableVersion: 2,
    ringVersion: 1,
    remainingSeconds: 300,
    lastRingEvent: { version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 1 },
    lastFlipEvent: null,
  };
}
