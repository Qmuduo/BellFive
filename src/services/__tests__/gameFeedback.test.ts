import * as Haptics from 'expo-haptics';
import { getFeedbackProfile, playRingOutcomeSound, triggerGameFeedback } from '../gameFeedback';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));

describe('getFeedbackProfile', () => {
  it.each([
    ['flip', { haptic: 'light', sound: 'none' }],
    ['correct', { haptic: 'success', sound: 'bell' }],
    ['wrong', { haptic: 'soft', sound: 'shortBell' }],
    ['press', { haptic: 'light', sound: 'none' }],
    ['collect', { haptic: 'none', sound: 'none' }],
  ] as const)('selects the %s profile', (event, expected) => {
    expect(getFeedbackProfile(event)).toEqual(expected);
  });
});

describe('playRingOutcomeSound', () => {
  it('plays a normal bell for a correct ring', async () => {
    const audio = makeAudioPlayer();
    await playRingOutcomeSound('correct', audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
  });

  it('plays a quiet short bell for a wrong ring, then restores audio', async () => {
    jest.useFakeTimers();
    const audio = makeAudioPlayer();
    await playRingOutcomeSound('wrong', audio);
    expect(audio.volume).toBe(0.3);
    expect(audio.play).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(220);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
    jest.useRealTimers();
  });

  it('does not let an older slow cue pause or replay a newer ring sound', async () => {
    jest.useFakeTimers();
    const audio = makeAudioPlayer();
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    audio.seekTo
      .mockImplementationOnce(() => new Promise<void>(resolve => { resolveFirst = () => resolve(); }))
      .mockImplementationOnce(() => new Promise<void>(resolve => { resolveSecond = () => resolve(); }));

    const firstCue = playRingOutcomeSound('wrong', audio);
    const secondCue = playRingOutcomeSound('wrong', audio);
    resolveSecond();
    await secondCue;
    jest.advanceTimersByTime(220);
    resolveFirst();
    await firstCue;

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
    jest.useRealTimers();
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
