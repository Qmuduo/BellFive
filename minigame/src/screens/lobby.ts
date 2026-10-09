import { formatApplicationStatus } from '../../../src/i18n';
import { AVATAR_EMOJI } from '../../../src/profile';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp } from '../runtime/navigation';
import type { ScreenLayout, TapTarget } from '../runtime/layout';
import type { MiniGameStores } from '../stores/gameStore';
import { appError, authorizeOnline, drawMenu, label, validatedRoomCode, type ScreenSnapshot, type ScreenRow } from './home';

export function renderLobby(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { game, app } = snapshot;
  const pending = Boolean(game.localApplicationId || game.applyingRoomCode);
  const pageSize = 4;
  const maxPage = Math.max(0, Math.ceil(game.openRooms.length / pageSize) - 1);
  const page = Math.min(app.lobbyPage, maxPage);
  const rows: ScreenRow[] = [{ id: 'lobby.refresh', text: label(snapshot, 'entry.refreshRooms') }];
  for (const room of game.openRooms.slice(page * pageSize, (page + 1) * pageSize)) {
    rows.push({ id: `lobby.apply.${room.roomCode}`, text: `${AVATAR_EMOJI[room.hostProfile.avatarId]} ${room.hostProfile.nickname || label(snapshot, 'waiting.unnamed')} · ${room.roomCode} · ${label(snapshot, 'entry.join')}`, enabled: !pending });
  }
  if (maxPage > 0) {
    rows.push({ id: 'lobby.previous', text: `‹ ${page + 1}/${maxPage + 1}`, enabled: page > 0 });
    rows.push({ id: 'lobby.next', text: `› ${page + 1}/${maxPage + 1}`, enabled: page < maxPage });
  }
  rows.push({ id: 'field.roomCode', text: `${label(snapshot, 'entry.roomCode')}: ${app.fields.roomCode || '______'}`, enabled: !pending });
  rows.push({ id: 'home.join', text: label(snapshot, 'entry.joinRoom'), enabled: !pending });
  if (game.localApplicationId) rows.push({ id: 'lobby.cancel', text: label(snapshot, 'entry.cancelRequest') });
  if (app.pendingIntent) {
    if (!app.onlineBusy) rows.push({ id: 'auth.retry', text: label(snapshot, 'entry.refresh') });
    rows.push({ id: 'auth.cancel', text: label(snapshot, 'auth.back') });
  }
  rows.push({ id: 'nav.home', text: label(snapshot, 'account.back') });
  const status = appError(snapshot) || (game.localApplicationStatus
    ? formatApplicationStatus(snapshot.settings.language, game.localApplicationStatus.status)
    : game.applyingRoomCode ? label(snapshot, 'entry.sending')
    : !game.lobbySnapshotReceived ? label(snapshot, 'entry.connecting')
    : !game.openRooms.length ? label(snapshot, 'entry.emptyRooms') : label(snapshot, 'entry.description'));
  return drawMenu(context, layout, label(snapshot, 'entry.openRooms'), status, rows);
}
export async function dispatchLobbyAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  const game = stores.game.getState();
  if (actionId === 'lobby.previous') { app.update({ lobbyPage: Math.max(0, app.getState().lobbyPage - 1) }); return; }
  if (actionId === 'lobby.next') {
    app.update({ lobbyPage: Math.min(Math.max(0, Math.ceil(game.openRooms.length / 4) - 1), app.getState().lobbyPage + 1) }); return;
  }
  if (actionId === 'lobby.cancel') { game.cancelApplication(); return; }
  if (actionId !== 'lobby.refresh' && !actionId.startsWith('lobby.apply.')) return;
  if (app.getState().onlineBusy || app.getState().accountBusy) return;
  const roomCode = actionId.startsWith('lobby.apply.') ? validatedRoomCode(actionId.slice(12)) : null;
  if (actionId.startsWith('lobby.apply.') && (!roomCode || game.localApplicationId || game.applyingRoomCode)) return;
  const generation = app.beginIntent(roomCode ? { type: 'join-room', roomCode } : { type: 'open-lobby' });
  try {
    await authorizeOnline(stores);
    if (!app.intentIsCurrent(generation)) return;
    app.clearIntent();
    stores.game.getState().clearError();
    if (roomCode) stores.game.getState().applyToRoom(roomCode); else stores.game.getState().refreshLobby();
  } catch (error) {
    if (app.intentIsCurrent(generation)) app.update({ onlineBusy: false,
      errorCode: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK_ERROR' });
  }
}
