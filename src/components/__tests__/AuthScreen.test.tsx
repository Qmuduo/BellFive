import { fireEvent, render, screen, userEvent } from '@testing-library/react-native';
import { AuthScreen } from '../AuthScreen';
import { useSettingsStore } from '../../store/settingsStore';

describe('AuthScreen', () => {
  beforeEach(() => useSettingsStore.setState({ language: 'en', hydrated: true }));

  it('does not offer registration before the local profile has hydrated', async () => {
    const user = userEvent.setup();
    await render(
      <AuthScreen canRegister={false} onLogin={jest.fn()} onRegister={jest.fn()} />,
    );

    const switchMode = screen.getByRole('button', { name: 'New to BellFive? Create an account' });
    expect(switchMode).toBeDisabled();
    expect(screen.getByText('LOADING PROFILE…')).toBeOnTheScreen();
    await user.press(switchMode);
    expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeOnTheScreen();
  });
  it('validates registration and submits the requested account flow', async () => {
    const onLogin = jest.fn().mockResolvedValue(undefined);
    const onRegister = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await render(<AuthScreen onLogin={onLogin} onRegister={onRegister} initialProfile={{ nickname: 'Mira', avatarId: 'pear' }} />);

    await user.press(screen.getByRole('button', { name: 'New to BellFive? Create an account' }));
    await user.type(screen.getByLabelText('Username'), 'mira');
    await user.type(screen.getByLabelText('Password'), 'password-123');
    await user.type(screen.getByLabelText('Confirm password'), 'different-password');
    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByText('Passwords do not match.')).toBeOnTheScreen();

    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), 'password-123');
    await user.press(screen.getByRole('button', { name: 'Create account' }));
    expect(onRegister).toHaveBeenCalledWith('mira', 'password-123');
  });
});
