import Taro from '@tarojs/taro';

export type MiniFeedbackKind = 'correct' | 'wrong' | 'flip' | 'finish';

const AUDIO_SOURCE: Record<MiniFeedbackKind, string> = {
  correct: '/assets/audio/bell.wav',
  wrong: '/assets/audio/defeat.wav',
  flip: '/assets/audio/card-flip.wav',
  finish: '/assets/audio/victory.wav',
};

const FEEDBACK_INTENSITY: Record<MiniFeedbackKind, 'light' | 'medium' | 'heavy'> = {
  correct: 'medium',
  wrong: 'heavy',
  flip: 'light',
  finish: 'medium',
};

export function playMiniFeedback(kind: MiniFeedbackKind, enabled = true): void {
  if (!enabled) return;

  const vibrateShort = Taro.vibrateShort;
  if (typeof vibrateShort === 'function') {
    try {
      void vibrateShort({ type: FEEDBACK_INTENSITY[kind] }).catch(() => undefined);
    } catch {
      // Haptic feedback is optional in Mini Program environments and simulators.
    }
  }

  const createAudio = Taro.createInnerAudioContext;
  if (typeof createAudio !== 'function') return;
  try {
    const audio = createAudio();
    if (!audio) return;
    audio.src = AUDIO_SOURCE[kind];
    audio.volume = 0.32;
    if (typeof audio.onEnded === 'function') audio.onEnded(() => audio.destroy());
    if (typeof audio.onError === 'function') audio.onError(() => audio.destroy());
    audio.play();
  } catch {
    // Short audio is an enhancement; unsupported or unavailable media must not affect play.
  }
}
