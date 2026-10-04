# Dual-thumb Arcade and Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute without further user approval; the user approved the preview and specifically requested GPT-6 Luna implementation.

**Goal:** Ship the approved BellFive dual-thumb arcade screen with a quiet, original looping soundtrack, preserving a reliable pre-change checkpoint.

**Architecture:** Keep the authoritative room snapshot and current game actions intact. Separate the responsive match presentation from audio playback lifecycle, reusing Expo Audio and persisted settings.

**Tech Stack:** React Native / Expo 57 / TypeScript / Zustand / Jest.

## Global Constraints

- Implementers use `gpt-6-luna`, as explicitly requested.
- Approved visual reference: `C:/Users/MUDUO/.codex/visualizations/2026/10/04/01a1051b-aaef-7942-afd6-fb829ce76ec1/bellfive-dual-thumb.html`.
- Local player is always the left visible card, opponent right, regardless of server seat A/B. Actions always flip left, ring right, equally sized and aligned, with a 14px gap and a target height of 116px (compact minimum 88px).
- Arcade colors: lavender #F5F0FF, ink #2F194C, violet #7040C4, personal console #34214F, flip #9165D2, bell #E3FB88. Fruit symbols only on playing cards in the active match; personal identity uses nickname initial rather than fruit avatar.
- Preserve actual profiles, all card symbols, room/turn/remaining timer, connection and error behavior, ready/rematch/leave, ring history, SFX, feedback, and both supported languages. Do not introduce simulated data into production.
- Keep gameplay rules and server/protocol unchanged. Bell availability uses connected playing state and the local `ringBlockedUntilFlip` flag, never the rule-answer `canRing` field. Opponent turns do not disable ringing.
- Primary controls remain outside scrolling content and respect bottom safe area. At 320px width and short phones, keep controls reachable, cards readable, secondary logs collapsible.
- Music is original, instrumental, light arcade/lo-fi, approximately 100 BPM, 8 or 16 bars, seamless loop, volume 0.15. No network audio, no external copyrighted assets, no music-generation dependency. Keep source generator and attribution.
- Music defaults enabled but starts on an explicit player gesture to support web autoplay restrictions. Persist user toggle independently of language. Pause when backgrounded, disconnected, leaving, or game finished; release on unmount. Never overwrite SFX volume or mode.
- Baseline checkpoint: git tag `before-dual-thumb-2026-10-04`, commit `d832b5c4b55bc080abd5cd3ba175ac1fabc3a735`.

### Task 1: Match layout

**Files:** `src/components/GameScreen.tsx`, `GameCard.tsx`, `BellButton.tsx`, `CardTransferFly.tsx` as needed, new focused match components/style module if useful, `src/i18n/translations.ts`, their tests.

- [ ] Read current GameScreen, CardTransferFly and existing screen tests. Read the approved reference (not older design drafts).
- [ ] Add meaningful regression coverage: local B rendered left; flip own-turn only; ring still available on opponent turn; wrong-ring lock respected until snapshot clears it; disconnected actions disabled.
- [ ] Reshape active match: compact header with brand/timer/utility controls; paired labeled card piles; secondary result/activity area; fixed dark personal console with nickname initial/name, own draw count, plain turn prompt; two large equal buttons in the bottom row. Existing lobby/waiting flow remains usable.
- [ ] Make the two card headers explicitly say You/Opponent plus real nickname. Keep ownership visually stable across turns; mark turn in separate prompt. Preserve all emoji symbols and accommodate five per card.
- [ ] Correct collection animation destination for local-relative order, retaining actual server player IDs.
- [ ] Put logs/debug behind expandable secondary UI so they do not crowd controls. Preserve data for troubleshooting. Handle long nicknames, English text and 320px width without clipping. Retain meaningful accessible labels and disabled state.
- [ ] Run focused component tests and TypeScript. Commit only intended UI files. Write a report with verification and limitations.

### Task 2: Background music and integration

**Files:** new `src/hooks/useBackgroundMusic.ts`, new `src/components/MusicToggle.tsx`, `src/store/settingsStore.ts`, relevant tests, `scripts/generate-background-music.mjs`, `assets/audio/background-music.wav`, `assets/audio/SOURCES.md`, `src/components/GameScreen.tsx` integration, translations as needed.

- [ ] Add lifecycle and persistence regression tests before implementation: disabled choice survives reload, existing language storage migrates, background/disconnect/finish pause music, first gesture starts only music when allowed, toggling off does not stop short SFX.
- [ ] Generate an original deterministic musical loop with mellow pluck melody, soft bass/chords and restrained percussion. Avoid sharp high tones masking the bell; export PCM WAV, peak-normalize conservatively and make loop boundary continuous. Document composition and generator usage in SOURCES.md.
- [ ] Implement `useBackgroundMusic(active: boolean)` returning `{enabled, toggle, startFromGesture}`; own a separate Expo Audio player with loop true and volume 0.15. Account for loading, async playback failure, AppState and web visibility without leaking listeners. Keep `useAudioPlayer` hook stable across renders and let it release on unmount.
- [ ] Implement a small bilingual accessible `MusicToggle` utility control and connect it in the game header. Call `startFromGesture()` from actual valid local flip/ring interactions; turning music on is itself an explicit gesture. Do not auto-start before a gesture.
- [ ] Integrate finished/connection-paused/leave behavior and existing audio mocks without weakening SFX tests. Run music/settings/screen tests and TypeScript, then commit and report.

### Task 3: Review, verify, and deliver

- [ ] Independent review checks implementation against preview, thumb targets, local-seat mapping, paused/finished guards, music lifecycle and rollback coverage. Address findings with Luna implementer.
- [ ] Run complete Jest suite, client/server TypeScript and Expo web export. Inspect actual rendered match at phone widths via development-only runtime state injection (never committed fixture routes).
- [ ] Verify generated WAV properties, no clipping and reasonable duration/size. Inspect/hear audio where available.
- [ ] Save a release commit on `codex/dual-thumb-music`, then fast-forward the clean original main checkout after checks so normal launch uses the new game. Do not push.
- [ ] Add concise rollback instructions. Use a future `git revert` of feature commit(s) to preserve history, or `git switch --detach before-dual-thumb-2026-10-04` to inspect the exact old version with a clean working tree. Never reset or discard unrelated changes.
