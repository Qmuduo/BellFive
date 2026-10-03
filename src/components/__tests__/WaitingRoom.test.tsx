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
    expect(screen.getByText('Mira · A · You')).toBeOnTheScreen();
    expect(screen.getByText('Kai · B')).toBeOnTheScreen();
    expect(screen.getByText('🍑')).toBeOnTheScreen();
    expect(screen.getByText('🍌')).toBeOnTheScreen();
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

  it('lets both seats ready up and lets the host review join requests', async () => {
    const user = userEvent.setup();
    const onSetReady = jest.fn();
    const onDecideApplication = jest.fn();
    const snapshot = makeSnapshot();
    await render(
      <WaitingRoom
        roomCode="ABCD23"
        localPlayerId="A"
        snapshot={{ ...snapshot, players: { ...snapshot.players, B: { ...snapshot.players.B, connected: true } } }}
        connectionStatus="connected"
        error={null}
        onLeave={jest.fn()}
        onSetReady={onSetReady}
        pendingApplications={[{
          applicationId: 'app-1', roomCode: 'ABCD23', profile: { nickname: 'Jun', avatarId: 'grape' },
        }]}
        onDecideApplication={onDecideApplication}
      />,
    );

    expect(screen.getByText('Jun wants to join')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Approve Jun' }));
    expect(onDecideApplication).toHaveBeenCalledWith('app-1', true);
    await user.press(screen.getByRole('button', { name: 'READY' }));
    expect(onSetReady).toHaveBeenCalledWith(true);
  });
});

function makeSnapshot(): RoomSnapshot {
  return {
    roomCode: 'ABCD23',
    phase: 'waiting',
    localPlayerId: 'A',
    players: {
      A: { connected: true, drawCount: null, playedCount: null, topCard: null, profile: { nickname: 'Mira', avatarId: 'peach' } },
      B: { connected: false, drawCount: null, playedCount: null, topCard: null, profile: { nickname: 'Kai', avatarId: 'banana' } },
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
    lastFlipEvent: null,
    ready: { A: false, B: false },
    ringHistory: [],
  };
}
