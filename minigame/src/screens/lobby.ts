import { formatApplicationStatus } from '../../../src/i18n';
import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp } from '../runtime/navigation';
import { clipTapTargetsToContent, type Rect, type ScreenLayout, type TapTarget } from '../runtime/layout';
import { drawCanvasButton, drawInputField, drawRoundedPanel } from '../runtime/ui';
import type { MiniGameStores } from '../stores/gameStore';
import { appError, authorizeOnline, drawRoomCard, drawScreenText, label, validatedRoomCode, type ScreenSnapshot } from './home';

const LOBBY_PAGE_SIZE = 2;

export function renderLobby(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const { game, app } = snapshot;
  const pending = Boolean(game.localApplicationId || game.applyingRoomCode);
  const maxPage = Math.max(0, Math.ceil(game.openRooms.length / LOBBY_PAGE_SIZE) - 1);
  const page = Math.min(app.lobbyPage, maxPage);
  const status = appError(snapshot) || (game.localApplicationStatus
    ? formatApplicationStatus(snapshot.settings.language, game.localApplicationStatus.status)
    : game.applyingRoomCode ? label(snapshot, 'entry.sending')
    : !game.lobbySnapshotReceived ? label(snapshot, 'entry.connecting')
    : !game.openRooms.length ? label(snapshot, 'entry.emptyRooms') : label(snapshot, 'entry.description'));
  const { content } = layout;
  const margin = Math.min(18, content.width / 12);
  const x = content.x + margin; const width = content.width - margin * 2;
  let y = content.y + 14;
  const targets: TapTarget[] = [];
  const button = (id: string, rect: Rect, text: string, variant: 'primary' | 'secondary' | 'text', enabled = true) => {
    drawCanvasButton(context, rect, text, { variant, enabled, fontSize: 11, radius: 12 });
    if (enabled) targets.push({ id, rect });
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
  drawScreenText(context, label(snapshot, 'entry.openRooms'), x, y + 18, 23, gameColors.plum);
  button('lobby.refresh', { x: x + width - 90, y, width: 90, height: 36 }, label(snapshot, 'entry.refresh'), 'secondary', !app.onlineBusy);
  y += 42;
  drawScreenText(context, status, x, y + 14, 10, gameColors.muted, 'left', width); y += 36;
  const rooms = game.openRooms.slice(page * LOBBY_PAGE_SIZE, (page + 1) * LOBBY_PAGE_SIZE);
  if (rooms.length) for (const room of rooms) {
    const rect = drawRoomCard(context, { x, y, width, height: 64 }, room, snapshot, !pending);
    if (!pending) targets.push({ id: `lobby.apply.${room.roomCode}`, rect });
    y += 72;
  } else {
    drawRoundedPanel(context, { x, y, width, height: 54 }, { fill: gameColors.surface, radius: 14 });
    drawScreenText(context, label(snapshot, 'entry.emptyRooms'), x + width / 2, y + 27, 10, gameColors.muted, 'center', width - 20);
    y += 62;
  }
  if (maxPage > 0) {
    button('lobby.previous', { x, y, width: 76, height: 32 }, `‹ ${page + 1}/${maxPage + 1}`, 'text', page > 0);
    button('lobby.next', { x: x + width - 76, y, width: 76, height: 32 }, `${page + 1}/${maxPage + 1} ›`, 'text', page < maxPage);
    y += 38;
  }
  if (game.localApplicationId) {
    button('lobby.cancel', { x, y, width, height: 34 }, label(snapshot, 'entry.cancelRequest'), 'text',
      game.connectionStatus === 'connected' && app.pendingCancelApplicationId !== game.localApplicationId);
    y += 38;
  }
  drawScreenText(context, label(snapshot, 'entry.joinByCode'), x + width / 2, y + 14, 10, gameColors.muted, 'center'); y += 29;
  const input = { x, y, width, height: 50 };
  drawInputField(context, input, label(snapshot, 'entry.roomCode'), app.fields.roomCode || '______',
    { focused: false, enabled: !pending, fontSize: 16, radius: 14 });
  if (!pending) targets.push({ id: 'field.roomCode', rect: input });
  y += 56;
  button('home.join', { x, y, width, height: 44 }, label(snapshot, 'entry.joinRoom'), 'secondary', !pending); y += 48;
  if (app.pendingIntent) {
    if (!app.onlineBusy) { button('auth.retry', { x, y, width: width / 2 - 4, height: 34 }, label(snapshot, 'entry.refresh'), 'text'); }
    button('auth.cancel', { x: x + width / 2 + 4, y, width: width / 2 - 4, height: 34 }, label(snapshot, 'auth.back'), 'text'); y += 38;
  }
  button('nav.home', { x, y, width, height: 34 }, label(snapshot, 'account.back'), 'text');
  context.restore();
  return clipTapTargetsToContent(targets, content);
}
export async function dispatchLobbyAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  const game = stores.game.getState();
  if (actionId === 'lobby.previous') { app.update({ lobbyPage: Math.max(0, app.getState().lobbyPage - 1) }); return; }
  if (actionId === 'lobby.next') {
    app.update({ lobbyPage: Math.min(Math.max(0, Math.ceil(game.openRooms.length / LOBBY_PAGE_SIZE) - 1), app.getState().lobbyPage + 1) }); return;
  }
  if (actionId === 'lobby.cancel') {
    const applicationId = game.localApplicationId;
    if (game.connectionStatus !== 'connected' || !applicationId || game.localApplicationStatus?.status !== 'pending'
      || app.getState().pendingCancelApplicationId === applicationId) return;
    game.clearError();
    if (game.cancelApplication()) app.update({ pendingCancelApplicationId: applicationId });
    return;
  }
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
    if (roomCode) { stores.game.getState().applyToRoom(roomCode); app.navigation.navigate('lobby'); }
    else stores.game.getState().refreshLobby();
  } catch (error) {
    if (app.intentIsCurrent(generation)) app.update({ onlineBusy: false,
      errorCode: error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'NETWORK_ERROR' });
  }
}
