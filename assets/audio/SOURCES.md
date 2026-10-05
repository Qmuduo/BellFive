# Audio asset sources

## `background-music.wav` — Pocket Rally

- Original instrumental composition and procedural synthesis created for BellFive. No sampled recordings, external melodies or third-party music assets are used.
- Generator: `node scripts/generate-background-music.mjs` (deterministic, no additional dependencies).
- 100 BPM, 16 bars, 38.4 seconds, C-major/A-minor palette. Soft plucked melody, warm chord bed, bass and restrained brushed percussion leave space for game cues.
- Mono, 22,050 Hz, signed 16-bit PCM WAV. Peak amplitude 0.58; music playback volume is 0.15. Note tails wrap across the loop boundary to avoid an abrupt cut.
- Intended use: quiet looping background music during active matches, with a separate persistent music toggle. Existing flip, bell, victory and defeat sounds remain independent.

## `card-flip.wav`

- Source: [Placing playing card by OxidVideos](https://pixabay.com/sound-effects/film-special-effects-placing-playing-card-522514/)
- Source download: [`playing-card-source.mp3`](https://cdn.pixabay.com/download/audio/2026/04/20/audio_d8810cf5ca.mp3?filename=oxidvideos-placing-playing-card-522514.mp3). The original MP3 is not included in the repository; only the processed WAV used by the game is bundled.
- License: [Pixabay Content License](https://pixabay.com/service/license-summary/). The asset page identifies it as free for use under this license.
- Processing: converted the short 0.336-second card-placement recording to mono, 22,050 Hz, signed 16-bit PCM WAV for Expo Audio. No synthetic tones or music were added.
- Intended use: one short card handling/place cue per flip.
