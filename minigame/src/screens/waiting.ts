import { formatApplicationStatus, translate } from '../../../src/i18n';
import type { JoinApplication, RoomSnapshot } from '../../../src/network/protocol';
import { AVATAR_EMOJI } from '../../../src/profile';
import { gameColors } from '../../../src/theme/gameColors';
import { shareMiniGame } from '../platform/feedback';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp } from '../runtime/navigation';
import { clipTapTargetsToContent, type Rect, type ScreenLayout, type TapTarget } from '../runtime/layout';
import { drawAvatarBadge, drawCanvasButton, drawRoundedPanel, drawStatusBadge } from '../runtime/ui';
import type { MiniGameStores } from '../stores/gameStore';
import { appError, drawScreenText, label, type ScreenSnapshot } from './home';

export interface WaitingViewModel {
  readonly room: RoomSnapshot | null;
  readonly roomCode: string | null;
  readonly canStart: boolean;
  readonly localReady: boolean;
  readonly localConnected: boolean;
  readonly connectionPaused: boolean;
  readonly applications: readonly JoinApplication[];
}

export function canStartWaitingMatch(room: RoomSnapshot): boolean {
  return room.phase === 'waiting' && room.players.A.connected && room.players.B.connected
    && room.ready.A && room.ready.B;
}

export function getWaitingViewModel(snapshot: ScreenSnapshot): WaitingViewModel {
  const room = snapshot.game.roomSnapshot;
  const localPlayerId = room?.localPlayerId ?? snapshot.game.localPlayerId;
  const local = room && localPlayerId ? room.players[localPlayerId] : null;
  const connectionPaused = snapshot.game.connectionStatus !== 'connected' || room?.phase === 'connection-paused';
  return {
    room, roomCode: room?.roomCode ?? snapshot.game.roomCode,
    canStart: Boolean(room && canStartWaitingMatch(room)),
    localReady: Boolean(room && localPlayerId && room.ready[localPlayerId]),
    localConnected: Boolean(local?.connected), connectionPaused,
    applications: room && room.localPlayerId === 'A'
      ? snapshot.game.pendingApplications.filter(item => item.roomCode === room.roomCode) : [],
  };
}

export function renderWaiting(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const view = getWaitingViewModel(snapshot);
  const { game } = snapshot;
  const online = game.sessionMode === 'online' && Boolean(view.room);
  const canSend = online && !game.leavingRoom && game.connectionStatus === 'connected';
  const status = game.leavingRoom ? label(snapshot, 'entry.leaving')
    : appError(snapshot)
      || (game.localApplicationStatus ? formatApplicationStatus(snapshot.settings.language, game.localApplicationStatus.status) : '')
      || (view.connectionPaused ? label(snapshot, 'waiting.reconnecting')
        : !view.room ? label(snapshot, 'waiting.reconnecting')
          : view.canStart ? label(snapshot, 'waiting.autoStart')
            : view.localReady ? label(snapshot, 'waiting.youAreReady') : label(snapshot, 'waiting.description'));
  const { content } = layout;
  const scale = Math.min(1, content.height / 600);
  const unit = (value: number) => value * scale;
  const margin = Math.min(18, content.width / 12);
  const x = content.x + margin;
  const width = content.width - margin * 2;
  let y = content.y + unit(8);
  const targets: TapTarget[] = [];
  const button = (id: string, rect: Rect, text: string, variant: 'primary' | 'secondary' | 'lime' | 'text', enabled = true) => {
    const painted = drawCanvasButton(context, rect, text, { variant, enabled, fontSize: unit(12), radius: unit(12) });
    if (enabled) targets.push({ id, rect: painted });
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
  drawScreenText(context, label(snapshot, 'waiting.eyebrow'), x + width / 2, y + unit(8), unit(9), gameColors.muted, 'center', width);
  drawScreenText(context, label(snapshot, 'waiting.title'), x + width / 2, y + unit(34), unit(26), gameColors.plum, 'center', width);
  y += unit(60);
  if (view.roomCode) {
    drawRoundedPanel(context, { x, y, width, height: unit(76) },
      { fill: gameColors.lavenderSurface, border: gameColors.border, radius: unit(20) });
    drawScreenText(context, label(snapshot, 'waiting.roomCode'), x + width / 2, y + unit(19), unit(10), gameColors.muted, 'center', width - 16);
    drawScreenText(context, view.roomCode, x + width / 2, y + unit(51), unit(30), gameColors.plum, 'center', width - 16);
    y += unit(84);
  }
  if (view.room) {
    for (const playerId of ['A', 'B'] as const) {
      const player = view.room.players[playerId];
      const rect = { x, y, width, height: unit(54) };
      drawRoundedPanel(context, rect, { fill: gameColors.surface, radius: unit(15) });
      drawAvatarBadge(context, { x: x + unit(10), y: y + unit(8), width: unit(38), height: unit(38) },
        AVATAR_EMOJI[player.profile.avatarId], { background: gameColors.lime, foreground: gameColors.plum, fontSize: unit(20), radius: unit(19) });
      const nickname = player.profile.nickname || label(snapshot, 'waiting.unnamed');
      const name = playerId === view.room.localPlayerId ? `${nickname} · ${label(snapshot, 'waiting.you')}` : nickname;
      drawScreenText(context, `${playerId} · ${name}`, x + unit(58), y + unit(20), unit(12), gameColors.plum, 'left', width - unit(154));
      const playerStatus = !player.connected ? label(snapshot, 'status.connection.disconnected')
        : view.room.ready[playerId] ? label(snapshot, 'status.ready') : label(snapshot, 'status.connected');
      drawStatusBadge(context, { x: x + width - unit(89), y: y + unit(16), width: unit(80), height: unit(22) },
        playerStatus, !player.connected ? 'neutral' : view.room.ready[playerId] ? 'success' : 'warning');
      y += unit(60);
    }
    y += unit(4);
    if (view.applications.length) {
      const page = Math.min(snapshot.app.waitingApplicationPage, view.applications.length - 1);
      const application = view.applications[page];
      const nickname = application.profile.nickname || label(snapshot, 'waiting.unnamed');
      drawRoundedPanel(context, { x, y, width, height: unit(106) }, { fill: gameColors.surface, radius: unit(15) });
      drawScreenText(context, label(snapshot, 'waiting.joinRequests'), x + unit(12), y + unit(14), unit(10), gameColors.muted);
      drawAvatarBadge(context, { x: x + unit(12), y: y + unit(27), width: unit(28), height: unit(28) },
        AVATAR_EMOJI[application.profile.avatarId], { background: gameColors.lavenderSurface, foreground: gameColors.plum,
          fontSize: unit(17), radius: unit(14) });
      drawScreenText(context, translate(snapshot.settings.language, 'waiting.wantsToJoin', { nickname }),
        x + unit(48), y + unit(41), unit(11), gameColors.plum, 'left', width - unit(58));
      const actionY = y + unit(62); const actionWidth = (width - unit(32)) / 2;
      const approve = { x: x + unit(10), y: actionY, width: actionWidth, height: unit(32) };
      const reject = { x: approve.x + actionWidth + unit(12), y: actionY, width: actionWidth, height: unit(32) };
      drawRoundedPanel(context, approve, { fill: canSend ? '#E4F3E9' : gameColors.lavenderSurface, radius: unit(10) });
      drawRoundedPanel(context, reject, { fill: canSend ? '#FBE6E3' : gameColors.lavenderSurface, radius: unit(10) });
      drawScreenText(context, label(snapshot, 'waiting.approve'), approve.x + approve.width / 2, actionY + unit(16), unit(10), '#35744F', 'center', approve.width - 8);
      drawScreenText(context, label(snapshot, 'waiting.reject'), reject.x + reject.width / 2, actionY + unit(16), unit(10), '#A6534D', 'center', reject.width - 8);
      if (canSend) targets.push({ id: `waiting.approve.${application.applicationId}`, rect: approve },
        { id: `waiting.reject.${application.applicationId}`, rect: reject });
      y += unit(112);
      if (view.applications.length > 1) {
        button('waiting.applications.previous', { x, y, width: unit(78), height: unit(26) },
          `‹ ${page + 1}/${view.applications.length}`, 'text', page > 0);
        button('waiting.applications.next', { x: x + width - unit(78), y, width: unit(78), height: unit(26) },
          `${page + 1}/${view.applications.length} ›`, 'text', page < view.applications.length - 1);
        y += unit(30);
      }
    }
    if (game.localApplicationStatus?.status === 'pending') {
      button('waiting.cancelApplication', { x, y, width, height: unit(30) }, label(snapshot, 'entry.cancelRequest'), 'text',
        canSend && snapshot.app.pendingCancelApplicationId !== game.localApplicationId);
      y += unit(34);
    }
  }
  drawRoundedPanel(context, { x, y, width, height: unit(38) },
    { fill: view.connectionPaused ? gameColors.lavenderSurface : gameColors.surface, radius: unit(10) });
  context.save(); context.font = `900 ${unit(9)}px sans-serif`;
  const statusLines: string[] = []; let remaining = status;
  while (remaining && statusLines.length < 3) {
    let end = remaining.length;
    while (end > 1 && context.measureText(remaining.slice(0, end)).width > width - 16) end--;
    if (end < remaining.length) {
      const wordEnd = remaining.lastIndexOf(' ', end);
      if (wordEnd > 0) end = wordEnd;
    }
    statusLines.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  context.restore();
  statusLines.forEach((line, index) => drawScreenText(context, line, x + width / 2,
    y + unit(19 + (index - (statusLines.length - 1) / 2) * 11), unit(9), gameColors.muted, 'center', width - 16));
  y += unit(40);
  if (view.room?.phase === 'waiting') {
    const readyPending = Boolean(snapshot.app.pendingReadyAction
      && snapshot.app.pendingReadyAction.roomSessionVersion === game.roomSessionVersion);
    button('waiting.ready', { x, y, width, height: unit(50) },
      label(snapshot, view.localReady ? 'waiting.cancelReady' : 'waiting.ready'),
      view.localReady ? 'lime' : 'primary', canSend && view.localConnected && !readyPending);
    y += unit(58);
  }
  if (view.room) {
    button('waiting.share', { x, y, width, height: unit(42) }, label(snapshot, 'waiting.shareInvite'), 'secondary',
      Boolean(view.roomCode) && !game.leavingRoom);
    y += unit(48);
  } else if (!game.leavingRoom) {
    button('nav.home', { x, y, width, height: unit(42) }, label(snapshot, 'account.back'), 'secondary');
    y += unit(48);
  }
  button('waiting.leave', { x, y, width, height: unit(32) }, label(snapshot, 'waiting.leaveRoom'), 'text',
    online && !game.leavingRoom);
  context.restore();
  return clipTapTargetsToContent(targets, content);
}

export async function dispatchWaitingAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): Promise<void> {
  const game = stores.game.getState();
  const room = game.roomSnapshot;
  const online = game.sessionMode === 'online' && Boolean(room);
  if (actionId === 'nav.home') {
    if (!online && !game.leavingRoom) app.navigation.navigate('home', true);
    return;
  }
  if (actionId === 'waiting.leave') {
    if (online && !game.leavingRoom) game.leaveRoom();
    return;
  }
  if (actionId === 'waiting.share') {
    if (!room || game.leavingRoom) return;
    const title = translate(stores.settings.getState().language, 'waiting.shareMessage', { roomCode: room.roomCode });
    try { shareMiniGame(stores.wx, title, `roomCode=${room.roomCode}`); } catch { /* Sharing is optional. */ }
    return;
  }
  if (actionId === 'waiting.applications.previous' || actionId === 'waiting.applications.next') {
    const applications = room && room.localPlayerId === 'A'
      ? game.pendingApplications.filter(item => item.roomCode === room.roomCode) : [];
    const maxPage = Math.max(0, applications.length - 1);
    const currentPage = Math.min(app.getState().waitingApplicationPage, maxPage);
    const offset = actionId === 'waiting.applications.next' ? 1 : -1;
    app.update({ waitingApplicationPage: Math.max(0, Math.min(maxPage, currentPage + offset)) });
    return;
  }
  if (!online || !room || game.leavingRoom || game.connectionStatus !== 'connected') return;
  if (actionId === 'waiting.ready') {
    const localId = room.localPlayerId;
    if (room.phase === 'waiting' && room.players[localId].connected
      && !app.getState().pendingReadyAction) {
      const desiredReady = !room.ready[localId];
      const actionId = game.setReady(desiredReady);
      if (actionId) app.update({ pendingReadyAction: { actionId, playerId: localId, desiredReady,
        roomSessionVersion: game.roomSessionVersion } });
    }
    return;
  }
  if (actionId === 'waiting.cancelApplication') {
    const applicationId = game.localApplicationId;
    if (applicationId && game.localApplicationStatus?.status === 'pending'
      && app.getState().pendingCancelApplicationId !== applicationId) {
      game.clearError();
      if (game.cancelApplication()) app.update({ pendingCancelApplicationId: applicationId });
    }
    return;
  }
  const approvePrefix = 'waiting.approve.';
  const rejectPrefix = 'waiting.reject.';
  const prefix = actionId.startsWith(approvePrefix) ? approvePrefix : actionId.startsWith(rejectPrefix) ? rejectPrefix : null;
  if (!prefix || room.localPlayerId !== 'A') return;
  const applicationId = actionId.slice(prefix.length);
  if (!game.pendingApplications.some(item => item.applicationId === applicationId && item.roomCode === room.roomCode)) return;
  game.decideApplication(applicationId, prefix === approvePrefix);
}
