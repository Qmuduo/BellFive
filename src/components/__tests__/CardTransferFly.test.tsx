import { render, screen } from '@testing-library/react-native';
import { CardTransferFly } from '../CardTransferFly';
import type { TransferAnchors } from '../CardTransferFly';

const anchors: TransferAnchors = {
  deck: { A: { x: 84, y: 330 }, B: { x: 236, y: 330 } },
  table: { A: { x: 84, y: 116 }, B: { x: 236, y: 116 } },
};

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
    { outcome: 'correct', caller: 'A', movedCardCount: 4, testId: 'collect-to-A', feedback: 'player-feedback-A', amount: '+4' },
    { outcome: 'correct', caller: 'B', movedCardCount: 2, testId: 'collect-to-B', feedback: 'player-feedback-B', amount: '+2' },
    { outcome: 'wrong', caller: 'A', movedCardCount: 1, testId: 'transfer-A-to-B', feedback: null, amount: null },
    { outcome: 'wrong', caller: 'B', movedCardCount: 1, testId: 'transfer-B-to-A', feedback: null, amount: null },
  ] as const)('shows $testId on either phone', async ({ outcome, caller, movedCardCount, testId, feedback, amount }) => {
    await render(
      <CardTransferFly
        event={{ version: 1, caller, outcome, movedCardCount }}
        localPlayerId="A"
        anchors={anchors}
      />,
    );

    expect(screen.getByTestId(testId)).toBeOnTheScreen();
    expect(screen.getByTestId(testId).props.pointerEvents).toBe('none');
    if (feedback && amount) expect(screen.getByTestId(feedback)).toHaveTextContent(amount);
  });

  it.each([
    { caller: 'A', ringer: '−1', receiverId: 'player-feedback-B' },
    { caller: 'B', ringer: '−2', receiverId: 'player-feedback-A' },
  ] as const)('shows wrong-ring loss and gain beside the affected players when caller is $caller', async ({ caller, ringer, receiverId }) => {
    await render(
      <CardTransferFly
        event={{ version: 1, caller, outcome: 'wrong', movedCardCount: caller === 'A' ? 1 : 2 }}
        localPlayerId="A"
        anchors={anchors}
      />,
    );

    const callerBadge = screen.getByTestId(`player-feedback-${caller}`);
    const receiverBadge = screen.getByTestId(receiverId);
    expect(callerBadge).toHaveTextContent(ringer);
    expect(receiverBadge).toHaveTextContent(caller === 'A' ? '+1' : '+2');
  });

  it('does not render a flight if the wrong ringer had no penalty cards to transfer', async () => {
    await render(
      <CardTransferFly
        event={{ version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 0 }}
        localPlayerId="A"
        anchors={anchors}
      />,
    );

    expect(screen.queryByTestId('transfer-A-to-B')).toBeNull();
    expect(screen.queryByTestId('player-feedback-A')).toBeNull();
    expect(screen.queryByTestId('player-feedback-B')).toBeNull();
  });

  it('caps the flying card backs at five and shows the full collected count at the winner', async () => {
    await render(
      <CardTransferFly
        event={{ version: 2, caller: 'A', outcome: 'correct', movedCardCount: 12 }}
        localPlayerId="A"
        anchors={anchors}
      />,
    );

    expect(screen.getAllByTestId('flying-card')).toHaveLength(5);
    expect(screen.getByTestId('player-feedback-A')).toHaveTextContent('+12');
    expect(screen.queryByText('+7')).toBeNull();
  });
});
