# BellFive Friend Rooms Design

## Goal

Let two people play one BellFive match on separate phones by creating a private room and inviting a friend with a room code. Each phone is bound to one player and can only flip that player's cards and ring for that player.

## Scope

This design adds private online rooms for the existing fixed-deck BellFive game. The room creator is Player A; the friend who joins is Player B. The game starts after both players join. The existing shared-table layout remains, while the action dock is local-player-only.

The feature includes room creation and joining, room-code sharing, server-authoritative game transitions, synchronized visible state, basic reconnect handling while the app remains open, correct and wrong ring outcomes, game-over state, and a host-controlled rematch.

It does not include accounts, public matchmaking, Supabase, friend lists, rankings, persistence, spectators, chat, monetization, or custom card sets. It does not store room state in a database. A server restart ends all active rooms.

This design supersedes the local hot-seat control model in `2026-09-30-bellfive-v01-design.md`. The fixed C001–C060 deck, game rules, table layout direction, animation, haptics, audio, and debug intent remain in force.

## User Flow

1. The app opens to a simple friend-room entry state with **Create Room** and **Join Room**.
2. The creator makes a room. The server assigns the creator Player A and returns a six-character uppercase room code and a private seat token.
3. The creator shares the room code using the native share sheet. The invitee enters the code and joins as Player B.
4. Once both seats are connected, the server shuffles the fixed 60-card manifest, deals 30 cards to each player, sets Player A's turn, and sends a match snapshot to both phones.
5. Each phone shows both players' visible cards and pile counts. Its FLIP action can only flip for its local player; the action is accepted only when that player owns the turn. Its Bell action always remains available during play and rings for the local player.
6. The server sends updated snapshots after accepted actions. Correct rings collect both complete played piles for the caller. Wrong rings transfer up to two cards from the caller's draw pile. The existing win rule ends the match when a player with no draw cards is next required to flip.
7. After game over, Player A can request a rematch. The server deals a fresh shuffled match from the same 60 definitions and keeps the room code and player seats.

## Approaches Considered

### Authoritative Node and TypeScript WebSocket server — recommended

The server owns each room's full `GameState` and calls the existing pure engine transitions. This gives one ordering point for flips and near-simultaneous rings, keeps hidden draw order off the phones, and requires no persistent data service. During testing, run the server on the development computer and expose it through a temporary public tunnel; later, the same service can move to a stable staging address.

### Managed realtime data service

A managed service can reduce server deployment work, but game actions still need trusted server-side validation and ordering. This adds provider-specific configuration and rules to the first playable multiplayer version.

### Peer-to-peer phone connections

Direct connections could reduce server responsibilities, but internet NAT traversal, signaling, reconnection, and ring ordering add complexity before the core online loop has been validated.

The project will use the first approach. No provider-specific hosting choice is part of this feature design.

## Architecture

- Keep the pure rules and transitions in `src/game/`; the authoritative server imports and uses them.
- Add a small Node.js + TypeScript WebSocket service under `server/`. It owns an in-memory room map, room-code generation, player-seat tokens, connections, action validation, and snapshots.
- Add shared message and snapshot types under `src/network/` so the mobile client and server use one protocol definition.
- Replace the local-only Zustand action adapter with a client store that tracks connection state, room state, the local player ID, and the latest redacted snapshot. UI components do not implement game rules.
- Use React Native's WebSocket client. The game service URL is configured per environment and is not embedded as a user-specific secret.
- Keep `app/index.tsx` as the single route. The route switches between room entry, waiting room, match, and finished states; no complex navigation is added.

## Room and Session Rules

- Room codes contain six uppercase characters, excluding visually ambiguous characters such as `I`, `O`, `0`, and `1`.
- A room has exactly two seats. The room creator owns Player A; the first valid joiner owns Player B. Further joins are rejected after both seats are occupied or the match has started.
- A random seat token is issued at room creation/join. It binds a connection to one seat and is required to reconnect during the current app session. It is a temporary session credential, not an account.
- Room state is memory-only. A room with no recent activity expires after 30 minutes. A waiting room expires 15 minutes after creation if no second player joins. The server removes expired rooms.
- If a socket drops while the server is running, the seat remains reserved. The client shows a reconnecting state and retries with its seat token. The room enters a connection-paused phase: the server rejects game actions and the UI suspends the action controls until both seats reconnect. Relaunching the app or restarting the server does not guarantee recovery.
- Player A may request a rematch only after the current game is finished. The server rejects rematch requests from Player B and rejects requests during an active game.

## Protocol and Authority

The client sends only intents: create room, join room, flip, ring, and rematch. Each gameplay or rematch action has a unique action ID, and the server deduplicates retries from the same seat so a reconnect cannot apply one penalty twice. The server derives the acting player from the validated seat token; the client cannot choose the player identity in an action message.

For each room, the server processes messages sequentially:

- A flip is accepted only when the sender owns the current turn. It calls `flipCard` and checks for a winner.
- A ring is allowed at any time during play. The server calls `ringBell` with the sender's seat as the caller.
- A correct ring clears both played piles and appends every collected card to the caller's draw-pile bottom.
- A wrong ring transfers at most two cards from the caller's draw-pile top to the opponent's draw-pile bottom.
- A rematch creates a new shuffled game from `CARD_DEFINITIONS`; it does not reuse or extend the previous decks.

Each visible-table state has a monotonically increasing `tableVersion`. A ring request includes the version shown on that phone. A version mismatch means the visible cards changed before the server processed the request, so the request is ignored as stale without a penalty. A wrong ring does not change the visible cards and therefore does not invalidate the other player's ring against the same table. This prevents a delayed duplicate ring after a correct collection from becoming an unintended wrong-ring penalty.

## Snapshot and Hidden Cards

The server retains the complete game state. It never sends either draw pile's card definitions or order to a client. A snapshot includes:

- room phase, room code, local player ID, connected state for both seats, turn, winner, and last ring outcome;
- each player's draw-pile count and played-pile count;
- only the current top card of each played pile;
- visible fruit counts, wild bell count, `canRing`, and `tableVersion`.

Older cards below each played pile's top remain hidden from counts and from the visual table, but the server keeps them so a correct ring can award the full played piles.

The same sanitized snapshot is sent to both players except for the recipient-specific local player ID and connection details. Debug UI uses snapshot counts instead of accessing remote deck contents.

## Failure Handling

- Unknown or expired room code: show a join error and allow retry.
- Full room: reject the join without displacing either seat.
- Invalid seat token: reject the command and close the unauthorized connection.
- Flip from the wrong seat, flip out of turn, or rematch at the wrong phase: reject the command and send the current snapshot.
- Stale ring: ignore it and send the current snapshot without applying a penalty.
- Temporary network loss: show a reconnecting indicator, suspend game actions, and retain the seat while the server process lives. Bell remains available for wrong-ring attempts during connected active play; it is suspended only during the connection-paused phase or after game over.
- Server restart: active memory-only rooms are lost; both clients return to room entry with a clear connection error.

## Interface Changes

- Keep the approved shared playmat composition and display both players' remaining counts and currently visible cards.
- Replace the local hot-seat player controls with one FLIP action and one Bell action bound to `localPlayerId` on that device.
- Disable FLIP unless the local player owns the turn; keep Bell enabled throughout connected active play so wrong rings remain possible. Suspend both controls while the room is connection-paused or the match is finished.
- Add room entry and waiting states before the game screen. Show the room code and a share action while waiting for Player B.
- Preserve the compact debug panel and add connection state, room code, and local player identity.
- Keep the existing Reanimated, Haptics, and Audio feedback. Play feedback only for the local player's action; reflect the opponent's result through the synchronized status and card transitions.

## Verification

The implementation will test server room lifecycle, unique room codes, one-time seat assignment, fixed 30/30 dealing, redacted snapshots, turn enforcement, local-player ring attribution, correct collection, wrong-ring penalties, stale simultaneous rings, rematch behavior, disconnect pause/reconnect, expiration, and rejection of actions after game over.

Manual remote verification uses two phones on separate internet connections and the same test build. Both connect to the development WebSocket endpoint exposed by a temporary public tunnel. The test walks through create/share/join, alternating flips, a correct ring, a wrong ring, game over, rematch, and reconnect after a brief network interruption. A server restart is also checked to confirm the expected loss of in-memory rooms.

## Delivery Sequence

1. Define the client/server protocol and redacted snapshot.
2. Add the TypeScript WebSocket service and in-memory room lifecycle around the existing game engine.
3. Add create/join/waiting states and bind each client to one player seat.
4. Synchronize authoritative flips, rings, outcomes, and rematches.
5. Add reconnect state, room expiry, and explicit network error states.
6. Adapt the game screen controls and debug panel to local-player snapshots while retaining the approved layout.
7. Verify engine/server boundaries and exercise one complete remote two-phone match through a temporary public tunnel.
