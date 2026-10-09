import { formatGameError, playerSeatLabel, translate, type Language } from '../../../src/i18n';
import { formatRingActivity } from '../../../src/i18n/ringActivity';
import { FRUIT_TYPES, type PlayerId } from '../../../src/game/types';
import type { GameClientStatus } from '../../../src/network/GameClient';
import type { RoomSnapshot, ServerMessage } from '../../../src/network/protocol';
import { AVATAR_EMOJI } from '../../../src/profile';
import type { GameSessionMode } from '../../../src/store/createGameStoreApi';
import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import { CARD_SYMBOLS, drawCard } from '../runtime/drawCard';
import { drawText } from '../runtime/drawText';
import type { Rect, ScreenLayout, TapTarget } from '../runtime/layout';
import type { MiniGameApp } from '../runtime/navigation';
import type { MiniGameStores } from '../stores/gameStore';
import type { ScreenSnapshot } from './home';

interface MatchOptions {
  language?: Language; sessionMode?: GameSessionMode; connectionStatus?: GameClientStatus;
  leavingRoom?: boolean; readyPending?: boolean; errorCode?: string;
}
type ActionResult = Extract<ServerMessage, { type: 'action.result' }>;
export function createMatchViewModel(snapshot: RoomSnapshot | null, localPlayerId: PlayerId | null,
  lastActionResult: ActionResult | null, options: MatchOptions = {}) {
  const language = options.language ?? 'zh-CN';
  const t = (key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) => translate(language, key, params);
  const solo = (options.sessionMode ?? (snapshot?.roomCode ? 'online' : 'single-player')) === 'single-player';
  const mode = options.sessionMode ?? (solo ? 'single-player' : 'online');
  const local = localPlayerId ? snapshot?.players[localPlayerId] : null;
  const connectionPaused = Boolean(snapshot && (snapshot.phase === 'connection-paused'
    || !solo && ((options.connectionStatus ?? 'connected') !== 'connected'
      || !snapshot.players.A.connected || !snapshot.players.B.connected)));
  const leaving = Boolean(options.leavingRoom);
  const canSend = Boolean(snapshot && local && mode !== 'none' && !leaving && !connectionPaused && local.connected);
  const playing = snapshot?.phase === 'playing';
  const finished = snapshot?.phase === 'finished';
  const name = (id: PlayerId) => solo && id !== localPlayerId ? t('solo.opponent')
    : snapshot?.players[id].profile.nickname || playerSeatLabel(id, language);
  const players = snapshot ? (['A', 'B'] as const).map(id => ({
    id, name: name(id), avatar: AVATAR_EMOJI[snapshot.players[id].profile.avatarId],
    local: id === localPlayerId, connected: snapshot.players[id].connected, ready: snapshot.ready[id],
    drawCount: snapshot.players[id].drawCount, playedCount: snapshot.players[id].playedCount,
    topCard: snapshot.players[id].topCard,
    identityLabel: `${AVATAR_EMOJI[snapshot.players[id].profile.avatarId]} ${name(id)}${id === localPlayerId ? ` · ${t('waiting.you')}` : ''}`,
    countLabel: `${t('match.drawPile')}: ${snapshot.players[id].drawCount ?? '—'} · ${t('deck.table', { count: snapshot.players[id].playedCount ?? '—' })}`,
    statusLabel: !snapshot.players[id].connected ? t('status.connection.disconnected')
      : finished && snapshot.ready[id] ? t('status.ready') : t('status.connected'),
  })) : [];
  const turnPrompt = leaving ? t('entry.leaving') : connectionPaused ? t('game.waitReconnect')
    : finished ? t('game.roundComplete') : snapshot?.turn === localPlayerId ? t('game.yourTurnFlip')
      : snapshot?.turn ? t('game.playerFlipsNext', { playerLabel: name(snapshot.turn) }) : t('waiting.reconnecting');
  const winnerLabel = !finished ? '' : snapshot.winner === null
    ? t(snapshot.remainingSeconds === 0 ? 'game.timeUpTied' : 'game.matchTied')
    : t(snapshot.remainingSeconds === 0 ? 'game.timeUpWinner' : 'game.playerWins', { playerLabel: name(snapshot.winner) });
  const ringHistory = snapshot && localPlayerId ? snapshot.ringHistory.slice(-3).map(event => ({
    ...event, label: formatRingActivity(event, localPlayerId, language, name(localPlayerId === 'A' ? 'B' : 'A')),
  })) : [];
  const ringFeedback = snapshot?.lastRingEvent && localPlayerId
    ? formatRingActivity(snapshot.lastRingEvent, localPlayerId, language, name(localPlayerId === 'A' ? 'B' : 'A'))
    : lastActionResult?.accepted && lastActionResult.outcome
      ? formatRingActivity({ version: 0, caller: localPlayerId ?? 'A', outcome: lastActionResult.outcome,
        movedCardCount: lastActionResult.movedCardCount ?? 0 }, localPlayerId ?? 'A', language) : '';
  const resultLabel = options.errorCode ? formatGameError(language, options.errorCode)
    : lastActionResult ? lastActionResult.accepted ? ringFeedback || (language === 'en' ? 'Action accepted' : '操作已确认')
      : language === 'en' ? 'Action rejected' : '操作未被接受' : ringFeedback;
  const seconds = snapshot?.remainingSeconds;
  const timerLabel = seconds == null ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const controls = {
    flip: canSend && playing && snapshot.turn === localPlayerId,
    ring: canSend && playing && Boolean(localPlayerId && !snapshot.ringBlockedUntilFlip[localPlayerId]),
    rematch: canSend && finished && solo,
    ready: canSend && finished && !solo && !options.readyPending,
    leave: !leaving && mode !== 'none', returnHome: !leaving,
  };
  return {
    language, solo, players, controls, finished, connectionPaused, leaving, winnerLabel, turnPrompt, timerLabel,
    title: solo ? t('game.singlePlayer') : `${t('game.table')} · ${snapshot?.roomCode ?? ''}`,
    connectionLabel: solo ? t('debug.singlePlayer') : t(`status.connection.${options.connectionStatus ?? 'connected'}`),
    ringFeedback, resultLabel, ringHistory,
    ringLabel: t('bell.ring'),
    bellHint: localPlayerId && snapshot?.ringBlockedUntilFlip[localPlayerId] ? t('match.ringLocked')
      : connectionPaused ? t('game.connectionPausedBanner') : snapshot?.canRing ? t('bell.anytime') : t('game.topCardsOnly'),
    readyLabel: snapshot && localPlayerId && snapshot.ready[localPlayerId] ? t('waiting.cancelReady') : t('game.playAgain'),
    visibleCountLabel: snapshot?.visibleCounts ? [...FRUIT_TYPES.map(fruit => `${t(`fruit.${fruit}`)}: ${snapshot.visibleCounts![fruit]}`),
      `${t('fruit.bell')}: ${snapshot.visibleCounts.wildBellCount}`].join(' · ') : t('game.topCardsOnly'),
  };
}
export type MatchViewModel = ReturnType<typeof createMatchViewModel>;

/** All painting and interactive rectangles are derived from the safe logical content. */
export function drawMatchScreen(context: CanvasContext2D, layout: ScreenLayout, view: MatchViewModel): TapTarget[] {
  const { content } = layout;
  const margin = Math.min(18, content.width / 16, content.height / 30);
  const x = content.x + margin; const width = Math.max(0, content.width - margin * 2);
  const y = content.y + margin; const height = Math.max(0, content.height - margin * 2);
  const region = (top: number, size: number): Rect => ({ x, y: y + height * top, width, height: height * size });
  const font = Math.min(14, height / 32, width / 20);
  const text = (rect: Rect, value: string, maxLines = 1, bold = false) => drawText(context, rect, value,
    { fontSize: font, maxLines, bold, color: gameColors.plum });
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = '#f5f1e8'; context.fillRect(content.x, content.y, content.width, content.height);
  drawText(context, region(0, 0.05), view.title, { fontSize: font * 1.5, bold: true, color: gameColors.plum });
  text(region(0.05, 0.04), `${view.connectionLabel} · ${view.timerLabel}`);
  text(region(0.09, 0.07), view.winnerLabel || view.turnPrompt, 2, true);
  const gap = Math.min(16, width / 16);
  const columnWidth = Math.max(0, (width - gap) / 2);
  view.players.forEach((player, index) => {
    const column = (top: number, size: number): Rect => ({ x: x + index * (columnWidth + gap), y: y + height * top,
      width: columnWidth, height: height * size });
    context.fillStyle = player.local ? gameColors.lavenderSurface : '#efe7d8';
    const row = column(0.17, 0.12); context.fillRect(row.x, row.y, row.width, row.height);
    text(column(0.17, 0.04), player.identityLabel, 1, true);
    text(column(0.21, 0.045), player.countLabel, 2);
    text(column(0.255, 0.03), player.statusLabel);
    const area = column(0.30, 0.25);
    const cardWidth = Math.min(area.width * 0.88, area.height / 1.4);
    const cardRect = { x: area.x + (area.width - cardWidth) / 2, y: area.y,
      width: cardWidth, height: Math.min(area.height, cardWidth * 1.4) };
    drawCard(context, cardRect, player.topCard, player.local ? 'local' : 'opponent', {
      face: gameColors.surface, back: player.local ? gameColors.lavenderSurface : '#efe7d8', border: gameColors.border, ink: gameColors.plum,
    });
  });
  text(region(0.56, 0.07), view.visibleCountLabel, 2);
  text(region(0.63, 0.045), `${CARD_SYMBOLS.bell} ${view.bellHint}`);
  text(region(0.675, 0.065), view.leaving ? view.turnPrompt : view.resultLabel, 2);
  text(region(0.745, 0.025), translate(view.language, 'log.heading'), 1, true);
  if (view.ringHistory.length) view.ringHistory.forEach((event, index) => text(region(0.77 + index * 0.027, 0.027), event.label));
  else text(region(0.77, 0.06), translate(view.language, 'log.empty'));
  const targets: TapTarget[] = [];
  const button = (id: string, label: string, rect: Rect, enabled: boolean, accent = false) => {
    context.fillStyle = enabled ? accent ? gameColors.lime : gameColors.surface : '#e6e1e8';
    context.fillRect(rect.x, rect.y, rect.width, rect.height);
    drawText(context, rect, label, { fontSize: font * 1.1, bold: accent, align: 'center', color: enabled ? gameColors.plum : gameColors.muted });
    if (enabled && rect.width > 0 && rect.height > 0) targets.push({ id, rect, enabled: true });
  };
  const half = (top: number, index: number): Rect => ({ x: x + index * (columnWidth + gap), y: y + height * top, width: columnWidth, height: height * 0.065 });
  if (view.finished) button(view.solo ? 'match.rematch' : 'match.ready', view.readyLabel,
    region(0.855, 0.065), view.solo ? view.controls.rematch : view.controls.ready, true);
  else {
    button('match.flip', translate(view.language, 'game.flip'), half(0.855, 0), view.controls.flip, true);
    button('match.ring', `${CARD_SYMBOLS.bell} ${view.ringLabel}`, half(0.855, 1), view.controls.ring, true);
  }
  button('match.leave', translate(view.language, 'game.leaveRoom'), half(0.935, 0), view.controls.leave);
  button('match.home', view.language === 'en' ? 'Return Home' : '返回首页', half(0.935, 1), view.controls.returnHome);
  context.restore(); return targets;
}

export function renderMatch(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot): TapTarget[] {
  const game = snapshot.game;
  return drawMatchScreen(context, layout, createMatchViewModel(game.roomSnapshot, game.localPlayerId, game.lastActionResult, {
    language: snapshot.settings.language, sessionMode: game.sessionMode, connectionStatus: game.connectionStatus,
    leavingRoom: game.leavingRoom, readyPending: Boolean(snapshot.app.pendingReadyAction), errorCode: game.error?.code,
  }));
}

/** Re-read the shared store on every action, including stale taps after a disconnect. */
export function dispatchMatchAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): void {
  const game = stores.game.getState();
  const view = createMatchViewModel(game.roomSnapshot, game.localPlayerId, game.lastActionResult, {
    sessionMode: game.sessionMode, connectionStatus: game.connectionStatus, leavingRoom: game.leavingRoom,
    readyPending: Boolean(app.getState().pendingReadyAction),
  });
  if (actionId === 'match.leave' || actionId === 'match.home' || actionId === 'session.leave') {
    if (game.leavingRoom) return;
    if (game.sessionMode === 'single-player') { game.leaveRoom(); app.navigation.navigate('home', true); }
    else if (game.sessionMode === 'online') game.leaveRoom();
    else if (actionId === 'match.home') app.navigation.navigate('home', true);
    return;
  }
  if (actionId === 'match.flip' && view.controls.flip) game.flip();
  else if (actionId === 'match.ring' && view.controls.ring) game.ring();
  else if (actionId === 'match.rematch' && view.controls.rematch) game.rematch();
  else if (actionId === 'match.ready' && view.controls.ready && game.localPlayerId && game.roomSnapshot) {
    const playerId = game.localPlayerId;
    const desiredReady = !game.roomSnapshot.ready[playerId];
    const actionId = game.setReady(desiredReady);
    if (actionId) app.update({ pendingReadyAction: { actionId, playerId, desiredReady, roomSessionVersion: game.roomSessionVersion } });
  }
}
