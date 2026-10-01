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
    expect(
      decodeServerMessage(
        JSON.stringify({ type: 'room.snapshot', snapshot: { ...snapshot, tableVersion: -1 } }),
      ),
    ).toBeNull();
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
  });

  it('represents the waiting room without inventing cards or a turn', () => {
    const snapshot = createRoomSnapshot(
      {
        roomCode: 'ABCD23',
        phase: 'waiting',
        game: null,
        connected: { A: true, B: false },
        tableVersion: 0,
      },
      'A',
    );

    expect(snapshot.turn).toBeNull();
    expect(snapshot.players.A.drawCount).toBeNull();
    expect(snapshot.players.B.connected).toBe(false);
    expect(snapshot.visibleCounts).toBeNull();
    expect(snapshot.canRing).toBe(false);
  });
});

function createRoomSource(): RoomSnapshotSource {
  const game: GameState = {
    status: 'playing',
    turn: 'A',
    winner: null,
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
  };
}
