import type { StoreApi } from 'zustand/vanilla';
import type { SettingsStore } from '../../../src/store/createSettingsStoreApi';
import type { MiniGameWxApi } from './wxApi';

/** A dedicated looping player keeps match sound effects from replacing the music. */
export function createWxBackgroundMusic(api: Partial<Pick<MiniGameWxApi, 'createInnerAudioContext'>>,
  settings: Pick<StoreApi<SettingsStore>, 'getState' | 'subscribe'>) {
  let audio: WechatMinigame.InnerAudioContext | undefined;
  let foreground = true;
  let gestureStarted = false;
  let attempted = false;
  let failed = false;
  let disposed = false;

  const sync = () => {
    if (disposed) return;
    const state = settings.getState();
    const shouldPlay = foreground && gestureStarted && state.hydrated && state.musicEnabled && state.musicVolume > 0;
    try {
      if (audio) audio.volume = state.musicVolume;
      if (!shouldPlay) {
        if (attempted) audio?.pause();
        attempted = false;
        return;
      }
      if (attempted || failed || !api.createInnerAudioContext) return;
      if (!audio) {
        audio = api.createInnerAudioContext();
        audio.autoplay = false;
        audio.loop = true;
        audio.volume = state.musicVolume;
        audio.onError(() => { attempted = false; failed = true; });
        audio.src = 'assets/audio/background-music.wav';
      }
      attempted = true;
      audio.play();
    } catch { attempted = false; failed = true; }
  };
  const unsubscribe = settings.subscribe(sync);
  return {
    startFromGesture() { gestureStarted = true; failed = false; sync(); },
    setForeground(active: boolean) { foreground = active; sync(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      try { audio?.destroy(); } catch { /* The native context may already be unavailable. */ }
      audio = undefined;
    },
  };
}
