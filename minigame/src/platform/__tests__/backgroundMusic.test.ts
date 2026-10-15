/** @jest-environment node */
import { createSettingsStoreApi } from '../../../../src/store/createSettingsStoreApi';
import { createWxBackgroundMusic } from '../backgroundMusic';
import { createWxFeedback } from '../feedback';

function fixture() {
  const settings = createSettingsStoreApi({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  const contexts: ReturnType<typeof context>[] = [];
  function context() {
    return { src: '', loop: false, autoplay: true, volume: 1, playing: false, destroyed: false,
      error: () => {}, onError(callback: () => void) { this.error = callback; },
      play() { this.playing = true; }, pause() { this.playing = false; }, stop() { this.playing = false; },
      destroy() { this.destroyed = true; this.playing = false; } };
  }
  const api = { createInnerAudioContext() { const audio = context(); contexts.push(audio); return audio; } };
  const music = createWxBackgroundMusic(api as any, settings);
  return { settings, api, contexts, music };
}

test('a user gesture starts a quiet loop and live settings control its volume independently from the switch', () => {
  const f = fixture();
  expect(f.contexts).toHaveLength(0);
  f.music.startFromGesture();
  const audio = f.contexts[0];
  expect(audio).toMatchObject({ src: 'assets/audio/background-music.wav', loop: true, autoplay: false, volume: 0.15, playing: true });
  f.settings.getState().setMusicVolume(0.65);
  expect(audio.volume).toBe(0.65);
  f.settings.getState().setMusicEnabled(false);
  expect(audio.playing).toBe(false);
  f.settings.getState().setMusicEnabled(true);
  expect(audio).toMatchObject({ playing: true, volume: 0.65 });
  f.settings.getState().setMusicVolume(0);
  expect(audio.playing).toBe(false);
  f.settings.getState().setMusicVolume(0.3);
  expect(audio).toMatchObject({ playing: true, volume: 0.3 });
  expect(f.contexts).toHaveLength(1);
  f.music.dispose();
});

test('backgrounding pauses the loop and foregrounding respects a disabled choice', () => {
  const f = fixture(); f.music.startFromGesture();
  f.music.setForeground(false); expect(f.contexts[0].playing).toBe(false);
  f.music.setForeground(true); expect(f.contexts[0].playing).toBe(true);
  f.music.setForeground(false); f.settings.getState().setMusicEnabled(false);
  f.music.setForeground(true); expect(f.contexts[0].playing).toBe(false);
  f.music.dispose();
  expect(f.contexts[0].destroyed).toBe(true);
  f.settings.getState().setMusicEnabled(true); f.music.startFromGesture(); f.music.dispose();
  expect(f.contexts).toHaveLength(1); expect(f.contexts[0].playing).toBe(false);
});

test('stored settings finish hydrating before music starts', () => {
  const f = fixture(); f.settings.setState({ hydrated: false });
  f.music.startFromGesture(); expect(f.contexts).toHaveLength(0);
  f.settings.setState({ hydrated: true, musicEnabled: false }); expect(f.contexts).toHaveLength(0);
  f.settings.getState().setMusicEnabled(true); expect(f.contexts[0].playing).toBe(true);
  f.music.dispose();
});

test('an audio error can be retried by the next user gesture', () => {
  const f = fixture(); f.music.startFromGesture();
  const audio = f.contexts[0]; audio.playing = false; audio.error();
  f.settings.getState().setMusicVolume(0.5); expect(audio.playing).toBe(false);
  f.music.startFromGesture(); expect(audio.playing).toBe(true);
  f.music.dispose();
});

test('ring sound effects use another context and remain available with background music off', () => {
  const f = fixture(); f.music.startFromGesture();
  const feedback = createWxFeedback(f.api as any);
  feedback.play('assets/audio/bell.wav');
  expect(f.contexts).toHaveLength(2);
  expect(f.contexts[0]).toMatchObject({ playing: true, src: 'assets/audio/background-music.wav' });
  f.settings.getState().setMusicEnabled(false);
  feedback.play('assets/audio/card-flip.wav');
  expect(f.contexts[0].playing).toBe(false);
  expect(f.contexts[1]).toMatchObject({ playing: true, src: 'assets/audio/card-flip.wav' });
  feedback.dispose(); f.music.dispose();
});

test('unsupported audio hardware does not block settings or game lifecycle', () => {
  const f = fixture(); const music = createWxBackgroundMusic({}, f.settings);
  expect(() => { music.startFromGesture(); music.setForeground(false); music.setForeground(true); music.dispose(); }).not.toThrow();
  f.music.dispose();
});
