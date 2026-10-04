import { render, screen, userEvent } from '@testing-library/react-native';
import { AvatarPicker } from '../AvatarPicker';
import { useSettingsStore } from '../../store/settingsStore';

describe('AvatarPicker', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'en', hydrated: true });
  });

  it('shows all six preset avatars and marks the selected avatar', async () => {
    await render(<AvatarPicker selected="pear" onSelect={jest.fn()} />);

    for (const avatar of ['banana', 'grape', 'pear', 'strawberry', 'peach', 'bell']) {
      expect(screen.getByRole('button', { name: `${avatar} avatar` })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'pear avatar' }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: 'banana avatar' }).props.accessibilityState).toMatchObject({ selected: false });
  });

  it('returns the selected preset id', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    await render(<AvatarPicker selected="pear" onSelect={onSelect} />);

    await user.press(screen.getByRole('button', { name: 'bell avatar' }));

    expect(onSelect).toHaveBeenCalledWith('bell');
  });
});
