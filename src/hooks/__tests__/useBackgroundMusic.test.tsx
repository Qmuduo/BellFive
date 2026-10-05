import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useBackgroundMusic } from '../useBackgroundMusic';
import { useSettingsStore } from '../../store/settingsStore';

const mockMusicPlayer = {
  isLoaded: true,
  loop: false,
  volume: 1,
  play: jest.fn(),
  pause: jest.fn(),
};
const mockMusicStatus = { isLoaded: true, playing: false, error: null as string | null };

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => mockMusicPlayer,
  useAudioPlayerStatus: () => mockMusicStatus,
}));

describe('useBackgroundMusic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSettingsStore.setState({ musicEnabled: true, hydrated: true });
    mockMusicPlayer.isLoaded = true;
    mockMusicPlayer.loop = false;
    mockMusicPlayer.volume = 1;
    mockMusicStatus.isLoaded = true;
    mockMusicStatus.playing = false;
    mockMusicStatus.error = null;
  });

  afterEach(() => jest.restoreAllMocks());

  it('waits for a gesture, then starts only its looping player at low volume', async () => {
    const { result } = await renderHook(() => useBackgroundMusic(true));

    expect(mockMusicPlayer.play).not.toHaveBeenCalled();
    expect(mockMusicPlayer.loop).toBe(true);
    expect(mockMusicPlayer.volume).toBe(0.15);

    await act(async () => { await result.current.startFromGesture(); });

    expect(mockMusicPlayer.play).toHaveBeenCalledTimes(1);
  });

  it('does not start on a gesture while inactive and pauses after the match becomes inactive', async () => {
    const { result, rerender } = await renderHook(({ active }: { active: boolean }) => useBackgroundMusic(active), {
      initialProps: { active: false },
    });

    await act(async () => { await result.current.startFromGesture(); });
    expect(mockMusicPlayer.play).not.toHaveBeenCalled();

    await rerender({ active: true });
    await act(async () => { await result.current.startFromGesture(); });
    expect(mockMusicPlayer.play).toHaveBeenCalledTimes(1);

    mockMusicPlayer.pause.mockClear();
    await rerender({ active: false });
    expect(mockMusicPlayer.pause).toHaveBeenCalledTimes(1);
  });

  it('pauses when the app enters the background', async () => {
    let onStateChange: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      onStateChange = listener as (state: string) => void;
      return { remove: jest.fn() } as never;
    });
    const { result } = await renderHook(() => useBackgroundMusic(true));

    await act(async () => { await result.current.startFromGesture(); });
    await act(async () => { onStateChange?.('background'); });

    expect(mockMusicPlayer.pause).toHaveBeenCalled();
  });

  it('turning music off pauses the soundtrack and persists the choice', async () => {
    const { result } = await renderHook(() => useBackgroundMusic(true));

    await act(async () => { result.current.toggle(); });

    expect(mockMusicPlayer.pause).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().musicEnabled).toBe(false);
  });

  it('does not play before settings hydrate or when hydration restores music disabled', async () => {
    useSettingsStore.setState({ musicEnabled: true, hydrated: false });
    const { result } = await renderHook(() => useBackgroundMusic(true));

    await act(async () => { await result.current.startFromGesture(); });
    await act(async () => { useSettingsStore.setState({ musicEnabled: false, hydrated: true }); });

    expect(mockMusicPlayer.play).not.toHaveBeenCalled();
  });
});
