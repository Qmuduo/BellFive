import { formatGameError, playerSeatLabel, translate, type Language } from '../../../src/i18n';
import { formatRingActivity } from '../../../src/i18n/ringActivity';
import { FRUIT_TYPES, type PlayerId } from '../../../src/game/types';
import type { GameClientStatus } from '../../../src/network/GameClient';
import type { RingFeedbackEvent, RoomSnapshot, ServerMessage } from '../../../src/network/protocol';
import { AVATAR_EMOJI } from '../../../src/profile';
import type { GameSessionMode } from '../../../src/store/createGameStoreApi';
import { gameColors } from '../../../src/theme/gameColors';
import type { CanvasContext2D } from '../platform/wxApi';
import { CARD_SYMBOLS, drawCard } from '../runtime/drawCard';
import { drawText } from '../runtime/drawText';
import { drawAvatarBadge, drawCanvasButton, drawRoundedPanel, drawStatusBadge } from '../runtime/ui';
import type { Rect, ScreenLayout, TapTarget } from '../runtime/layout';
import type { MiniGameApp } from '../runtime/navigation';
import type { MiniGameStores } from '../stores/gameStore';
import type { ScreenSnapshot } from './home';
import { dispatchSettingsAction } from './settings';

interface MatchOptions {
  language?: Language; sessionMode?: GameSessionMode; connectionStatus?: GameClientStatus;
  leavingRoom?: boolean; readyPending?: boolean; errorCode?: string;
  musicEnabled?: boolean; musicHydrated?: boolean;
}
type ActionResult = Extract<ServerMessage, { type: 'action.result' }>;
export type MatchTransferAnimation = Readonly<{ event: RingFeedbackEvent; startedAt: number }>;

const CARD_FLIGHT_MS = 620;
const CARD_FLIGHT_STAGGER_MS = 58;
const CARD_FLIGHT_COUNT = 5;

function drawTransferCard(context: CanvasContext2D, center: { x: number; y: number }, progress: number,
  fan: number, alpha: number): void {
  const width = 26 - progress * 10;
  const height = width * 1.4;
  context.save();
  context.globalAlpha = alpha;
  context.translate(center.x, center.y);
  context.rotate(fan * 0.025 + progress * 0.08);
  drawRoundedPanel(context, { x: -width / 2, y: -height / 2, width, height }, {
    fill: gameColors.surface, border: gameColors.purpleActionBorder, radius: 5, borderWidth: 1.5,
  });
  context.font = `${Math.max(12, width * 0.58)}px sans-serif`;
  context.fillStyle = gameColors.purple;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(CARD_SYMBOLS.bell, 0, 0);
  context.restore();
}

function drawCardFlight(context: CanvasContext2D, start: { x: number; y: number }, end: { x: number; y: number },
  progress: number, fan: number): void {
  const eased = 1 - Math.pow(1 - progress, 3);
  const control = { x: (start.x + end.x) / 2, y: Math.min(start.y, end.y) - 24 - Math.abs(fan) };
  const point = {
    x: (1 - eased) * (1 - eased) * start.x + 2 * (1 - eased) * eased * control.x + eased * eased * end.x,
    y: (1 - eased) * (1 - eased) * start.y + 2 * (1 - eased) * eased * control.y + eased * eased * end.y,
  };
  context.save();
  context.globalAlpha = 0.3 * (1 - eased);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.quadraticCurveTo(control.x, control.y, point.x, point.y);
  context.strokeStyle = gameColors.purpleActionBorder;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
  drawTransferCard(context, point, eased, fan, 1 - eased * 0.14);
}

function drawCardTransfer(context: CanvasContext2D, event: RingFeedbackEvent, startedAt: number, timestamp: number,
  tableCards: Readonly<Record<PlayerId, Rect>>, drawCounters: Readonly<Record<PlayerId, Rect>>): void {
  const elapsed = Math.max(0, timestamp - startedAt);
  const opponent: PlayerId = event.caller === 'A' ? 'B' : 'A';
  const isCollection = event.outcome === 'correct';
  const receiver: PlayerId = isCollection ? event.caller : opponent;
  const count = Math.min(event.movedCardCount, CARD_FLIGHT_COUNT);
  const center = (rect: Rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
  const destination = center(drawCounters[receiver]);

  for (let index = 0; index < count; index += 1) {
    const delay = index * CARD_FLIGHT_STAGGER_MS;
    const progress = Math.min(1, Math.max(0, (elapsed - delay) / CARD_FLIGHT_MS));
    if (elapsed < delay) continue;
    const fan = index - (count - 1) / 2;
    const origin = center(isCollection ? tableCards[index % 2 === 0 ? 'A' : 'B'] : drawCounters[event.caller]);
    drawCardFlight(context, { x: origin.x + fan * 5, y: origin.y + fan * 1.5 }, destination, progress, fan);
  }

  if (elapsed >= 260) {
    const badge = (playerId: PlayerId, label: string, tone: 'success' | 'error') => {
      const point = center(drawCounters[playerId]);
      drawStatusBadge(context, { x: point.x - 23, y: point.y - 12, width: 46, height: 24 }, label, tone);
    };
    if (isCollection) badge(event.caller, `+${event.movedCardCount}`, 'success');
    else {
      badge(event.caller, `−${event.movedCardCount}`, 'error');
      badge(opponent, `+${event.movedCardCount}`, 'success');
    }
  }
}

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
    music: !leaving && (options.musicHydrated ?? true),
  };
  return {
    language, solo, players, controls, finished, connectionPaused, leaving, winnerLabel, turnPrompt, timerLabel,
    musicEnabled: options.musicEnabled ?? true,
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
export function drawMatchScreen(context: CanvasContext2D, layout: ScreenLayout, view: MatchViewModel,
  timestamp = 0, transferAnimation: MatchTransferAnimation | null = null): TapTarget[] {
  const { content } = layout;
  const margin = Math.min(12, content.width / 24, content.height / 35);
  const x = content.x + margin; const width = Math.max(0, content.width - margin * 2);
  const top = content.y + margin; const bottom = content.y + content.height - margin;
  const compact = content.height < 520;
  const titleHeight = 30; let headerHeight = titleHeight; const turnHeight = compact ? 40 : 46;
  const consoleHeight = compact ? Math.max(112, Math.min(145, content.height * 0.32)) : 156;
  const consoleY = bottom - consoleHeight;
  let turnY = top + headerHeight + 6;
  let boardY = turnY + turnHeight + 8;
  const detailHeight = compact ? 38 : 64;
  const font = Math.min(13, Math.max(10, width / 29));
  const text = (rect: Rect, value: string, size = font, color: string = gameColors.plum, maxLines = 1, bold = false) =>
    drawText(context, rect, value, { fontSize: size, color, maxLines, bold });
  const targets: TapTarget[] = [];
  const button = (id: string, label: string, rect: Rect, enabled: boolean,
    variant: 'primary' | 'secondary' | 'lime' | 'text', size: number) => {
    drawCanvasButton(context, rect, label, { variant, enabled, fontSize: size, radius: Math.min(14, rect.height / 3) });
    if (enabled && rect.width > 0 && rect.height > 0) targets.push({ id, rect, enabled: true });
  };
  context.save(); context.beginPath(); context.rect(content.x, content.y, content.width, content.height); context.clip();
  context.fillStyle = gameColors.canvas; context.fillRect(content.x, content.y, content.width, content.height);
  const auxiliaryWidth = Math.min(58, width * 0.17);
  let auxiliaryY = top;
  const menu = layout.menuButton;
  const auxiliaryGap = 4;
  const actionRight = menu ? Math.min(x + width, menu.x - auxiliaryGap) : x + width;
  const actionGroupWidth = auxiliaryWidth * 3 + auxiliaryGap * 2;
  const horizontalAuxiliary = Boolean(menu && menu.y < top + titleHeight
    && actionRight - x - actionGroupWidth >= 160);
  const overlapsMenu = (rect: Rect) => !!menu && rect.x < menu.x + menu.width && rect.x + rect.width > menu.x
    && rect.y < menu.y + menu.height && rect.y + rect.height > menu.y;
  const musicRect = { x: horizontalAuxiliary ? actionRight - actionGroupWidth : x + width - actionGroupWidth,
    y: auxiliaryY, width: auxiliaryWidth, height: headerHeight };
  const leaveRect = { ...musicRect, x: musicRect.x + auxiliaryWidth + auxiliaryGap };
  const homeRect = { x: leaveRect.x + auxiliaryWidth + auxiliaryGap, y: auxiliaryY, width: auxiliaryWidth, height: headerHeight };
  if (!horizontalAuxiliary && (overlapsMenu(musicRect) || overlapsMenu(leaveRect) || overlapsMenu(homeRect))) {
    auxiliaryY = Math.max(top, menu!.y + menu!.height + 4);
    headerHeight = auxiliaryY - top + 30;
    turnY = top + headerHeight + 6;
    boardY = turnY + turnHeight + 8;
  }
  const boardHeight = Math.max(72, consoleY - 8 - detailHeight - boardY);
  const boardBottom = Math.min(consoleY - 8, boardY + boardHeight);
  button('settings.music.toggle', view.language === 'en' ? view.musicEnabled ? 'Music On' : 'Music Off' : view.musicEnabled ? '音乐开' : '音乐关',
    { ...musicRect, y: auxiliaryY, height: 30 }, view.controls.music, view.musicEnabled ? 'lime' : 'secondary', 10);
  button('match.leave', translate(view.language, 'game.leaveRoom'),
    { ...leaveRect, y: auxiliaryY, height: 30 }, view.controls.leave, 'text', 9);
  button('match.home', view.language === 'en' ? 'Home' : '首页',
    { ...homeRect, y: auxiliaryY, height: 30 }, view.controls.returnHome, 'text', 9);
  const timerX = horizontalAuxiliary ? musicRect.x - 68 : x + width - actionGroupWidth - 64;
  const titleWidth = horizontalAuxiliary ? Math.max(0, timerX - x - 8) : width - actionGroupWidth - 66;
  text({ x, y: top, width: titleWidth, height: titleHeight }, view.title, font + 2, gameColors.plum, 1, true);
  text({ x: timerX, y: top, width: 60, height: titleHeight }, view.timerLabel, font + 1, gameColors.purple, 1, true);

  drawRoundedPanel(context, { x, y: turnY, width, height: turnHeight },
    { fill: gameColors.lavenderSurface, radius: 14 });
  text({ x: x + 12, y: turnY + 4, width: width - 24, height: turnHeight * 0.54 },
    view.winnerLabel || view.turnPrompt, font + 1, gameColors.plum, 1, true);
  text({ x: x + 12, y: turnY + turnHeight * 0.57, width: width - 24, height: turnHeight * 0.32 },
    view.bellHint, font - 2, gameColors.muted);

  const gap = Math.min(10, width / 28); const columnWidth = (width - gap) / 2;
  const tableCards: Record<PlayerId, Rect> = { A: { x: 0, y: 0, width: 0, height: 0 }, B: { x: 0, y: 0, width: 0, height: 0 } };
  view.players.forEach((player, index) => {
    const px = x + index * (columnWidth + gap);
    const panel = { x: px, y: boardY, width: columnWidth, height: Math.max(0, boardBottom - boardY) };
    drawRoundedPanel(context, panel, { fill: gameColors.surface, border: gameColors.border, radius: 16 });
    drawAvatarBadge(context, { x: px + 8, y: boardY + 8, width: 30, height: 30 }, player.avatar,
      { background: player.local ? gameColors.lavenderSurface : gameColors.canvas, foreground: gameColors.plum,
        fontSize: 17, radius: 15 });
    text({ x: px + 42, y: boardY + 7, width: columnWidth - 48, height: 18 }, player.identityLabel,
      font - 2, gameColors.plum, 1, true);
    text({ x: px + 42, y: boardY + 26, width: columnWidth - 48, height: 14 }, player.statusLabel,
      font - 3, gameColors.muted);
    const cardSpace = Math.max(0, panel.height - 53);
    const cardWidth = Math.min(columnWidth - 24, cardSpace / 1.4);
    const cardRect = { x: px + (columnWidth - cardWidth) / 2, y: boardY + 47,
      width: cardWidth, height: Math.min(cardSpace, cardWidth * 1.4) };
    tableCards[player.id] = cardRect;
    drawCard(context, cardRect, player.topCard, player.local ? 'local' : 'opponent', {
      face: gameColors.surface, back: gameColors.lavenderSurface, border: gameColors.border, ink: gameColors.plum,
    });
  });
  const detailY = boardBottom + 5;
  text({ x, y: detailY, width, height: 17 }, view.visibleCountLabel, font - 2, gameColors.muted);
  text({ x, y: detailY + 17, width, height: 18 }, view.leaving ? view.turnPrompt : view.resultLabel || view.connectionLabel,
    font - 2, gameColors.plum);
  if (!compact) {
    text({ x, y: detailY + 36, width: 85, height: 16 }, translate(view.language, 'log.heading'), font - 2, gameColors.plum, 1, true);
    text({ x: x + 88, y: detailY + 36, width: width - 88, height: 16 },
      view.ringHistory[view.ringHistory.length - 1]?.label ?? translate(view.language, 'log.empty'), font - 2, gameColors.muted);
  }

  drawRoundedPanel(context, { x, y: consoleY, width, height: consoleHeight }, { fill: gameColors.plum, radius: 18 });
  const own = view.players.find(player => player.local);
  text({ x: x + 14, y: consoleY + 7, width: width * 0.43, height: 19 }, own?.identityLabel ?? view.title,
    font, gameColors.onDark, 1, true);
  const counterGap = 4;
  const counterArea = { x: x + width * 0.44, y: consoleY + 5, width: width * 0.52 - 8, height: 24 };
  const counterWidth = Math.max(0, (counterArea.width - counterGap) / 2);
  const drawCounters: Record<PlayerId, Rect> = { A: { x: 0, y: 0, width: 0, height: 0 }, B: { x: 0, y: 0, width: 0, height: 0 } };
  view.players.forEach((player, index) => {
    const rect = { x: counterArea.x + index * (counterWidth + counterGap), y: counterArea.y,
      width: counterWidth, height: counterArea.height };
    drawCounters[player.id] = rect;
    drawRoundedPanel(context, rect, { fill: player.local ? gameColors.lime : gameColors.lavenderSurface, radius: 8 });
    const label = translate(view.language, player.local ? 'match.count.you' : 'match.count.opponent');
    text({ x: rect.x + 4, y: rect.y + 1, width: rect.width - 8, height: rect.height - 2 },
      `${label} ${player.drawCount ?? '—'}`, Math.max(8, font - 3), player.local ? gameColors.plum : gameColors.muted, 1, true);
  });
  text({ x: x + 14, y: consoleY + 27, width: width - 28, height: 19 },
    view.finished ? view.winnerLabel : view.turnPrompt, font - 1, gameColors.mutedOnDark);
  const actionY = consoleY + (consoleHeight <= 120 ? 50 : 56);
  const actionHeight = Math.max(44, Math.min(56, consoleHeight - (actionY - consoleY) - 19));
  if (view.finished) button(view.solo ? 'match.rematch' : 'match.ready', view.readyLabel,
    { x: x + 12, y: actionY, width: width - 24, height: actionHeight },
    view.solo ? view.controls.rematch : view.controls.ready, 'primary', font + 2);
  else {
    const actionGap = 10; const actionWidth = (width - 24 - actionGap) / 2;
    button('match.flip', translate(view.language, 'game.flip'),
      { x: x + 12, y: actionY, width: actionWidth, height: actionHeight }, view.controls.flip, 'primary', font + 2);
    button('match.ring', `${CARD_SYMBOLS.bell} ${view.ringLabel}`,
      { x: x + 12 + actionWidth + actionGap, y: actionY, width: actionWidth, height: actionHeight },
      view.controls.ring, 'lime', font + 2);
  }
  text({ x: x + 12, y: actionY + actionHeight + 2, width: width - 24, height: 17 },
    view.ringFeedback || view.bellHint, font - 2, gameColors.subtleOnDark);
  if (transferAnimation && timestamp - transferAnimation.startedAt < 950) {
    drawCardTransfer(context, transferAnimation.event, transferAnimation.startedAt, timestamp, tableCards, drawCounters);
  }
  context.restore(); return targets;
}

export function renderMatch(context: CanvasContext2D, layout: ScreenLayout, snapshot: ScreenSnapshot,
  timestamp = 0, transferAnimation: MatchTransferAnimation | null = null): TapTarget[] {
  const game = snapshot.game;
  return drawMatchScreen(context, layout, createMatchViewModel(game.roomSnapshot, game.localPlayerId, game.lastActionResult, {
    language: snapshot.settings.language, sessionMode: game.sessionMode, connectionStatus: game.connectionStatus,
    leavingRoom: game.leavingRoom, readyPending: Boolean(snapshot.app.pendingReadyAction), errorCode: game.error?.code,
    musicEnabled: snapshot.settings.musicEnabled, musicHydrated: snapshot.settings.hydrated,
  }), timestamp, transferAnimation);
}

/** Re-read the shared store on every action, including stale taps after a disconnect. */
export function dispatchMatchAction(actionId: string, app: MiniGameApp, stores: MiniGameStores): void {
  if (dispatchSettingsAction(actionId, stores)) return;
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
