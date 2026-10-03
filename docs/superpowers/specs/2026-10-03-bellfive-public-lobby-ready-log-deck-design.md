# BellFive Public Lobby, Readiness, Activity Log, and Deck Design

## Goal

Extend the local BellFive prototype so players can discover and request access to waiting rooms, both players explicitly prepare before every match, ring outcomes appear in a shared contextual activity log, and the fixed deck guarantees that no two face-up cards contain more than one Wild Bell while including a five-of-a-kind fruit card.

## Current project context

- The Node.js room service is authoritative for seats, game state, turns, ring outcomes, and the five-minute timer.
- The mobile app communicates with that service over a WebSocket connection.
- Rooms and matches are held in memory and are scoped to one running test server.
- `room.create` currently gives the creator seat A; `room.join` directly assigns seat B.
- A match currently starts as soon as both seats are connected.
- The fixed deck contains card definitions `C001` through `C060`; multiple definitions contain a Wild Bell.
- Flip audio already plays on both devices when the server publishes a new flip version. Keep that behavior.
- Correct/wrong ring sounds and transfer-card animation already exist and will remain.

## Considered approaches

### WebSocket lobby and server-pushed updates — selected

Use the existing room service and WebSocket protocol for public room listings, join applications, approval decisions, readiness, and match snapshots. This keeps authoritative room state in one place and updates both phones immediately without adding a service or polling loop.

### HTTP room listing with WebSocket applications

An HTTP endpoint could return waiting rooms while WebSocket handles application and approval. This separates listing from actions but duplicates transport state and requires refresh/polling behavior, so it is not selected.

### Keep code-only joining

This avoids lobby work but does not meet the requested room discovery and approval flow.

## Room discovery and admission

- A player entering the game lobby receives a live list from the same BellFive server.
- List only rooms whose phase is `waiting`, whose creator is connected, and which still have a seat available. Each list row shows the room code and creator nickname/avatar.
- A player may apply from a room row or enter a room code to target the same application flow. Neither path directly takes a seat.
- The room creator sees pending applicants in the waiting room with their nickname/avatar and Approve and Reject controls.
- An approval atomically assigns the open seat and sends the applicant a room session. A rejection returns the applicant to the lobby with a clear status.
- If multiple applicants target one room, approvals are serialized by the server: the first successful approval takes the seat; later applicants are told that the room is full.
- An applicant may cancel. Disconnecting also withdraws that applicant's pending requests. Leaving or expiring a room removes it from the list.
- Once both players are assigned, the room is no longer advertised as open. The lobby lists rooms only on the connected test-server instance; there are no accounts or global matchmaking service.

## Readiness and match lifecycle

- Both players see the connected player profiles and their own Ready control in the waiting room.
- A player can toggle between Ready and Not Ready while the other player has not yet readied.
- The server starts the match only when both seats are connected and ready. It creates and shuffles the fixed deck, deals 30 cards to each player, and starts the five-minute clock at that point.
- Until both are ready, game actions are unavailable and the match clock has not started.
- Readiness is required for the first match and each rematch. After game over, each player readies again; the next game starts automatically once both are ready.
- If a player disconnects before a match starts, that player's ready flag resets. On reconnect, both players must be connected and each must confirm readiness again.
- During an active match, existing pause/reconnect behavior remains unchanged.

## Ring activity log and audio

- Keep the same server-authored `RingFeedbackEvent` as the source for both the transfer animation and activity log.
- Include the most recent 12 ring events in room snapshots. This lets both players see the same recent match history, including after reconnect. Clear the history when a rematch starts.
- Show a scrollable, retained log in the game screen; keep the latest entries available and allow older retained entries to be read. Do not write ordinary flips to this log.
- Render caller-specific copy on each phone. Seat A is “1号玩家”; seat B is “2号玩家”. For example:
  - Caller, correct: “拍铃正确，获得 6 张牌”. Opponent: “1号玩家拍铃正确，获得 6 张牌”.
  - Caller, wrong: “拍铃错误，交出 1 张牌”. Opponent: “1号玩家拍铃错误，你获得 1 张牌”.
  - If a wrong ring has no available penalty card, show that no card was transferred instead of implying a negative count.
- Keep the existing full-volume bell cue identical on both devices, the flip cue on each accepted flip, and local victory/defeat cues at match completion. Do not add a separate sound asset for this work.
- Keep the existing transfer fly animation and per-player `+N`/`−N` indicators.

## Fixed deck constraints

- Retain exactly 60 immutable card definitions with IDs `C001`–`C060`, then shuffle and deal 30/30 each match.
- Keep each card at one through five symbols and retain the existing ring formula.
- Put exactly one Wild Bell symbol in the entire fixed deck. This is the simple invariant that guarantees any two currently visible cards, regardless of shuffle, captures, penalties, or player pile offsets, can show at most one bell at a time.
- Include at least one card with five copies of the same fruit.
- Rebalance the remaining fixed fruit layouts without randomly generating card contents.
- Exhaustively evaluate all 1,770 distinct two-card pairs. At least 177 pairs (10%) must satisfy the unchanged `canRing` formula.

## Architecture and data flow

- Extend `src/network/protocol.ts` with typed lobby-list, application, approval/rejection, readiness, and room-snapshot data, and validate every inbound server message.
- Keep room ownership, pending applications, ready flags, and the latest 12 ring events in `server/src/roomManager.ts`.
- Route room-list changes and application decisions through the existing WebSocket server. A requester remains in the lobby until an approval assigns a seat.
- Extend `src/network/GameClient.ts` and `src/store/gameStore.ts` to expose lobby state, application state, host notifications, and ready actions to the UI.
- Extend `RoomEntry` for public room browsing and applications; extend `WaitingRoom` for applicant decisions and readiness; add a focused activity-log component for game feedback.
- Update the fixed card definitions and their tests in `src/game/cards.ts` and `src/game/__tests__/cards.test.ts`.
- Keep rules and game adjudication in the existing pure game engine. The server remains authoritative for approvals, ready-to-start transition, and ring event history.

## Error handling and lifecycle cases

- Reject applications for missing, full, non-waiting, or expired rooms with a clear client-visible error.
- Recheck room availability when the creator approves, not only when the applicant submits the request.
- If two approvals race for the last seat, only one may succeed; all other applicants return to the lobby.
- Clear pending requests when the applicant disconnects or cancels, when the room is deleted, or when the room stops accepting players.
- Prevent flips and rings before the server transitions the room to `playing`.
- Bounded ring history remains valid protocol data and is reset for a new match; reconnecting restores recent log entries without replaying old audio.

## Acceptance criteria

1. A second phone can see an open room without already knowing its code, apply, and wait for creator approval.
2. Entering a room code follows the same approval path; it never bypasses the creator decision.
3. Approving one applicant seats that player on the room and immediately removes the room from the open-room list; rejection leaves the applicant in the lobby.
4. A game does not deal cards or start its timer until both connected players are ready.
5. A rematch follows the same two-player readiness gate.
6. Every accepted flip continues to play the flip cue on both devices.
7. Both players see the latest 12 ring/card-transfer events, phrased appropriately for caller and opponent; the log resets on rematch.
8. The fixed deck has 60 IDs in order, exactly one Bell symbol total, and at least one five-identical-fruit card.
9. The unmodified ring rule recognizes at least 177 of the 1,770 distinct card pairs.
10. Existing five-minute timeout, ring cooldown, disconnection pause, and winner behavior remain intact.

## Test strategy

- Protocol tests cover lobby messages, application payloads, ready state, bounded ring history, and invalid server/client messages.
- Room-manager unit tests cover visible-room filtering, application and approval, rejection, cancellation/disconnect cleanup, approval races, ready gating, rematch readiness, and ring history reset/reconnect snapshots.
- GameClient and store tests cover lobby lifecycle, approval-to-session transition, and readiness state.
- UI tests cover open-room list actions, host approval/rejection controls, both-ready waiting feedback, contextual log text, history rendering, and reset behavior.
- Deck tests verify all static constraints and exhaustively count valid pairs against the 10% minimum.
- Run frontend/server type checks and the complete Jest suite after implementation.

## Out of scope

- User accounts, access control by identity, persistent room storage, online matchmaking, friends, rankings, chat, monetization, and production hosting.
- Changing the ring formula or five-minute timeout rule.
- Generating card contents randomly; only shuffle the fixed definitions.

## Spec self-review

- The room-code path is explicitly covered by the host-approval rule.
- The card-pair bell invariant is guaranteed by exactly one Bell symbol in the fixed deck, not by assumptions about deck order after capture or penalty transfers.
- Readiness applies consistently to first games and rematches, with the clock starting only when both connected players are ready.
- Activity history is bounded to the last 12 server-authored ring events and resets on rematch.
- The existing flip, bell, and match-result sound behavior is preserved; no new sound dependency is introduced.
