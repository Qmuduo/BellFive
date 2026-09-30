import { render, screen, userEvent } from '@testing-library/react-native';
import GameScreen from '../GameScreen';
import { useGameStore } from '../../store/gameStore';
import type { CardDefinition, GameElement, GameState } from '../../game/types';

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ isLoaded: false, seekTo: jest.fn(), play: jest.fn() }),
}));

const makeCard = (id: string, symbols: readonly GameElement[]): CardDefinition => ({
  id,
  symbols,
});

const makeRingState = (correct: boolean): GameState => ({
  status: 'playing',
  turn: 'B',
  winner: null,
  lastRingOutcome: null,
  players: {
    A: {
      drawPile: correct
        ? [makeCard('A-draw', ['banana'])]
        : [makeCard('A-draw-1', ['banana']), makeCard('A-draw-2', ['grape']), makeCard('A-draw-3', ['pear'])],
      playedPile: [
        makeCard('A-visible', correct ? ['strawberry', 'strawberry', 'strawberry'] : ['banana']),
        makeCard('A-hidden', ['peach']),
      ],
    },
    B: {
      drawPile: [makeCard('B-draw', ['grape'])],
      playedPile: [
        makeCard('B-visible', correct ? ['strawberry', 'bell'] : ['grape']),
        makeCard('B-hidden', ['pear']),
      ],
    },
  },
});

describe('GameScreen', () => {
  beforeEach(() => {
    useGameStore.setState({ game: null });
  });

  it('starts a 30/30 game and flips one card for the active player', async () => {
    const user = userEvent.setup();
    await render(<GameScreen />);

    await user.press(screen.getByRole('button', { name: 'Start Game' }));
    expect(screen.getByText('A draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('B draw pile: 30')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'FLIP' }));

    expect(screen.getByText('A draw pile: 29')).toBeOnTheScreen();
    expect(screen.getByText('A played pile: 1')).toBeOnTheScreen();
    expect(screen.getByText('Turn: B')).toBeOnTheScreen();
  });

  it("allows only the active player's deck tap to flip a card", async () => {
    const user = userEvent.setup();
    await render(<GameScreen />);
    await user.press(screen.getByRole('button', { name: 'Start Game' }));

    await user.press(screen.getByRole('button', { name: 'Player B deck' }));
    expect(screen.getByText('A draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('B draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('Turn: A')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Player A deck' }));
    expect(screen.getByText('A draw pile: 29')).toBeOnTheScreen();
    expect(screen.getByText('A played pile: 1')).toBeOnTheScreen();
    expect(screen.getByText('Turn: B')).toBeOnTheScreen();
  });

  it('keeps both ring zones enabled and penalizes the player who rings incorrectly', async () => {
    const user = userEvent.setup();
    useGameStore.setState({ game: makeRingState(false) });
    await render(<GameScreen />);

    expect(screen.getByText('Can Ring: false')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Player A ring' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Player B ring' })).toBeEnabled();

    await user.press(screen.getByRole('button', { name: 'Player A ring' }));

    expect(screen.getByText('Wrong Ring')).toBeOnTheScreen();
    expect(screen.getByText('A draw pile: 1')).toBeOnTheScreen();
    expect(screen.getByText('B draw pile: 3')).toBeOnTheScreen();
    expect(screen.getByText('Turn: B')).toBeOnTheScreen();
  });

  it('shows correct-ring feedback and collects the table for the caller', async () => {
    const user = userEvent.setup();
    useGameStore.setState({ game: makeRingState(true) });
    await render(<GameScreen />);

    expect(screen.getByText('Can Ring: true')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Player A ring' }));

    expect(screen.getByText('DING! Correct Ring')).toBeOnTheScreen();
    expect(screen.getByText('A draw pile: 5')).toBeOnTheScreen();
    expect(screen.getByText('A played pile: 0')).toBeOnTheScreen();
    expect(screen.getByText('B played pile: 0')).toBeOnTheScreen();
    expect(screen.getByText('Turn: B')).toBeOnTheScreen();
  });

  it('shows the winner, blocks play actions, and restarts with a fresh 30/30 deal', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      game: {
        ...makeRingState(false),
        turn: 'A',
        status: 'finished',
        winner: 'B',
      },
    });
    await render(<GameScreen />);

    expect(screen.getByText('YOU WIN')).toBeOnTheScreen();
    expect(screen.getByText('PLAYER B WINS')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'FLIP' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Player A ring' })).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Restart Game' }));

    expect(screen.queryByText('YOU WIN')).toBeNull();
    expect(screen.getByText('A draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('B draw pile: 30')).toBeOnTheScreen();
    expect(screen.getByText('Turn: A')).toBeOnTheScreen();
  });

  it('finishes the game when the active player presses FLIP with an empty draw pile', async () => {
    const user = userEvent.setup();
    useGameStore.setState({
      game: {
        status: 'playing',
        turn: 'A',
        winner: null,
        lastRingOutcome: null,
        players: {
          A: { drawPile: [], playedPile: [makeCard('A-visible', ['banana'])] },
          B: { drawPile: [makeCard('B-draw', ['pear'])], playedPile: [] },
        },
      },
    });
    await render(<GameScreen />);

    await user.press(screen.getByRole('button', { name: 'FLIP' }));

    expect(screen.getByText('PLAYER B WINS')).toBeOnTheScreen();
    expect(screen.getByText('Turn: A')).toBeOnTheScreen();
  });
});
