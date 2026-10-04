import { render, screen, userEvent } from '@testing-library/react-native';
import { useSettingsStore } from '../../store/settingsStore';
import { LanguageSettings } from '../LanguageSettings';

describe('LanguageSettings', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'zh-CN', hydrated: true });
  });

  it('opens language choices and applies the selected language immediately', async () => {
    const user = userEvent.setup();
    await render(<LanguageSettings />);

    await user.press(screen.getByRole('button', { name: '语言设置' }));
    expect(screen.getByText('选择语言')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /简体中文/ }).props.accessibilityState).toMatchObject({ selected: true });

    await user.press(screen.getByRole('button', { name: 'English' }));
    expect(useSettingsStore.getState().language).toBe('en');
    expect(screen.queryByText('选择语言')).toBeNull();
    expect(screen.getByRole('button', { name: 'Language settings' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Language settings' }));
    expect(screen.getByText('Language')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /English/ }).props.accessibilityState).toMatchObject({ selected: true });
  });
});
