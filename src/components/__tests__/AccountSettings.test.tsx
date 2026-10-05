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

  it('waits for the saved guest profile before enabling profile edits or sign-in', async () => {
    await render(
      <AccountSettings
        user={null}
        profile={{ nickname: '', avatarId: 'strawberry' }}
        profileHydrated={false}
        onSaveProfile={jest.fn()}
        onLogin={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Nickname')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in or create an account' })).toBeDisabled();
  });
  it('disables an unverified cached profile and offers a refresh retry', async () => {
    const userEventApi = userEvent.setup();
    const onRefreshProfile = jest.fn().mockResolvedValue(undefined);
    await render(
      <AccountSettings
        user={user}
        profile={user.profile}
        authHydrated
        profileVerified={false}
        onSaveProfile={jest.fn()}
        onRefreshProfile={onRefreshProfile}
      />,
    );

    expect(screen.getByLabelText('Nickname')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
    expect(screen.getByText('Refresh your account profile before editing.')).toBeOnTheScreen();
    await userEventApi.press(screen.getByRole('button', { name: 'Refresh profile' }));
    expect(onRefreshProfile).toHaveBeenCalledTimes(1);
  });
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
