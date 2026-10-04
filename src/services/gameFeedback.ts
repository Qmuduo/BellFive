import * as Haptics from 'expo-haptics';

export type GameFeedbackEvent = 'flip' | 'press' | 'correct' | 'wrong' | 'collect';

export type GameFeedbackProfile = Readonly<{
  haptic: 'light' | 'success' | 'soft' | 'none';
}>;

export type BellAudioPlayer = {
  volume: number;
  seekTo: (seconds: number) => Promise<void>;
  play: () => void;
};

const FEEDBACK_PROFILES: Record<GameFeedbackEvent, GameFeedbackProfile> = {
  flip: { haptic: 'light' },
  press: { haptic: 'light' },
  correct: { haptic: 'success' },
  wrong: { haptic: 'soft' },
  collect: { haptic: 'none' },
};

export function getFeedbackProfile(event: GameFeedbackEvent): GameFeedbackProfile {
  return FEEDBACK_PROFILES[event];
}

export function triggerGameFeedback(
  event: GameFeedbackEvent,
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
}

export function playBellSound(audioPlayer?: BellAudioPlayer): void {
  if (audioPlayer) audioPlayer.volume = 1;
  playAudioFromStart(audioPlayer);
}

export function playCardFlipSound(audioPlayer?: BellAudioPlayer): void {
  playAudioFromStart(audioPlayer);
}

export function playVictorySound(audioPlayer?: BellAudioPlayer): void {
  playAudioFromStart(audioPlayer);
}

export function playDefeatSound(audioPlayer?: BellAudioPlayer): void {
  playAudioFromStart(audioPlayer);
}

function playAudioFromStart(audioPlayer?: BellAudioPlayer): void {
  if (!audioPlayer) return;

  try {
    // Do not await this seek: local tap handlers must call play in the gesture stack.
    void audioPlayer.seekTo(0).catch(() => undefined);
  } catch {
    // Still attempt playback if the player cannot seek yet.
  }

  audioPlayer.play();
}
