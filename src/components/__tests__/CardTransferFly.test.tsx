import { render, screen } from '@testing-library/react-native';
import { CardTransferFly } from '../CardTransferFly';

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native') as typeof import('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { in: (value: unknown) => value, cubic: 'cubic' },
    interpolate: (value: number) => value,
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withDelay: (_delay: number, value: unknown) => value,
    withTiming: (value: unknown) => value,
  };
});

describe('CardTransferFly', () => {
  it.each([
    { outcome: 'correct', caller: 'A', movedCardCount: 4, testId: 'collect-to-A' },
    { outcome: 'correct', caller: 'B', movedCardCount: 2, testId: 'collect-to-B' },
    { outcome: 'wrong', caller: 'A', movedCardCount: 1, testId: 'transfer-A-to-B' },
    { outcome: 'wrong', caller: 'B', movedCardCount: 1, testId: 'transfer-B-to-A' },
  ] as const)('shows $testId on either phone', async ({ outcome, caller, movedCardCount, testId }) => {
    await render(
      <CardTransferFly
        event={{ version: 1, caller, outcome, movedCardCount }}
      />,
    );

    expect(screen.getByTestId(testId)).toBeOnTheScreen();
    expect(screen.getByTestId(testId).props.pointerEvents).toBe('none');
  });

  it('does not render a flight if the wrong ringer had no penalty cards to transfer', async () => {
    await render(
      <CardTransferFly
        event={{ version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 0 }}
      />,
    );

    expect(screen.queryByTestId('transfer-A-to-B')).toBeNull();
  });

  it('caps the flying card backs at five and shows the remaining count', async () => {
    await render(
      <CardTransferFly
        event={{ version: 2, caller: 'A', outcome: 'correct', movedCardCount: 12 }}
      />,
    );

    expect(screen.getAllByTestId('flying-card')).toHaveLength(5);
    expect(screen.getByText('+7')).toBeOnTheScreen();
  });
});
