import Taro from '@tarojs/taro';

export type MiniFeedbackKind = 'correct' | 'wrong' | 'flip' | 'finish';

const FEEDBACK_INTENSITY: Record<MiniFeedbackKind, 'light' | 'medium' | 'heavy'> = {
  correct: 'medium',
  wrong: 'heavy',
  flip: 'light',
  finish: 'medium',
};

export function playMiniFeedback(kind: MiniFeedbackKind): void {
  const vibrateShort = Taro.vibrateShort;
  if (typeof vibrateShort !== 'function') return;

  try {
    void vibrateShort({ type: FEEDBACK_INTENSITY[kind] }).catch(() => undefined);
  } catch {
    // Feedback is optional in Mini Program environments and simulators.
  }
}
