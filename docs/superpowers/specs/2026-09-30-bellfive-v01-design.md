# BellFive v0.1 Design

## Goal

Build a locally playable, repeatable two-player reaction card game that can validate BellFive's core turn, fruit-count, wild-bell, penalty, and collection loop.

## Scope

The first version has one game screen and one complete local match. It includes Start/Restart, a fixed 60-card deck, shuffle and 30/30 deal, alternating flips, the always-available in-game bell action, correct and incorrect ring outcomes, win detection, basic animation, haptics, short audio feedback, and a debug panel.

It does not include accounts, online play, Supabase, friends, rankings, a shop, skins, daily tasks, ads, in-app purchases, or complex navigation.

## Architecture

- Use React Native, Expo, TypeScript, Expo Router, Zustand, React Native Reanimated, Expo Haptics, and Expo Audio.
- Keep rules and transitions in pure functions under `src/game/`. The Zustand store adapts those functions to screen actions; it does not implement game rules.
- Keep the first route at `app/index.tsx`. Use focused components for cards, the bell, player decks, and the debug panel.
- Keep one source-controlled, literal manifest of card definitions `C001` through `C060`. Shuffle changes only card order; it never generates card contents.
- Test rules independently of React Native UI. Use an injectable random source for deterministic shuffle tests.

## Card Definitions

Each card has one to five symbols selected from banana, grape, pear, strawberry, peach, and bell. Fruit symbols can repeat or mix; bell can repeat and is a Wild Bell. Each card has at most five distinct fruit types. The fixed list is a manually curated, balanced starting mix; its exact contents are kept in `src/game/cards.ts` and validated for unique IDs and legal symbol counts. Card composition is a playtesting parameter, not a per-game generation rule.

## Game State and Turn Flow

- A new game shuffles the 60 fixed definitions and deals the first 30 cards to Player A and the remaining 30 to Player B. Player A starts.
- A draw pile is represented top-first. A played pile is also represented top-first. At the start of a match, both played piles are empty.
- Only the active player can flip. A flip moves that player's top draw card to the top of their played pile, then advances the turn to the other player.
- If a player reaches their turn with no card in their draw pile, the other player wins. A player with an empty draw pile is not declared the loser before they need to continue.
- While a game is active, the bell control remains enabled even when a ring cannot succeed, so a wrong ring remains possible. A correct or wrong ring does not independently change the already-established turn.
- Restart creates a fresh game from all 60 definitions, shuffles again, deals 30 cards each, clears played piles and feedback, and starts with Player A.

## Visible Counts and Ring Rules

Only the top card of each non-empty played pile contributes to the visible counts. Older cards underneath are ignored for ring detection. Count each fruit independently across those two cards and count all visible bells as `wildBellCount`.

For each fruit, a ring succeeds when its raw count is at most five and its raw count plus `wildBellCount` is at least five. A fruit count above five cannot be reduced by Wild Bells. If no fruit meets both conditions, a ring is wrong.

On a correct ring, the caller receives every card in both played piles at the bottom of their draw pile. Append Player A's pile first, then Player B's pile, preserving top-first order within each pile; both played piles are cleared. On a wrong ring, move up to two cards from the caller's draw-pile top to the opponent's draw-pile bottom. If only one card is available, transfer one; if none are available, transfer none. Neither outcome creates negative pile sizes.

## Feedback and Screen

The single screen shows Player B and their remaining count at the top, Player B's visible card above center, turn and status around a large bell control, Player A's visible card below center, and Player A with their remaining count at the bottom. A shared FLIP action is also available; deck taps follow the same active-player guard.

Use Reanimated for card reveal, bell press scale, positive/negative ring feedback, and played-card collection. Use distinct short Haptics for correct and wrong rings and light feedback for flips. Use Expo Audio for a short local bell cue. The debug panel shows turn, both draw and played pile sizes, visible fruit and wild counts, and `canRing`.

## Game Engine Surface

The engine exposes pure functions for `shuffleDeck`, `createGame`, `flipCard`, `countVisibleItems`, `canRing`, `ringBell`, `transferPenaltyCards`, `collectPlayedCards`, `checkWinner`, and `restartGame`. Transitions return a new state rather than mutating the input.

## Verification

Automated engine checks cover the fixed 60-card manifest, one-time dealing into 30/30 piles, turn alternation, empty-pile loss, visible-top-only counting, Wild Bell examples and the over-five exclusion, correct collection of all played cards to the draw-pile bottom, wrong-ring transfer capped at two cards, no negative pile sizes, and restart from all 60 fixed definitions. The app is also checked by completing a local match through the screen and restarting it.

## Delivery Sequence

1. Establish the Expo and TypeScript project structure.
2. Add the fixed card definitions and data model.
3. Implement and verify the pure game engine.
4. Add the simplest complete playable screen and debug panel.
5. Add bell interaction and ring feedback.
6. Add win and restart behavior.
7. Add basic animation, haptics, and audio.
8. Review edge cases, tidy boundaries, and verify the full loop.
