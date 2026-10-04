# Task 1 report: match layout

Implemented the approved dual-thumb arcade match layout while keeping lobby, waiting-room, server actions, short sound effects, and connection/error state behavior intact.

Changed files:
- `src/components/GameScreen.tsx`: local-player-relative card order, compact header, fixed console and equal flip/ring controls, ring lock from local snapshot state, collapsible activity/debug details, and short-screen sizing.
- `src/components/GameCard.tsx`: labeled interactive card piles with real nickname, localized You/Opponent label, top-card symbols, draw/played counts, and accessible disabled/flip state.
- `src/components/BellButton.tsx`: full-width rectangular bell control with disabled and cooldown presentation.
- `src/components/CardTransferFly.tsx`: local-relative flight and score badge placement while retaining server player IDs in event/test identities.
- `src/i18n/translations.ts`: English and Simplified Chinese match labels.
- `src/components/__tests__/GameScreen.test.tsx`, `CardTransferFly.test.tsx`: regressions for local B order, turn-bound flips, ring availability on opponent turns, wrong-ring lock until snapshot clears it, disconnected controls, and expandable details.

Verification:
- `npm run typecheck` — passed.
- `npm test -- --runInBand src/components/__tests__/GameScreen.test.tsx src/components/__tests__/GameCard.test.tsx src/components/__tests__/CardTransferFly.test.tsx src/i18n/__tests__/translations.test.ts` — 4 suites, 45 tests passed.

Limitations: no device screenshot/runtime visual QA was run in this task. The layout uses the 116px control target at normal screen heights and falls back to 88px on windows below 700px; native safe-area behavior remains delegated to the existing SafeAreaView.
