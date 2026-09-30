import { getFeedbackProfile } from '../gameFeedback';

describe('getFeedbackProfile', () => {
  it.each([
    ['flip', { haptic: 'light', sound: 'none' }],
    ['correct', { haptic: 'success', sound: 'bell' }],
    ['wrong', { haptic: 'soft', sound: 'none' }],
    ['collect', { haptic: 'none', sound: 'none' }],
  ] as const)('selects the %s profile', (event, expected) => {
    expect(getFeedbackProfile(event)).toEqual(expected);
  });
});
