import { act, render, screen } from '@testing-library/react-native';
import { useSettingsStore } from '../../store/settingsStore';
import { GameCard } from '../GameCard';

describe('GameCard localization', () => {
  it('updates its empty-card label when the language changes', async () => {
    useSettingsStore.setState({ language: 'en', hydrated: true });
    await render(<GameCard playerId="A" playerLabel="Player A" />);
    expect(screen.getByText('READY')).toBeOnTheScreen();

    await act(async () => {
      useSettingsStore.getState().setLanguage('zh-CN');
    });

    expect(screen.getByText('准备')).toBeOnTheScreen();
  });
});
