import { render, screen, userEvent } from '@testing-library/react-native';
import { AccountSettings } from '../AccountSettings';
import type { AuthUser } from '../../auth/contracts';
import { useSettingsStore } from '../../store/settingsStore';

const user: AuthUser = {
  userId: 'user-1', username: 'kai', wechatLinked: true,
  profile: { nickname: 'Kai', avatarId: 'pear' },
};

describe('AccountSettings', () => {
  beforeEach(() => useSettingsStore.setState({ language: 'en', hydrated: true }));

  it('saves canonical profile changes and signs out', async () => {
    const onSaveProfile = jest.fn().mockResolvedValue(undefined);
    const onLogout = jest.fn().mockResolvedValue(undefined);
    const userEventApi = userEvent.setup();
    await render(<AccountSettings user={user} profile={user.profile} onSaveProfile={onSaveProfile} onLogout={onLogout} />);

    expect(screen.getByText('kai')).toBeOnTheScreen();
    expect(screen.getByText('WeChat linked')).toBeOnTheScreen();
    await userEventApi.clear(screen.getByLabelText('Nickname'));
    await userEventApi.type(screen.getByLabelText('Nickname'), 'Mira');
    await userEventApi.press(screen.getByRole('button', { name: 'Save profile' }));
    expect(onSaveProfile).toHaveBeenCalledWith({ nickname: 'Mira', avatarId: 'pear' });
    await userEventApi.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
