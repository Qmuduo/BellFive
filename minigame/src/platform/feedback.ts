import type { MiniGameWxApi } from './wxApi';

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

export function shareMiniGame(api: Pick<MiniGameWxApi, 'shareAppMessage'>, title: string, query: string): void {
  api.shareAppMessage({ title, query });
}
