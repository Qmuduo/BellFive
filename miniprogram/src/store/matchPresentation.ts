import type { RoomSnapshot, RingFeedbackEvent } from '../../../src/network/protocol';
import type { PlayerId } from '../../../src/game/types';
import type { Language } from '../../../src/i18n/types';
import { formatRingActivity } from '../../../src/i18n/ringActivity';
import type { GameClientStatus } from '../../../src/network/GameClient';
import type { GameSessionMode, GameStore } from '../../../src/store/createGameStore';

export type MiniMatchControls = Readonly<{
  canFlip: boolean;
  canRing: boolean;
  canReplay: boolean;
  canLeave: boolean;
  connectionPaused: boolean;
  replayAction: 'rematch' | 'ready' | null;
}>;

export type MiniMatchAction = 'flip' | 'ring' | 'rematch' | 'leave';

type MiniMatchControlInput = Readonly<{
  snapshot: RoomSnapshot;
  localPlayerId: PlayerId | null;
  sessionMode: GameSessionMode;
  connectionStatus: GameClientStatus;
  leavingRoom: boolean;
}>;

export function getMiniMatchControls({
  snapshot,
  localPlayerId,
  sessionMode,
  connectionStatus,
  leavingRoom,
}: MiniMatchControlInput): MiniMatchControls {
  const isSolo = sessionMode === 'single-player';
  const activeSession = sessionMode !== 'none';
  const canInteract = !leavingRoom && activeSession && snapshot.phase === 'playing' && (isSolo || connectionStatus === 'connected');
  const canReplay = !leavingRoom && activeSession && snapshot.phase === 'finished' && (isSolo || connectionStatus === 'connected');

  return {
    canFlip: canInteract && localPlayerId !== null && snapshot.turn === localPlayerId,
    canRing: canInteract && localPlayerId !== null && !snapshot.ringBlockedUntilFlip[localPlayerId],
    canReplay,
    canLeave: !leavingRoom && sessionMode !== 'none',
    connectionPaused: !isSolo && sessionMode !== 'none' && (
      snapshot.phase === 'connection-paused' || connectionStatus !== 'connected'
    ),
    replayAction: canReplay ? isSolo ? 'rematch' : 'ready' : null,
  };
}

type MiniMatchActions = Pick<GameStore, 'flip' | 'ring' | 'setReady' | 'rematch' | 'leaveRoom'>;

export function dispatchMiniMatchAction(
  action: MiniMatchAction,
  controls: MiniMatchControls,
  snapshot: RoomSnapshot,
  localPlayerId: PlayerId | null,
  actions: MiniMatchActions,
): boolean {
  if (action === 'flip' && controls.canFlip) {
    actions.flip();
    return true;
  }
  if (action === 'ring' && controls.canRing) {
    actions.ring();
    return true;
  }
  if (action === 'rematch' && controls.canReplay && localPlayerId) {
    if (controls.replayAction === 'rematch') actions.rematch();
    else actions.setReady(!snapshot.ready[localPlayerId]);
    return true;
  }
  if (action === 'leave' && controls.canLeave) {
    actions.leaveRoom();
    return true;
  }
  return false;
}

export type MiniRingLogEntry = Readonly<{ event: RingFeedbackEvent; message: string }>;

export function getMiniRingLogEntries(
  history: readonly RingFeedbackEvent[],
  latestEvent: RingFeedbackEvent | null,
  localPlayerId: PlayerId,
  language: Language,
  opponentName?: string,
): readonly MiniRingLogEntry[] {
  const uniqueEvents = new Map<number, RingFeedbackEvent>();
  for (const event of history) uniqueEvents.set(event.version, event);
  if (latestEvent) uniqueEvents.set(latestEvent.version, latestEvent);

  return [...uniqueEvents.values()]
    .sort((left, right) => left.version - right.version)
    .slice(-12)
    .map(event => ({
      event,
      message: formatRingActivity(event, localPlayerId, language, opponentName),
    }));
}
