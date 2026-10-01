import { render, screen, userEvent } from '@testing-library/react-native';
import { Share } from 'react-native';
import type { GameClientError } from '../../network/GameClient';
import type { RoomSnapshot } from '../../network/protocol';
import { WaitingRoom } from '../WaitingRoom';

describe('WaitingRoom', () => {
  it('shows the room code and connection state, and shares an invite', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const user = userEvent.setup();
    await render(
      <WaitingRoom
        roomCode="ABCD23"
        localPlayerId="A"
        snapshot={makeSnapshot()}
        connectionStatus="connected"
        error={null}
        onLeave={jest.fn()}
      />,
    );

    expect(screen.getByText('ABCD23')).toBeOnTheScreen();
    expect(screen.getByText('Player A · You')).toBeOnTheScreen();
    expect(screen.getByText('Player B')).toBeOnTheScreen();
    expect(screen.getByText('Waiting')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Share Invite' }));
    expect(share).toHaveBeenCalledWith({
      message: expect.stringContaining('ABCD23'),
    });
    share.mockRestore();
  });

  it('shows a recoverable room error while keeping the leave action available', async () => {
    const onLeave = jest.fn();
    const error: GameClientError = { code: 'ROOM_NOT_FOUND', message: 'Room expired. Leave and create another.' };
    const user = userEvent.setup();
    await render(
      <WaitingRoom
        roomCode="ABCD23"
        localPlayerId="A"
        snapshot={makeSnapshot()}
        connectionStatus="error"
        error={error}
        onLeave={onLeave}
      />,
    );
    expect(screen.getByText(error.message)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Leave Room' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});

function makeSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD23',
    phase: 'waiting',
    localPlayerId: 'A',
    players: {
      A: { connected: true, drawCount: null, playedCount: null, topCard: null },
      B: { connected: false, drawCount: null, playedCount: null, topCard: null },
    },
    turn: null,
    winner: null,
    lastRingOutcome: null,
    visibleCounts: null,
    canRing: false,
    tableVersion: 0,
    remainingSeconds: null,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null,
  };
}
