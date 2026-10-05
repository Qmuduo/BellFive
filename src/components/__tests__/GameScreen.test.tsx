import { act, render, screen, userEvent, within } from '@testing-library/react-native';
import { Share } from 'react-native';
import GameScreen from '../GameScreen';
import { useGameStore } from '../../store/gameStore';
import { useAuthStore } from '../../auth/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  playBellSound,
  playCardFlipSound,
  playDefeatSound,
  playVictorySound,
} from '../../services/gameFeedback';
import type { RoomSnapshot } from '../../network/protocol';

jest.mock('../../services/gameFeedback', () => ({
  playBellSound: jest.fn(),
  playCardFlipSound: jest.fn(),
  playDefeatSound: jest.fn(),
  playVictorySound: jest.fn(),
  triggerGameFeedback: jest.fn(),
}));

const mockAudioPlayer = {
  isLoaded: true,
  volume: 1,
  seekTo: jest.fn(async () => undefined),
  play: jest.fn(),
  pause: jest.fn(),
};
const mockMusicPlayer = {
  isLoaded: true,
  loop: false,
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
  seekTo: jest.fn(async () => undefined),
};
const mockAudioStatus = { isLoaded: true, playing: false, error: null };
let mockAudioPlayerCall = 0;
const mockSetAudioModeAsync = jest.fn(async (_mode: unknown) => undefined);

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => (++mockAudioPlayerCall % 5 === 0 ? mockMusicPlayer : mockAudioPlayer),
  useAudioPlayerStatus: () => mockAudioStatus,
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
}));

jest.mock('../../store/profileStore', () => ({
  usePlayerProfileStore: (selector: (state: {
    profile: { nickname: string; avatarId: string };
    hydrated: boolean;
    setProfile: (profile: unknown) => void;
  }) => unknown) => selector({
    profile: { nickname: 'Mira', avatarId: 'peach' },
    hydrated: true,
    setProfile: jest.fn(),
  }),
}));

describe('GameScreen friend-room flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAudioPlayerCall = 0;
    useSettingsStore.setState({ language: 'en', musicEnabled: true, hydrated: true });
    mockAudioPlayer.play.mockClear();
    mockAudioPlayer.pause.mockClear();
    mockAudioPlayer.seekTo.mockClear();
    mockAudioPlayer.volume = 1;
    mockMusicPlayer.play.mockClear();
    mockMusicPlayer.pause.mockClear();
    mockMusicPlayer.seekTo.mockClear();
    mockMusicPlayer.volume = 1;
    useGameStore.setState({
      connectionStatus: 'idle',
      roomSnapshot: null,
      roomCode: null,
      localPlayerId: null,
      leavingRoom: false,
      error: null,
      lastActionResult: null,
      roomSessionVersion: 0,
      openRooms: [],
      pendingApplications: [],
      applyingRoomCode: null,
      localApplicationId: null,
      localApplicationStatus: null,
      client: null,
      createRoom: jest.fn(),
      joinRoom: jest.fn(),
      openLobby: jest.fn(),
      refreshLobby: jest.fn(),
      closeLobby: jest.fn(),
      applyToRoom: jest.fn(),
      decideApplication: jest.fn(),
      cancelApplication: jest.fn(),
      setReady: jest.fn(),
      flip: jest.fn(),
      ring: jest.fn(),
      rematch: jest.fn(),
      leaveRoom: jest.fn(),
      clearError: jest.fn(),
    });
    useAuthStore.setState({
      user: { userId: 'test-user', username: 'mira', profile: { nickname: 'Mira', avatarId: 'peach' }, wechatLinked: false },
      sessionToken: 'test-session-token',
      hydrated: true,
      pending: false,
      errorCode: null,
    });
  });

  it('configures audio for short game sounds when the screen mounts', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
    expect(screen.getByRole('button', { name: 'Turn background music off' })).toBeOnTheScreen();
  });

  it('keeps the soundtrack toggle separate from the short sound players', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await user.press(screen.getByRole('button', { name: 'Turn background music off' }));

    expect(screen.getByRole('button', { name: 'Turn background music on' })).toBeOnTheScreen();
    expect(mockMusicPlayer.pause).toHaveBeenCalled();
    expect(mockAudioPlayer.pause).not.toHaveBeenCalled();
  });

  it('starts at the create/join entry', async () => {
    await render(<GameScreen />);
    expect(screen.getByRole('button', { name: 'Create Room' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeOnTheScreen();
    expect(useGameStore.getState().openLobby).toHaveBeenCalledTimes(1);
  });

  it('renders public rooms and routes an application through the game store', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      openRooms: [{ roomCode: 'ABCD23', hostProfile: { nickname: 'Mira', avatarId: 'peach' } }],
    });
    await render(<GameScreen />);
    await user.press(screen.getByRole('button', { name: 'Request to join ABCD23' }));
    expect(useGameStore.getState().joinRoom).toHaveBeenCalledWith('ABCD23');
  });

  it('keeps create and join disabled while a room leave is waiting for confirmation', async () => {
    useGameStore.setState({ leavingRoom: true, connectionStatus: 'reconnecting' });
    await render(<GameScreen />);

    expect(screen.getByText('LEAVING…')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'LEAVING…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join Room' })).toBeDisabled();
    expect(screen.getByLabelText('Room code')).toBeDisabled();
  });

  it('opens the public lobby after a room leave is acknowledged', async () => {
    useGameStore.setState({ leavingRoom: true, connectionStatus: 'reconnecting' });
    await render(<GameScreen />);
    expect(useGameStore.getState().openLobby).not.toHaveBeenCalled();

    await act(async () => {
      useGameStore.setState({ leavingRoom: false, connectionStatus: 'disconnected' });
    });
    expect(useGameStore.getState().openLobby).toHaveBeenCalledTimes(1);
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

  it('keeps match diagnostics and activity available inside expandable details', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', {
        ringHistory: [
          { version: 1, caller: 'A', outcome: 'correct', movedCardCount: 6 },
          { version: 2, caller: 'B', outcome: 'wrong', movedCardCount: 1 },
        ],
      }),
    });
    await render(<GameScreen />);

    expect(screen.queryByText('Correct ring — you collect 6 cards')).toBeNull();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Match details' }));
    expect(screen.getByText('Correct ring — you collect 6 cards')).toBeOnTheScreen();
    expect(screen.getByText('Player B rang incorrectly — you receive 1 card')).toBeOnTheScreen();
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
    expect(screen.getByRole('button', { name: 'Language settings' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'You · Player A deck' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Opponent · Player B deck' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeEnabled();
    await user.press(screen.getByRole('button', { name: 'FLIP' }));
    await user.press(screen.getByRole('button', { name: 'You · Player A deck' }));
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
    expect(screen.getByRole('button', { name: 'You · Player B deck' })).toBeDisabled();
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
          A: { connected: true, drawCount: 29, playedCount: 1, topCard: { id: 'C001', symbols: ['banana'] }, profile: { nickname: 'Mira', avatarId: 'peach' } },
          B: { connected: true, drawCount: 30, playedCount: 0, topCard: null, profile: { nickname: 'Kai', avatarId: 'banana' } },
        },
      }),
    });
    await render(<GameScreen />);
    const playMat = screen.getByTestId('play-mat');
    expect(within(playMat).getByText('You · Mira')).toBeOnTheScreen();
    expect(within(playMat).getByText('Opponent · Kai')).toBeOnTheScreen();
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Match details' }));
    expect(screen.getByText('Player A draw pile: 29')).toBeOnTheScreen();
    expect(screen.getByText('Player B draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('Turn: Player A')).toBeOnTheScreen();
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

  it('disables both actions after the room connection is disconnected', async () => {
    useGameStore.setState({
      connectionStatus: 'disconnected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);
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
    expect(screen.getByText('That room is closed or no longer exists. Return to the lobby.')).toBeOnTheScreen();
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
    expect(useGameStore.getState().setReady).toHaveBeenCalledWith(true);
  });

  it('lets Player B ready for a rematch too', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'B',
      roomSnapshot: makeSnapshot('finished', 'B', { winner: 'A' }),
    });
    await render(<GameScreen />);
    expect(screen.getByText('YOU LOSE')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'PLAY AGAIN' }));
    expect(useGameStore.getState().setReady).toHaveBeenCalledWith(true);
  });

  it('locks ringing after a wrong ring until a snapshot clears the local lock', async () => {
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
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeDisabled();
    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'A', { turn: 'B', remainingSeconds: 299, ringBlockedUntilFlip: { A: false, B: false } }),
      });
    });
    expect(screen.getByText('04:59')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Ring Bell' })).toBeEnabled();
  });

  it('keeps the local player on the left when the server assigns seat B', async () => {
    useGameStore.setState({ connectionStatus: 'connected', roomCode: 'ABCD23', localPlayerId: 'B', roomSnapshot: makeSnapshot('playing', 'B', {
      turn: 'B', players: {
        A: { connected: true, drawCount: 20, playedCount: 2, topCard: null, profile: { nickname: 'Kai', avatarId: 'banana' } },
        B: { connected: true, drawCount: 18, playedCount: 4, topCard: null, profile: { nickname: 'Mira', avatarId: 'peach' } },
      },
    }) });
    await render(<GameScreen />);
    const cards = within(screen.getByTestId('play-mat')).getAllByText(/You ·|Opponent ·/);
    expect(cards[0]).toHaveTextContent('You · Mira');
    expect(cards[1]).toHaveTextContent('Opponent · Kai');
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

    expect(playBellSound).toHaveBeenCalledTimes(1);
    expect(playBellSound).toHaveBeenCalledWith(mockAudioPlayer);
    expect(screen.getByText('DING! Correct Ring')).toBeOnTheScreen();
    expect(screen.getByTestId('collect-to-B')).toBeOnTheScreen();
  });

  it('uses the same bell sound for a wrong ring event', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'A', {
          turn: 'A',
          lastRingOutcome: 'wrong',
          ringVersion: 1,
          lastRingEvent: { version: 1, caller: 'B', outcome: 'wrong', movedCardCount: 1 },
        }),
      });
    });

    expect(playBellSound).toHaveBeenCalledTimes(1);
    expect(playBellSound).toHaveBeenCalledWith(mockAudioPlayer);
  });

  it('uses the first observed ring event as a reconnect baseline', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', {
        ringVersion: 8,
        lastRingOutcome: 'correct',
        lastRingEvent: { version: 8, caller: 'B', outcome: 'correct', movedCardCount: 6 },
      }),
    });
    await render(<GameScreen />);

    expect(playBellSound).not.toHaveBeenCalled();
    expect(screen.queryByTestId('collect-to-B')).toBeNull();
  });

  it('uses a reconnect room session as the baseline for existing audio events', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.session',
        requestId: 'reconnect',
        roomCode: 'ABCD23',
        localPlayerId: 'A',
        seatToken: 'seat-token',
        snapshot: makeSnapshot('finished', 'A', {
          winner: 'B',
          ringVersion: 7,
          lastRingEvent: { version: 7, caller: 'B', outcome: 'correct', movedCardCount: 4 },
          lastFlipEvent: { version: 11, player: 'B' },
        }),
      });
    });

    expect(playBellSound).not.toHaveBeenCalled();
    expect(playCardFlipSound).not.toHaveBeenCalled();
    expect(playVictorySound).not.toHaveBeenCalled();
    expect(playDefeatSound).not.toHaveBeenCalled();
  });

  it('plays one shared flip sound for each new opponent flip event', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'B',
      roomSnapshot: makeSnapshot('playing', 'B', { turn: 'A' }),
    });
    await render(<GameScreen />);

    const flipped = makeSnapshot('playing', 'B', {
      turn: 'B',
      lastFlipEvent: { version: 1, player: 'A' },
    });
    await act(async () => {
      useGameStore.getState().applyServerMessage({ type: 'room.snapshot', snapshot: flipped });
    });
    await act(async () => {
      useGameStore.getState().applyServerMessage({ type: 'room.snapshot', snapshot: flipped });
    });

    expect(playCardFlipSound).toHaveBeenCalledTimes(1);
    expect(playCardFlipSound).toHaveBeenCalledWith(mockAudioPlayer);
  });

  it('plays the local flip sound on tap and does not replay its server echo', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await user.press(screen.getByRole('button', { name: 'FLIP' }));
    expect(playCardFlipSound).toHaveBeenCalledTimes(1);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'A', {
          turn: 'B',
          lastFlipEvent: { version: 1, player: 'A' },
        }),
      });
    });
    expect(playCardFlipSound).toHaveBeenCalledTimes(1);
  });

  it('plays the local bell sound on tap and does not replay its server echo', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'B' }),
    });
    await render(<GameScreen />);

    await user.press(screen.getByRole('button', { name: 'Ring Bell' }));
    expect(playBellSound).toHaveBeenCalledTimes(1);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'A', {
          turn: 'B',
          ringVersion: 1,
          lastRingEvent: { version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 1 },
        }),
      });
    });
    expect(playBellSound).toHaveBeenCalledTimes(1);
  });

  it('plays a local victory sound after observing the match finish', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('finished', 'A', { winner: 'A' }),
      });
    });

    expect(playVictorySound).toHaveBeenCalledTimes(1);
    expect(playVictorySound).toHaveBeenCalledWith(mockAudioPlayer);
    expect(playDefeatSound).not.toHaveBeenCalled();
  });

  it('plays a local defeat sound when the opponent wins', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'B',
      roomSnapshot: makeSnapshot('playing', 'B', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('finished', 'B', { winner: 'A' }),
      });
    });

    expect(playDefeatSound).toHaveBeenCalledTimes(1);
    expect(playDefeatSound).toHaveBeenCalledWith(mockAudioPlayer);
    expect(playVictorySound).not.toHaveBeenCalled();
  });

  it('does not play a result cue from an initial finished snapshot', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('finished', 'A', { winner: 'A' }),
    });
    await render(<GameScreen />);

    expect(playVictorySound).not.toHaveBeenCalled();
    expect(playDefeatSound).not.toHaveBeenCalled();
  });

  it('does not play a victory or defeat cue for a tied game', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'A',
      roomSnapshot: makeSnapshot('playing', 'A', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('finished', 'A', { winner: null }),
      });
    });

    expect(playVictorySound).not.toHaveBeenCalled();
    expect(playDefeatSound).not.toHaveBeenCalled();
  });

  it('shows a wrong-ring card moving from the caller to the opponent on both phones', async () => {
    useGameStore.setState({
      connectionStatus: 'connected',
      roomCode: 'ABCD23',
      localPlayerId: 'B',
      roomSnapshot: makeSnapshot('playing', 'B', { turn: 'A' }),
    });
    await render(<GameScreen />);

    await act(async () => {
      useGameStore.getState().applyServerMessage({
        type: 'room.snapshot',
        snapshot: makeSnapshot('playing', 'B', {
          turn: 'A',
          lastRingOutcome: 'wrong',
          ringVersion: 1,
          lastRingEvent: { version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 1 },
        }),
      });
    });

    expect(screen.getByTestId('transfer-A-to-B')).toBeOnTheScreen();
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
      A: { connected: true, drawCount: 30, playedCount: 0, topCard: null, profile: { nickname: '', avatarId: 'strawberry' } },
      B: { connected: true, drawCount: 30, playedCount: 0, topCard: null, profile: { nickname: '', avatarId: 'strawberry' } },
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
    lastFlipEvent: null,
    ready: { A: false, B: false },
    ringHistory: [],
    ...overrides,
  };
}
