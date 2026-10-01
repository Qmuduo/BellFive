import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { Share } from 'react-native';
import GameScreen from '../GameScreen';
import { useGameStore } from '../../store/gameStore';
import type { RoomSnapshot } from '../../network/protocol';

const mockAudioPlayer = {
  isLoaded: true,
  volume: 1,
  seekTo: jest.fn(async () => undefined),
  play: jest.fn(),
  pause: jest.fn(),
};

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockAudioPlayer,
}));

describe('GameScreen friend-room flow', () => {
  beforeEach(() => {
    mockAudioPlayer.play.mockClear();
    mockAudioPlayer.pause.mockClear();
    mockAudioPlayer.seekTo.mockClear();
    mockAudioPlayer.volume = 1;
    useGameStore.setState({
      connectionStatus: 'idle',
      roomSnapshot: null,
      roomCode: null,
      localPlayerId: null,
      leavingRoom: false,
      error: null,
      lastActionResult: null,
      client: null,
      createRoom: jest.fn(),
      joinRoom: jest.fn(),
      flip: jest.fn(),
      ring: jest.fn(),
      rematch: jest.fn(),
      leaveRoom: jest.fn(),
      clearError: jest.fn(),
    });
  });

  it('starts at the create/join entry', async () => {
    await render(<GameScreen />);
    expect(screen.getByRole('button', { name: 'Create Room' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeOnTheScreen();
  });

  it('keeps create and join disabled while a room leave is waiting for confirmation', async () => {
    useGameStore.setState({ leavingRoom: true, connectionStatus: 'reconnecting' });
    await render(<GameScreen />);

    expect(screen.getByText('LEAVING…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'LEAVING…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeDisabled();
    expect(screen.getByLabelText('Room code')).toBeDisabled();
  });

  it('sends normalized join codes through the room store', async () => {
    const user = userEvent.setup();
    await render(<GameScreen />);
    await user.type(screen.getByLabelText('Room code'), 'ab cd23');
    await user.press(screen.getByRole('button', { name: 'Join Room' }));
    expect(useGameStore.getState().joinRoom).toHaveBeenCalledWith('ABCD23');
  });

  it('shows the private room code and invites a friend while waiting', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('waiting', 'A'),
    });
    await render(<GameScreen />);

    expect(screen.getByText('ABCD23')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Share Invite' }));
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('ABCD23') });
    share.mockRestore();
  });

  it('switches from waiting to the match when the server sends the second-player snapshot', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('waiting', 'A'),
    });
    await render(<GameScreen />);
    expect(screen.getByRole('button', { name: 'Share Invite' })).toBeOnTheScreen();

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
      });
    });

    expect(screen.getByRole('button', { name: 'FLIP' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Share Invite' })).toBeNull();
  });

  it('binds flipping to the local player and keeps the ring available on that phone', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    expect(screen.getByRole('button', { name: 'FLIP' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Player A deck' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Player B deck' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'FLIP' }));
    await user.press(screen.getByRole('button', { name: 'Player A deck' }));
    await user.press(screen.getByRole('button', { name: 'Ring Bell' }));
    expect(useGameStore.getState().flip).toHaveBeenCalledTimes(2);
    expect(useGameStore.getState().ring).toHaveBeenCalledTimes(1);
  });

  it('does not let Player B flip on Player A phone, but allows B to ring on their phone', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'B',
      roomSnapshot: makeSnapshot('playing', 'B', { turn: 'A', canRing: false }),
    });
    await render(<GameScreen />);

    expect(screen.getByRole('button', { name: 'FLIP' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Player B deck' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'Ring Bell' }));
    expect(useGameStore.getState().ring).toHaveBeenCalledTimes(1);
  });

  it('renders only the current top cards and server-provided debug counts', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', {
        turn: 'A',
        players: {
          A: { connected: true, drawCount: 29, playedCount: 1, topCard: { id: 'C001', symbols: ['banana'] } },
          B: { connected: true, drawCount: 30, playedCount: 0, topCard: null },
        },
      }),
    });
    await render(<GameScreen />);
    const playMat = screen.getByTestId('play-mat');
    expect(within(playMat).getByText('PLAYER A')).toBeOnTheScreen();
    expect(within(playMat).getByText('PLAYER B')).toBeOnTheScreen();
    expect(screen.getByText('A draw pile: 29')).toBeOnTheScreen();
    expect(screen.getByText('B draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('Turn: A')).toBeOnTheScreen();
  });

  it('pauses both controls during reconnect or a server connection pause', async () => {
    useGameStore.setState({
      connectionStatus: 'reconnecting',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('connection-paused', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);
    expect(screen.getByText('Connection paused')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'FLIP' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeDisabled();
  });

  it('shows the server restart error over the saved match and lets the player leave', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'error',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      error: { code: 'ROOM_NOT_FOUND', message: 'Room code was not found or has expired.' },
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);
    expect(screen.getByText('Room code was not found or has expired.')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Leave Room' }));
    expect(useGameStore.getState().leaveRoom).toHaveBeenCalledTimes(1);
  });

  it('shows the result from the local player perspective and offers host rematch', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('finished', 'A', { winner: 'A' }),
    });
    await render(<GameScreen />);

    expect(screen.getByText('YOU WIN')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'FLIP' })).toBeNull();
    await user.press(screen.getByRole('button', { name: 'PLAY AGAIN' }));
    expect(useGameStore.getState().rematch).toHaveBeenCalledTimes(1);
  });

  it('shows a loss to Player B and does not offer B a rematch action', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'B',
      roomSnapshot: makeSnapshot('finished', 'B', { winner: 'A' }),
    });
    await render(<GameScreen />);
    expect(screen.getByText('YOU LOSE')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'PLAY AGAIN' })).toBeNull();
  });

  it('shows the countdown and cooldown reminder while keeping Ring available', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      error: { code: 'RING_COOLDOWN', message: 'Flip one card before ringing again.' },
      roomSnapshot: makeSnapshot('playing', 'A', {
        turn: 'B',
        remainingSeconds: 300,
        ringBlockedUntilFlip: { A: true, B: false },
      }),
    });
    await render(<GameScreen />);

    expect(screen.getByText('05:00')).toBeOnTheScreen();
    expect(screen.getByText('Flip one card before ringing again.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeEnabled();
    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'A', { turn: 'B', remainingSeconds: 299 }),
      });
    });
    expect(screen.getByText('04:59')).toBeOnTheScreen();
  });

  it('shows DRAW when timeout leaves both players with the same number of cards', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('finished', 'A', { winner: null, remainingSeconds: 0 }),
    });
    await render(<GameScreen />);

    expect(screen.getByText('DRAW')).toBeOnTheScreen();
    expect(screen.getByText('00:00')).toBeOnTheScreen();
  });

  it('plays one shared sound for a new remote ring event without repeating it', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    const ringSnapshot = makeSnapshot('playing', 'A', {
      turn: 'A',
      lastRingOutcome: 'correct',
      ringVersion: 1,
      lastRingEvent: { version: 1, caller: 'B', outcome: 'correct', movedCardCount: 4 },
    });
    await act(async () => {
      useGameStore.getState().applyServerMessage({ type: 'room.snapshot', snapshot: ringSnapshot });
    });
    await act(async () => {
      useGameStore.getState().applyServerMessage({ type: 'room.snapshot', snapshot: ringSnapshot });
    });

    expect(mockAudioPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(mockAudioPlayer.play).toHaveBeenCalledTimes(1);
    expect(screen.getByText('DING! Correct Ring')).toBeOnTheScreen();
  });
});

function makeSnapshot(
  phase: RoomSnapshot['phase'],
  localPlayerId: 'A' | 'B',
  overrides: Partial<RoomSnapshot> = {},
): RoomSnapshot {
  return {
    roomCode: 'ABCD23',
    phase,
    localPlayerId,
    players: {
      A: { connected: true, drawCount: 30, playedCount: 0, topCard: null },
      B: { connected: true, drawCount: 30, playedCount: 0, topCard: null },
    },
    turn: null,
    winner: null,
    lastRingOutcome: null,
    visibleCounts: { banana: 0, grape: 0, pear: 0, strawberry: 0, peach: 0, wildBellCount: 0 },
    canRing: false,
    tableVersion: 4,
    ringVersion: 0,
    remainingSeconds: phase === 'waiting' ? null : 300,
    ringBlockedUntilFlip: { A: false, B: false },
    lastRingEvent: null,
    ...overrides,
  };
}
