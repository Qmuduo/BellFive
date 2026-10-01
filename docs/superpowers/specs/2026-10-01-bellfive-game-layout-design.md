# BellFive Game Screen Layout Design

## Goal

Reshape the single-player-device game screen around a shared tabletop so the two visible cards read as one round and the main actions are easy to reach.

## Layout

- Keep a compact BellFive header with the existing Start Game / Restart Game action.
- Put Player A and Player B in one horizontal status row above the table. Each side shows its remaining draw count and highlights the player whose turn is active. Tapping the active player's status/deck continues to flip one card.
- Put both current cards side by side inside one broad, pale-blue play mat. Each card keeps its player label and face symbols. Use a colored outline to make the active side easy to identify.
- Show the turn prompt immediately above the mat. Keep the latest ring result visible near the controls.
- Anchor a bottom action dock with a wide FLIP button and a round gold bell. Keep the bell divided into Player B's upper hit zone and Player A's lower hit zone; both remain tappable during active play.
- Keep the debug panel and every existing debug value, compactly grouped beneath the table in the scrollable content.
- Keep game-over copy and Restart Game reachable without changing winner logic.

## Visual Direction

Use a quiet porcelain background, an ice-blue tabletop, white cards, a brass-gold bell, and separate coral/blue player accents. Fruit emoji remain the card artwork. The active card outline is the main table highlight. Do not copy the reference image's unrelated medical labels, avatar art, timer, or browser controls.

## Behavior and Boundaries

- Keep all game rules and Zustand transitions unchanged.
- Preserve the existing card/deck press guards, both caller-specific ring actions, accessibility labels, haptics, audio, card reveal motion, and collection feedback.
- Adjust collection motion only as needed for the new horizontal player layout so collected cards fly toward the caller's status/deck area.
- The play mat must remain readable on narrow phone widths; card symbols may wrap within each card.
- No navigation, network, account, or commerce features are part of this change.

## Verification

- Add a focused screen regression check that both current-card labels are contained in one horizontal play mat.
- Run the existing screen/game test suite and TypeScript check after the layout change.
- Inspect the refreshed screen on the connected Android phone for card fit, readable player counts, accessible bottom controls, and game-over layout.
