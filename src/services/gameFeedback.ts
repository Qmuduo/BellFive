import * as Haptics from 'expo-haptics';

export type GameFeedbackEvent = 'flip' | 'press' | 'correct' | 'wrong' | 'collect';

export type GameFeedbackProfile = Readonly<{
  haptic: 'light' | 'success' | 'soft' | 'none';
}>;

export type BellAudioPlayer = {
  isLoaded: boolean;
  volume: number;
  seekTo: (seconds: number) => Promise<void>;
  play: () => void;
  pause: () => void;
};

const FEEDBACK_PROFILES: Record<GameFeedbackEvent, GameFeedbackProfile> = {
  flip: { haptic: 'light' },
  press: { haptic: 'light' },
  correct: { haptic: 'success' },
  wrong: { haptic: 'soft' },
  collect: { haptic: 'none' },
};

let ringSoundGeneration = 0;

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

export async function playBellSound(audioPlayer?: BellAudioPlayer): Promise<void> {
  if (!audioPlayer?.isLoaded) return;
  const generation = ++ringSoundGeneration;
  audioPlayer.volume = 1;
  try {
    await audioPlayer.seekTo(0);
  } catch {
    return;
  }
  if (generation !== ringSoundGeneration) return;
  audioPlayer.play();
}

export function playCardFlipSound(audioPlayer?: BellAudioPlayer): Promise<void> {
  return playAudioFromStart(audioPlayer);
}

export function playVictorySound(audioPlayer?: BellAudioPlayer): Promise<void> {
  return playAudioFromStart(audioPlayer);
}

export function playDefeatSound(audioPlayer?: BellAudioPlayer): Promise<void> {
  return playAudioFromStart(audioPlayer);
}

async function playAudioFromStart(audioPlayer?: BellAudioPlayer): Promise<void> {
  if (!audioPlayer?.isLoaded) return;
  try {
    await audioPlayer.seekTo(0);
  } catch {
    return;
  }
  audioPlayer.play();
}
