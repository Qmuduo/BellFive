/** @jest-environment node */
import { RoomManager } from '../roomManager';
import type { AuthPrincipal } from '../auth/types';

const host: AuthPrincipal = { userId: 'user-host', username: 'host', profile: { nickname: 'Server Host', avatarId: 'peach' } };
const guest: AuthPrincipal = { userId: 'user-guest', username: 'guest', profile: { nickname: 'Server Guest', avatarId: 'banana' } };

test('uses authenticated profiles for host and approved guest seats', () => {
  const manager = new RoomManager();
  const created = manager.handleMessage('host', { type: 'room.create', requestId: 'create' }, host);
  const session = created[0].message;
  if (session.type !== 'room.session') throw new Error('Expected session');
  expect(session.snapshot.players.A.profile).toEqual(host.profile);
  const applied = manager.handleMessage('guest', { type: 'room.join', requestId: 'join', roomCode: session.roomCode }, guest);
  const pending = applied[0].message;
  if (pending.type !== 'room.application.pending') throw new Error('Expected application');
  expect(pending.application.profile).toEqual(guest.profile);
  const approved = manager.handleMessage('host', { type: 'room.application.decision', applicationId: pending.application.applicationId, approved: true }, host);
  expect(approved[0].message).toMatchObject({ type: 'room.session', snapshot: { players: { B: { profile: guest.profile } } } });
});

test('rejects a second seat for the same account and rejects stolen seat credentials', () => {
  const manager = new RoomManager();
  const session = manager.handleMessage('host', { type: 'room.create', requestId: 'create' }, host)[0].message;
  if (session.type !== 'room.session') throw new Error('Expected session');
  expect(manager.handleMessage('duplicate', { type: 'room.join', requestId: 'duplicate', roomCode: session.roomCode }, host)[0].message)
    .toMatchObject({ type: 'error', code: 'ALREADY_IN_ROOM' });
  manager.disconnect('host');
  expect(manager.handleMessage('thief', { type: 'room.reconnect', requestId: 'steal', roomCode: session.roomCode, seatToken: session.seatToken }, guest)[0].message)
    .toMatchObject({ type: 'error', code: 'INVALID_SEAT_TOKEN' });
  expect(manager.handleMessage('host2', { type: 'room.reconnect', requestId: 'resume', roomCode: session.roomCode, seatToken: session.seatToken }, host)[0].message)
    .toMatchObject({ type: 'room.session', localPlayerId: 'A' });
});

test('refreshes a pending application from its authenticated connection before host approval', () => {
  const manager = new RoomManager();
  const session = manager.handleMessage('host', { type: 'room.create', requestId: 'create' }, host)[0].message;
  if (session.type !== 'room.session') throw new Error('Expected session');
  const pending = manager.handleMessage('guest', { type: 'room.join', requestId: 'join', roomCode: session.roomCode }, guest)[0].message;
  if (pending.type !== 'room.application.pending') throw new Error('Expected application');
  const updatedGuest: AuthPrincipal = { ...guest, profile: { nickname: 'Updated Guest', avatarId: 'bell' } };
  const refreshed = manager.handleMessage('guest', { type: 'room.lobby.refresh' }, updatedGuest);
  expect(refreshed).toContainEqual({ connectionId: 'host', message: {
    type: 'room.application.pending', application: { ...pending.application, profile: updatedGuest.profile },
  } });
  const approved = manager.handleMessage('host', { type: 'room.application.decision', applicationId: pending.application.applicationId, approved: true }, host);
  expect(approved[0].message).toMatchObject({ type: 'room.session', snapshot: { players: { B: { profile: updatedGuest.profile } } } });
});

test('does not republish a refreshed application after the same request cancels it', () => {
  const manager = new RoomManager();
  const session = manager.handleMessage('host', { type: 'room.create', requestId: 'create' }, host)[0].message;
  if (session.type !== 'room.session') throw new Error('Expected session');
  const pending = manager.handleMessage('guest', { type: 'room.join', requestId: 'join', roomCode: session.roomCode }, guest)[0].message;
  if (pending.type !== 'room.application.pending') throw new Error('Expected application');
  const cancelled = manager.handleMessage('guest', { type: 'room.application.cancel', applicationId: pending.application.applicationId }, {
    ...guest, profile: { nickname: 'Updated Guest', avatarId: 'bell' },
  });
  expect(cancelled.some(event => event.message.type === 'room.application.pending')).toBe(false);
  expect(cancelled).toContainEqual({ connectionId: 'host', message: expect.objectContaining({ type: 'room.application.status', status: 'cancelled' }) });
});
