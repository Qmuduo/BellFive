import type { MiniGameWxApi } from './wxApi';
import type { StoreApi } from 'zustand/vanilla';
import type { GameStore } from '../../../src/store/createGameStoreApi';

export function createWxFeedback(api: Partial<Pick<MiniGameWxApi, 'createInnerAudioContext' | 'vibrateShort'>>) {
  let audio: WechatMinigame.InnerAudioContext | undefined;
  let disposed = false;
  let unavailable = false;
  return {
    play(source: string, enabled = true) {
      if (!enabled || disposed || unavailable || !api.createInnerAudioContext) return;
      try {
        if (!audio) {
          audio = api.createInnerAudioContext();
          audio.onError(() => { unavailable = true; });
        }
        audio.stop(); audio.src = source; audio.play();
      } catch { unavailable = true; }
    },
    vibrate(enabled = true) {
      if (!enabled || disposed) return;
      try { api.vibrateShort?.({ type: 'light', fail: () => {} }); } catch { /* Optional hardware capability. */ }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { audio?.destroy(); } catch { /* Release is best effort when the platform is unavailable. */ }
      audio = undefined;
    },
  };
}

/** Observe accepted authoritative events, never user intent or transport action results.
 * Session/reconnect snapshots establish a baseline so old events do not play again. */
export function connectMatchFeedback(gameStore: Pick<StoreApi<GameStore>, 'getState' | 'subscribe'>,
  feedback: ReturnType<typeof createWxFeedback>, enabled: () => boolean = () => true,
  active: () => boolean = () => true): () => void {
  let sessionVersion = gameStore.getState().roomSessionVersion;
  let previous = gameStore.getState().roomSnapshot;
  let flipVersion = previous?.lastFlipEvent?.version ?? 0;
  let ringVersion = previous?.lastRingEvent?.version ?? 0;
  return gameStore.subscribe(() => {
    const state = gameStore.getState(); const snapshot = state.roomSnapshot;
    const changedSession = state.roomSessionVersion !== sessionVersion;
    sessionVersion = state.roomSessionVersion;
    if (!snapshot || !previous || changedSession || snapshot.roomCode !== previous.roomCode
      || previous.phase === 'finished' && snapshot.phase === 'playing') {
      previous = snapshot;
      flipVersion = snapshot?.lastFlipEvent?.version ?? 0;
      ringVersion = snapshot?.lastRingEvent?.version ?? 0;
      return;
    }
    const canPlay = active() && enabled() && !state.leavingRoom
      && (state.sessionMode === 'single-player' || state.sessionMode === 'online' && state.connectionStatus === 'connected')
      && snapshot.phase !== 'connection-paused';
    const flip = snapshot.lastFlipEvent;
    if (flip && flip.version > flipVersion) {
      flipVersion = flip.version;
      feedback.play('assets/audio/card-flip.wav', canPlay);
    }
    const ring = snapshot.lastRingEvent;
    if (ring && ring.version > ringVersion) {
      ringVersion = ring.version;
      feedback.play('assets/audio/bell.wav', canPlay);
      feedback.vibrate(canPlay);
    }
    if (previous.phase === 'playing' && snapshot.phase === 'finished' && snapshot.winner !== null) {
      feedback.play(snapshot.winner === state.localPlayerId ? 'assets/audio/victory.wav' : 'assets/audio/defeat.wav', canPlay);
    }
    previous = snapshot;
  });
}

export function shareMiniGame(api: Pick<MiniGameWxApi, 'shareAppMessage'>, title: string, query: string): void {
  api.shareAppMessage({ title, query });
}
