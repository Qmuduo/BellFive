import { render, screen, userEvent } from '@testing-library/react-native';
import GameScreen from '../GameScreen';
import { useGameStore } from '../../store/gameStore';

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
});
