# BellFive Visual Style Unification

## Goal

Make the home screen and waiting room feel like part of the same game as the live match screen.

## Design

Use the current match screen as the visual source of truth: lavender canvas (`#F5F0FF`), deep plum (`#34214F` / `#2F194C`), light lavender (`#E2D5FF`), saturated purple (`#7040C4` / `#9165D2`), and lime (`#E3FB88`). Put these colors in a small shared palette module and consume it from `GameScreen`, `RoomEntry`, `WaitingRoom`, `AvatarPicker`, and `LanguageSettings`.

Apply the palette to page backgrounds, headings, supporting text, panels, inputs, and primary/secondary actions. Use plum and lavender for the room-code and player panels, purple for primary actions, and lime for featured actions and ready state. Keep semantic colors for errors, connection/ready states, approvals, and rejections so those states remain easy to read.

Preserve page structure, spacing, typography, interaction behavior, and match-table/danmaku visuals.

## Scope

- Add a shared game color palette.
- Replace duplicated match-screen palette literals with shared tokens without changing their rendered values.
- Restyle the home, waiting room, avatar picker, and language settings with those tokens.
- Leave gameplay layout, game rules, and semantic status colors unchanged.

## Acceptance Criteria

- Home, waiting-room, and match screens share the same purple/lavender/lime identity.
- Existing layout and interaction states remain intact.
- The palette has one shared source used by all three screens.
- TypeScript typecheck and whitespace checks succeed.
