# BellFive Visual Style Unification Implementation Plan

> **For agentic workers:** Execute inline in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the home and waiting-room appearance with the live match screen.

**Architecture:** Add a typed shared palette containing the exact colors already used by the match screen. Reference those tokens from the match, home, waiting-room, avatar-picker, and language-settings StyleSheets; preserve layout and semantic status colors.

**Tech Stack:** React Native StyleSheet, TypeScript, Expo.

## Global Constraints

- Keep layout, spacing, typography, interactions, and game behavior unchanged.
- Keep semantic error, connection, approval, rejection, and ready-state colors distinct.
- Use the current match screen's palette as the source of truth.

---

### Task 1: Add the shared match palette

**Files:**
- Create: `src/theme/gameColors.ts`
- Modify: `src/components/GameScreen.tsx`

**Interfaces:**
- Produces: `gameColors`, a readonly palette object for shared canvas, surface, plum, lavender, purple, lime, and text colors.

- [x] Add `gameColors` with values copied from the existing match screen styles.
- [x] Replace matching literal colors in `GameScreen` with token references while retaining all existing values and semantic status colors.

### Task 2: Apply the palette to pre-game screens

**Files:**
- Modify: `src/components/RoomEntry.tsx`
- Modify: `src/components/WaitingRoom.tsx`
- Modify: `src/components/AvatarPicker.tsx`
- Modify: `src/components/LanguageSettings.tsx`

**Interfaces:**
- Consumes: `gameColors` from `src/theme/gameColors.ts`.

- [x] Import the shared palette in these components.
- [x] Restyle backgrounds, headings, supporting text, panels, inputs, actions, avatar selection, and language settings to use the purple/lavender/lime identity.
- [x] Preserve geometry, layout, interaction states, and semantic status colors.

### Task 3: Verify the visual-only refactor

**Files:**
- Review: `src/theme/gameColors.ts`
- Review: `src/components/GameScreen.tsx`
- Review: `src/components/RoomEntry.tsx`
- Review: `src/components/WaitingRoom.tsx`

- [x] Run `npm run typecheck` and confirm exit code 0.
- [x] Run `git diff --check` and confirm there are no whitespace errors.
- [x] Review the final diff to ensure no layout or behavior changes were introduced.
