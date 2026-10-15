import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSettingsStore } from '../store/settingsStore';

export function useBackgroundMusic(active: boolean) {
  const player = useAudioPlayer(require('../../assets/audio/background-music.wav'));
  const status = useAudioPlayerStatus(player);
  const enabled = useSettingsStore(state => state.musicEnabled);
  const volume = useSettingsStore(state => state.musicVolume);
  const hydrated = useSettingsStore(state => state.hydrated);
  const setMusicEnabled = useSettingsStore(state => state.setMusicEnabled);
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const gestureStarted = useRef(false);
  const pendingGeneration = useRef<number | null>(null);
  const playGeneration = useRef(0);
  const playAttempted = useRef(false);
  const shouldPlay = useRef(false);

  const invalidatePlayback = useCallback(() => {
    playGeneration.current += 1;
    pendingGeneration.current = null;
    playAttempted.current = false;
    player.pause();
  }, [player]);

  useEffect(() => {
    player.loop = true;
    player.volume = volume ?? 0.15;
  }, [player, volume]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const isForeground = state === 'active';
      setForeground(isForeground);
      if (!isForeground) {
        shouldPlay.current = false;
      }
    });
    const onVisibilityChange = () => {
      const isVisible = document.visibilityState !== 'hidden';
      setVisible(isVisible);
      if (!isVisible) {
        shouldPlay.current = false;
        invalidatePlayback();
      }
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      subscription.remove();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange);
      shouldPlay.current = false;
      invalidatePlayback();
    };
  }, [invalidatePlayback]);

  const attemptPlay = useCallback(async (fromToggle = false) => {
    if (!active || !hydrated || (!enabled && !fromToggle) || !foreground || !visible || !status.isLoaded) return;
    if (status.playing || pendingGeneration.current !== null || playAttempted.current) return;
    const generation = ++playGeneration.current;
    pendingGeneration.current = generation;
    try {
      player.play();
      if (generation === playGeneration.current) playAttempted.current = true;
      else if (!shouldPlay.current) player.pause();
    } catch {
      // Expo Web does not return the browser media play promise; this covers synchronous player failures.
      if (generation === playGeneration.current) {
        gestureStarted.current = false;
        playAttempted.current = false;
      }
    } finally {
      if (pendingGeneration.current === generation) pendingGeneration.current = null;
    }
  }, [active, enabled, foreground, hydrated, player, status.isLoaded, status.playing, visible]);

  useEffect(() => {
    shouldPlay.current = active && enabled && hydrated && foreground && visible;
    if (!shouldPlay.current) {
      if (pendingGeneration.current !== null || playAttempted.current) invalidatePlayback();
      return;
    }
    if (gestureStarted.current && status.isLoaded && !status.playing && !playAttempted.current) void attemptPlay();
  }, [active, attemptPlay, enabled, foreground, hydrated, invalidatePlayback, status.isLoaded, status.playing, visible]);

  useEffect(() => {
    if (!status.error) return;
    gestureStarted.current = false;
    playAttempted.current = false;
    player.pause();
  }, [player, status.error]);

  const startFromGesture = useCallback(() => {
    if (!active || !hydrated || !enabled || !foreground || !visible) return;
    gestureStarted.current = true;
    shouldPlay.current = true;
    if (!status.playing) playAttempted.current = false;
    void attemptPlay();
  }, [active, attemptPlay, enabled, foreground, hydrated, status.playing, visible]);
  const toggle = useCallback(() => {
    if (!hydrated) return;
    const nextEnabled = !enabled;
    setMusicEnabled(nextEnabled);
    if (nextEnabled) {
      // This call stays in the button's press handler for browser autoplay policies.
      gestureStarted.current = true;
      shouldPlay.current = active && foreground && visible;
      if (active && foreground && visible && status.isLoaded) void attemptPlay(true);
    } else {
      gestureStarted.current = false;
      shouldPlay.current = false;
      playAttempted.current = false;
      invalidatePlayback();
    }
  }, [active, attemptPlay, enabled, foreground, hydrated, invalidatePlayback, setMusicEnabled, status.isLoaded, visible]);

  return { enabled, toggle, startFromGesture } as const;
}
