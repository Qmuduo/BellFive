import { render, screen } from '@testing-library/react-native';
import { RingActivityLog, formatRingActivity } from '../RingActivityLog';
import type { RingFeedbackEvent } from '../../network/protocol';

describe('RingActivityLog', () => {
  it('formats caller and opponent messages from both seats', () => {
    const correctA: RingFeedbackEvent = { version: 1, caller: 'A', outcome: 'correct', movedCardCount: 6 };
    const wrongB: RingFeedbackEvent = { version: 2, caller: 'B', outcome: 'wrong', movedCardCount: 1 };

    expect(formatRingActivity(correctA, 'A')).toBe('拍铃正确，获得 6 张牌');
    expect(formatRingActivity(correctA, 'B')).toBe('1号玩家拍铃正确，获得 6 张牌');
    expect(formatRingActivity(wrongB, 'B')).toBe('拍铃错误，交出 1 张牌');
    expect(formatRingActivity(wrongB, 'A')).toBe('2号玩家拍铃错误，你获得 1 张牌');
  });

  it('explains a wrong ring when no penalty card could be transferred', () => {
    const event: RingFeedbackEvent = { version: 3, caller: 'A', outcome: 'wrong', movedCardCount: 0 };
    expect(formatRingActivity(event, 'A')).toBe('拍铃错误，没有牌可交出');
    expect(formatRingActivity(event, 'B')).toBe('1号玩家拍铃错误，没有牌转移');
  });

  it('keeps the supplied events in a scrollable activity panel', async () => {
    const events: RingFeedbackEvent[] = [
      { version: 1, caller: 'A', outcome: 'correct', movedCardCount: 6 },
      { version: 2, caller: 'B', outcome: 'wrong', movedCardCount: 1 },
    ];
    await render(<RingActivityLog events={events} localPlayerId="A" />);

    expect(screen.getByLabelText('Ring activity log')).toBeOnTheScreen();
    expect(screen.getByText('2/12')).toBeOnTheScreen();
    expect(screen.getByText('拍铃正确，获得 6 张牌')).toBeOnTheScreen();
    expect(screen.getByText('2号玩家拍铃错误，你获得 1 张牌')).toBeOnTheScreen();
  });
});
