import { act, render, screen } from '@testing-library/react-native';
import { BellButton } from '../BellButton';

const mockWithTiming = jest.fn((value: number) => value);

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: { View },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withSequence: (...values: unknown[]) => values,
    withSpring: (value: unknown) => value,
    withTiming: (value: number) => mockWithTiming(value),
  };
});

describe('BellButton', () => {
  it('replays wrong-ring shake feedback when the ring version changes', async () => {
    const view = await render(
      <BellButton disabled={false} outcome="wrong" feedbackKey={1} onRing={jest.fn()} />,
    );
    const firstFeedbackCount = mockWithTiming.mock.calls.length;

    await act(async () => {
      view.rerender(
        <BellButton disabled={false} outcome="wrong" feedbackKey={2} onRing={jest.fn()} />,
      );
    });

    expect(mockWithTiming.mock.calls.length).toBeGreaterThan(firstFeedbackCount);
    expect(screen.getByText('Wrong Ring')).toBeOnTheScreen();
  });
});
