import * as Haptics from 'expo-haptics';
import {
  getFeedbackProfile,
  playBellSound,
  playCardFlipSound,
  playDefeatSound,
  playVictorySound,
  triggerGameFeedback,
} from '../gameFeedback';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));

describe('getFeedbackProfile', () => {
  it.each([
    ['flip', { haptic: 'light' }],
    ['correct', { haptic: 'success' }],
    ['wrong', { haptic: 'soft' }],
    ['press', { haptic: 'light' }],
    ['collect', { haptic: 'none' }],
  ] as const)('selects the %s profile', (event, expected) => {
    expect(getFeedbackProfile(event)).toEqual(expected);
  });
});

describe('game sound cues', () => {
  it('plays the same full-volume bell cue without shortening it', async () => {
    jest.useFakeTimers();
    const audio = makeAudioPlayer();
    await playBellSound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
    jest.advanceTimersByTime(300);
    expect(audio.pause).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('plays a card flip cue from the start', async () => {
    const audio = makeAudioPlayer();
    await playCardFlipSound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('plays a victory cue from the start', async () => {
    const audio = makeAudioPlayer();
    await playVictorySound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('plays a defeat cue from the start', async () => {
    const audio = makeAudioPlayer();
    await playDefeatSound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('does not replay an older delayed bell cue over a newer ring sound', async () => {
    const audio = makeAudioPlayer();
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    audio.seekTo
      .mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = () => resolve(); }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { resolveSecond = () => resolve(); }));

    const firstCue = playBellSound(audio);
    const secondCue = playBellSound(audio);
    resolveSecond();
    await secondCue;
    resolveFirst();
    await firstCue;

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
  });
});

describe('triggerGameFeedback', () => {
  it('uses a light local haptic for a bell press and outcome-specific local haptics', () => {
    triggerGameFeedback('press');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

    triggerGameFeedback('correct');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);

    triggerGameFeedback('wrong');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Soft);
  });
});

function makeAudioPlayer() {
  return {
    isLoaded: true,
    volume: 1,
    seekTo: jest.fn(async (_seconds: number): Promise<void> => {}),
    play: jest.fn(),
    pause: jest.fn(),
  };
}
