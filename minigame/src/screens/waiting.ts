import { formatApplicationStatus, translate } from '../../../src/i18n';
import type { JoinApplication, RoomSnapshot } from '../../../src/network/protocol';
import { AVATAR_EMOJI } from '../../../src/profile';
import { shareMiniGame } from '../platform/feedback';
import type { CanvasContext2D } from '../platform/wxApi';
import type { MiniGameApp } from '../runtime/navigation';
import type { ScreenLayout, TapTarget } from '../runtime/layout';
import type { MiniGameStores } from '../stores/gameStore';
import { appError, drawMenu, label, type ScreenRow, type ScreenSnapshot } from './home';

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

function playerRow(snapshot: ScreenSnapshot, room: RoomSnapshot, playerId: 'A' | 'B'): string {
  const player = room.players[playerId];
  const nickname = player.profile.nickname || label(snapshot, 'waiting.unnamed');
  const name = playerId === room.localPlayerId ? `${nickname} · ${label(snapshot, 'waiting.you')}` : nickname;
  const status = !player.connected ? label(snapshot, 'status.connection.disconnected')
    : room.ready[playerId] ? label(snapshot, 'status.ready') : label(snapshot, 'status.connected');
  return `${AVATAR_EMOJI[player.profile.avatarId]} ${playerId} · ${name} · ${status}`;
}

export function renderWaiting(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const view = getWaitingViewModel(snapshot);
  const { game } = snapshot;
  const online = game.sessionMode === 'online' && Boolean(view.room);
  const canSend = online && !game.leavingRoom && game.connectionStatus === 'connected';
  const rows: ScreenRow[] = [];
  if (view.roomCode) rows.push({ text: `${label(snapshot, 'waiting.roomCode')}: ${view.roomCode}`, enabled: false });
  if (view.room) {
    rows.push({ id: 'waiting.share', text: label(snapshot, 'waiting.shareInvite'), enabled: Boolean(view.roomCode) && !game.leavingRoom });
    rows.push({ text: playerRow(snapshot, view.room, 'A') });
    rows.push({ text: playerRow(snapshot, view.room, 'B') });
    if (view.applications.length) {
      const page = Math.min(snapshot.app.waitingApplicationPage, view.applications.length - 1);
      rows.push({ text: label(snapshot, 'waiting.joinRequests'), enabled: false });
      for (const application of view.applications.slice(page, page + 1)) {
        const nickname = application.profile.nickname || label(snapshot, 'waiting.unnamed');
        rows.push({ text: translate(snapshot.settings.language, 'waiting.wantsToJoin', { nickname }), enabled: false });
        rows.push({ id: `waiting.approve.${application.applicationId}`,
          text: translate(snapshot.settings.language, 'waiting.approveLabel', { nickname }), enabled: canSend });
        rows.push({ id: `waiting.reject.${application.applicationId}`,
          text: translate(snapshot.settings.language, 'waiting.rejectLabel', { nickname }), enabled: canSend });
      }
      if (view.applications.length > 1) {
        rows.push({ id: 'waiting.applications.previous', text: `‹ ${page + 1}/${view.applications.length}`, enabled: page > 0 });
        rows.push({ id: 'waiting.applications.next', text: `${page + 1}/${view.applications.length} ›`, enabled: page < view.applications.length - 1 });
      }
    }
    if (game.localApplicationStatus) {
      rows.push({ text: formatApplicationStatus(snapshot.settings.language, game.localApplicationStatus.status), enabled: false });
      if (game.localApplicationStatus.status === 'pending') {
        rows.push({ id: 'waiting.cancelApplication', text: label(snapshot, 'entry.cancelRequest'),
          enabled: canSend && snapshot.app.pendingCancelApplicationId !== game.localApplicationId });
      }
    }
    if (view.room.phase === 'waiting') {
      const readyPending = Boolean(snapshot.app.pendingReadyAction
        && snapshot.app.pendingReadyAction.roomSessionVersion === game.roomSessionVersion);
      rows.push({ id: 'waiting.ready', text: label(snapshot, view.localReady ? 'waiting.cancelReady' : 'waiting.ready'),
        enabled: canSend && view.localConnected && !readyPending });
    }
  } else if (!game.leavingRoom) {
    rows.push({ id: 'nav.home', text: label(snapshot, 'account.back') });
  }
  rows.push({ id: 'waiting.leave', text: label(snapshot, 'waiting.leaveRoom'),
    enabled: online && !game.leavingRoom });

  const status = game.leavingRoom ? label(snapshot, 'entry.leaving')
    : appError(snapshot)
      || (game.localApplicationStatus ? formatApplicationStatus(snapshot.settings.language, game.localApplicationStatus.status) : '')
      || (view.connectionPaused ? label(snapshot, 'waiting.reconnecting')
        : !view.room ? label(snapshot, 'waiting.reconnecting')
          : view.canStart ? label(snapshot, 'waiting.autoStart')
            : view.localReady ? label(snapshot, 'waiting.youAreReady') : label(snapshot, 'waiting.description'));
  return drawMenu(context, layout, label(snapshot, 'waiting.title'), status, rows);
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
