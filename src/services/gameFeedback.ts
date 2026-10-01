import * as Haptics from 'expo-haptics';

export type GameFeedbackEvent = 'flip' | 'press' | 'correct' | 'wrong' | 'collect';

export type GameFeedbackProfile = Readonly<{
  haptic: 'light' | 'success' | 'soft' | 'none';
  sound: 'bell' | 'shortBell' | 'none';
}>;

export type BellAudioPlayer = {
  isLoaded: boolean;
  volume: number;
  seekTo: (seconds: number) => Promise<void>;
  play: () => void;
  pause: () => void;
};

const FEEDBACK_PROFILES: Record<GameFeedbackEvent, GameFeedbackProfile> = {
  flip: { haptic: 'light', sound: 'none' },
  press: { haptic: 'light', sound: 'none' },
  correct: { haptic: 'success', sound: 'bell' },
  wrong: { haptic: 'soft', sound: 'shortBell' },
  collect: { haptic: 'none', sound: 'none' },
};

let shortBellTimeout: ReturnType<typeof setTimeout> | null = null;
let ringSoundGeneration = 0;

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
    void playRingOutcomeSound('correct', audioPlayer);
  } else if (profile.sound === 'shortBell' && audioPlayer?.isLoaded) {
    void playRingOutcomeSound('wrong', audioPlayer);
  }
}

export async function playRingOutcomeSound(
  outcome: 'correct' | 'wrong',
  audioPlayer?: BellAudioPlayer,
): Promise<void> {
  if (!audioPlayer?.isLoaded) return;
  const generation = ++ringSoundGeneration;
  if (shortBellTimeout !== null) {
    clearTimeout(shortBellTimeout);
    shortBellTimeout = null;
  }

  const isShortCue = outcome === 'wrong';
  audioPlayer.volume = isShortCue ? 0.3 : 1;
  try {
    await audioPlayer.seekTo(0);
  } catch {
    if (generation === ringSoundGeneration) audioPlayer.volume = 1;
    return;
  }
  if (generation !== ringSoundGeneration) return;
  audioPlayer.play();

  if (isShortCue) {
    shortBellTimeout = setTimeout(() => {
      if (generation !== ringSoundGeneration) return;
      try {
        audioPlayer.pause();
      } finally {
        audioPlayer.volume = 1;
        shortBellTimeout = null;
      }
    }, 220);
  }
}
