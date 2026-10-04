import * as Haptics from 'expo-haptics';
declare const require: (path: string) => unknown;
declare const __dirname: string;

type WavBuffer = Uint8Array & {
  toString: (encoding: string, start?: number, end?: number) => string;
  readUInt16LE: (offset: number) => number;
  readUInt32LE: (offset: number) => number;
  readInt16LE: (offset: number) => number;
  subarray: (start: number, end?: number) => WavBuffer;
};

const { readFileSync } = require('fs') as { readFileSync: (path: string) => WavBuffer };
const { resolve } = require('path') as { resolve: (...segments: string[]) => string };
import {
  getFeedbackProfile,
  playBellSound,
  playCardFlipSound,
  playDefeatSound,
  playVictorySound,
  triggerGameFeedback,
} from '../gameFeedback';

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success' },
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
}));

describe('getFeedbackProfile', () => {
  it.each([
    ['flip', { haptic: 'light' }],
    ['correct', { haptic: 'success' }],
    ['wrong', { haptic: 'soft' }],
    ['press', { haptic: 'light' }],
    ['collect', { haptic: 'none' }],
  ] as const)('selects the %s profile', (event, expected) => {
    expect(getFeedbackProfile(event)).toEqual(expected);
  });
});

describe('game sound cues', () => {
  it('ships a short, audible mono PCM WAV for a single card action', () => {
    const wav = readFileSync(resolve(__dirname, '../../../assets/audio/card-flip.wav'));

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    const format = findWavChunk(wav, 'fmt ');
    const data = findWavChunk(wav, 'data');
    expect(format.readUInt16LE(0)).toBe(1); // Linear PCM
    expect(format.readUInt16LE(2)).toBe(1); // Mono
    expect(format.readUInt32LE(4)).toBe(22050);
    expect(format.readUInt16LE(14)).toBe(16);

    const durationSeconds = data.length / (22050 * 2);
    expect(durationSeconds).toBeGreaterThanOrEqual(0.2);
    expect(durationSeconds).toBeLessThanOrEqual(0.8);
    const peak = Math.max(...Array.from({ length: Math.floor(data.length / 2) }, (_, index) =>
      Math.abs(data.readInt16LE(index * 2)),
    ));
    expect(peak).toBeGreaterThan(500);
  });

  it('plays the same full-volume bell cue without shortening it', async () => {
    jest.useFakeTimers();
    const audio = makeAudioPlayer();
    await playBellSound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.volume).toBe(1);
    jest.advanceTimersByTime(300);
    expect(audio.pause).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('plays a card flip cue from the start', async () => {
    const audio = makeAudioPlayer();
    await playCardFlipSound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('plays a victory cue from the start', async () => {
    const audio = makeAudioPlayer();
    await playVictorySound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('plays a defeat cue from the start', async () => {
    const audio = makeAudioPlayer();
    await playDefeatSound(audio);
    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('starts playback synchronously without waiting for the seek promise', async () => {
    const audio = makeAudioPlayer();
    let finishSeek!: () => void;
    audio.seekTo.mockImplementation(() => new Promise<void>(resolve => { finishSeek = resolve; }));

    const cue = playCardFlipSound(audio);

    expect(audio.play).toHaveBeenCalledTimes(1);
    finishSeek();
    await cue;
  });

  it('still requests playback while the player is loading', async () => {
    const audio = makeAudioPlayer();
    audio.isLoaded = false;

    await playVictorySound(audio);

    expect(audio.seekTo).toHaveBeenCalledWith(0);
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('replays the same bell cue on rapid rings', async () => {
    const audio = makeAudioPlayer();
    audio.seekTo.mockImplementation(() => new Promise<void>(() => undefined));

    playBellSound(audio);
    playBellSound(audio);

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.volume).toBe(1);
  });
});

function findWavChunk(wav: WavBuffer, chunkName: string): WavBuffer {
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const name = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (name === chunkName) return wav.subarray(offset + 8, offset + 8 + size) as WavBuffer;
    offset += 8 + size + (size % 2);
  }
  throw new Error(`Missing WAV ${chunkName} chunk`);
}

describe('triggerGameFeedback', () => {
  it('uses a light local haptic for a bell press and outcome-specific local haptics', () => {
    triggerGameFeedback('press');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

    triggerGameFeedback('correct');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);

    triggerGameFeedback('wrong');
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Soft);
  });
});

function makeAudioPlayer() {
  return {
    isLoaded: true,
    volume: 1,
    seekTo: jest.fn(async (_seconds: number): Promise<void> => {}),
    play: jest.fn(),
    pause: jest.fn(),
  };
}
