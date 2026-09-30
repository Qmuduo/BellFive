import * as Haptics from 'expo-haptics';

export type GameFeedbackEvent = 'flip' | 'correct' | 'wrong' | 'collect';

export type GameFeedbackProfile = Readonly<{
  haptic: 'light' | 'success' | 'soft' | 'none';
  sound: 'bell' | 'none';
}>;

export type BellAudioPlayer = Readonly<{
  isLoaded: boolean;
  seekTo: (seconds: number) => Promise<void>;
  play: () => void;
}>;

const FEEDBACK_PROFILES: Record<GameFeedbackEvent, GameFeedbackProfile> = {
  flip: { haptic: 'light', sound: 'none' },
  correct: { haptic: 'success', sound: 'bell' },
  wrong: { haptic: 'soft', sound: 'none' },
  collect: { haptic: 'none', sound: 'none' },
};

export function getFeedbackProfile(event: GameFeedbackEvent): GameFeedbackProfile {
  return FEEDBACK_PROFILES[event];
}

export function triggerGameFeedback(
  event: GameFeedbackEvent,
  audioPlayer?: BellAudioPlayer,
): void {
  const profile = getFeedbackProfile(event);

  if (profile.haptic === 'light') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  } else if (profile.haptic === 'success') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  } else if (profile.haptic === 'soft') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
  }

  if (profile.sound === 'bell' && audioPlayer?.isLoaded) {
    void audioPlayer.seekTo(0).then(() => audioPlayer.play()).catch(() => undefined);
  }
}
