# BellFive Friend Rooms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with review checkpoints.

**Goal:** Let two players play BellFive on separate phones through a private room code, with one authoritative WebSocket server synchronizing a complete match.

**Architecture:** Keep game transitions pure in `src/game/` and run them only on a small Node.js + TypeScript WebSocket server. The mobile app sends room and gameplay intents, receives redacted snapshots, and binds its controls to the server-assigned local player. Rooms and seat tokens live in server memory; development testing exposes the local server through a temporary public tunnel.

**Tech Stack:** Expo, React Native, TypeScript, Expo Router, Zustand, React Native Reanimated, Expo Haptics, Expo Audio, Node.js, `ws`, `tsx`, Jest.

## Global Constraints

- Each room has exactly two players, each on their own phone.
- Room creator is Player A; the first joiner is Player B; the game starts after both seats connect.
- The server owns full `GameState`; clients never receive either draw pile's card order or definitions.
- Only the current turn owner may flip; either connected player may ring at any time during active play.
- A ring request for a stale visible-table version is ignored without penalty.
- Wrong rings transfer at most two cards; correct rings collect both complete played piles.
- Room state is in memory only; no accounts, public matchmaking, Supabase, database, or persistence.
- A temporary disconnect pauses game actions until both players reconnect to the same in-memory room.
- Player A may request a rematch only after game over.
- Keep the approved shared playmat layout; each phone's actions target only its local player.
- Do not alter the fixed C001–C060 card definitions or the agreed core rules.

---

## File Map

- `src/network/protocol.ts` — shared client/server message unions, room snapshots, and runtime message decoding.
- `src/network/__tests__/protocol.test.ts` — protocol decode and snapshot projection tests.
- `server/src/roomManager.ts` — pure-ish room lifecycle and authoritative match transitions; no socket-specific behavior.
- `server/src/__tests__/roomManager.test.ts` — deterministic room, action, expiry, and reconnect tests.
- `server/src/websocketServer.ts` — WebSocket adaptation, connection binding, fan-out snapshots, and transport errors.
- `server/src/__tests__/websocketServer.test.ts` — local socket protocol integration tests.
- `server/src/index.ts` — HTTP health endpoint and WebSocket process startup.
- `server/tsconfig.json` — Node TypeScript settings for the service and shared game code.
- `src/network/GameClient.ts` — reconnecting mobile WebSocket client with injectable WebSocket factory.
- `src/network/__tests__/GameClient.test.ts` — connect, send, retry, dedupe, and disconnect behavior.
- `src/store/gameStore.ts` — replace local hot-seat actions with room/network state and local-seat actions.
- `src/store/__tests__/gameStore.test.ts` — room store behavior with an injected fake network client.
- `src/components/RoomEntry.tsx` — create-room and join-by-code form.
- `src/components/WaitingRoom.tsx` — room code, native share action, and connected-seat status.
- `src/components/GameScreen.tsx` — render redacted room snapshot and local player's actions within the existing approved layout.
- `src/components/PlayerDeck.tsx` — remove cross-player action ownership; only local player's deck is actionable on its phone.
- `src/components/DebugPanel.tsx` — render snapshot counts and room/network diagnostics without deck contents.
- `src/components/__tests__/GameScreen.test.tsx` — lobby, waiting, role binding, and local action regression tests.
- `app/index.tsx` — continue exporting the single screen route.
- `package.json`, `package-lock.json` — add service scripts and server-only runtime/development packages.
- `server/README.md` — local service, Expo URL configuration, and tunnel-based remote test steps.

## Task 1: Define Shared Protocol and Redacted Snapshot

**Files:**
- Create: `src/network/protocol.ts`
- Create: `src/network/__tests__/protocol.test.ts`

**Interfaces:**
- `ClientMessage` is a discriminated union for `room.create`, `room.join`, `room.reconnect`, `game.flip`, `game.ring`, and `game.rematch`.
- Every gameplay or rematch message carries an `actionId`; `game.ring` also carries `tableVersion`.
- `RoomSnapshot` contains room phase/code, recipient-specific local player ID, seat connection states, turn/winner/outcome, both draw/played counts, only each played pile's top card, visible counts, `canRing`, `tableVersion`, and `ringVersion`.
- `ServerMessage` includes `room.session` (correlated `requestId`, room code, local player ID, seat token, and initial snapshot), recipient-specific `room.snapshot`, correlated `action.result`, and typed `error` messages. `action.result` carries `actionId`, accepted/rejected status, and ring outcome/moved-card count when applicable.
- `decodeClientMessage(raw: string): ClientMessage | null` rejects malformed JSON and invalid field types.
- `decodeServerMessage(raw: string): ServerMessage | null` validates messages before the mobile store applies them.
- `createRoomSnapshot(room, localPlayerId): RoomSnapshot` projects full authoritative state without exposing draw-pile definitions/order or covered played cards.

- [x] **Step 1: Write failing protocol tests** for each valid message variant, malformed JSON, missing IDs, invalid ring versions, and hidden-card redaction from a state with multiple played cards. Define the fixture as a `GameState` with A's played pile `[C009, C004]`, B's played pile `[C021]`, and separate draw piles containing distinct card IDs.

```ts
const roomWithCoveredCards: GameState = {
  status: 'playing',
  turn: 'A',
  winner: null,
  lastRingOutcome: null,
  players: {
    A: {
      drawPile: [{ id: 'C030', symbols: ['peach'] }],
      playedPile: [
        { id: 'C009', symbols: ['strawberry'] },
        { id: 'C004', symbols: ['banana'] },
      ],
    },
    B: {
      drawPile: [{ id: 'C031', symbols: ['grape'] }],
      playedPile: [{ id: 'C021', symbols: ['pear'] }],
    },
  },
};

test('snapshot reveals only top played cards and pile sizes', () => {
  const snapshot = createRoomSnapshot(roomWithCoveredCards, 'B');
  expect(snapshot.players.A.playedCount).toBe(2);
  expect(snapshot.players.A.topCard?.id).toBe('C009');
  expect(JSON.stringify(snapshot)).not.toContain('C004');
  expect(JSON.stringify(snapshot)).not.toContain('drawPile');
});
```

- [x] **Step 2: Run `npm test -- --runInBand src/network/__tests__/protocol.test.ts`** and confirm failures identify missing protocol exports.
- [x] **Step 3: Implement the message unions, runtime decoder, room snapshot type, and projection.** Use only the current top card for each played pile and `countVisibleItems`/`canRing` from `src/game/rules.ts`.
- [x] **Step 4: Add concrete protocol variants.** Use `{ type: 'room.create'; requestId: string }`, `{ type: 'room.join'; requestId: string; roomCode: string }`, `{ type: 'room.reconnect'; requestId: string; roomCode: string; seatToken: string }`, `{ type: 'game.flip' | 'game.rematch'; actionId: string }`, and `{ type: 'game.ring'; actionId: string; tableVersion: number }`. Server messages are `{ type: 'room.session'; requestId; roomCode; localPlayerId; seatToken; snapshot }`, `{ type: 'room.snapshot'; snapshot }`, `{ type: 'action.result'; actionId; accepted; outcome?; movedCardCount? }`, or `{ type: 'error'; requestId?; actionId?; code; message }`.
- [x] **Step 5: Rerun the focused protocol tests and `npm run typecheck`.** Confirm neither player's draw card IDs or symbols appear in a serialized snapshot.
- [x] **Step 6: Commit `src/network/protocol.ts` and its tests as `feat: define BellFive room protocol`.**

## Task 2: Implement In-Memory Authoritative Room Manager

**Files:**
- Create: `server/src/roomManager.ts`
- Create: `server/src/__tests__/roomManager.test.ts`
- Create: `server/tsconfig.json`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/network/protocol.ts` only if Task 1's tested snapshot needs a room-level input type.

**Interfaces:**
- `RoomManager` accepts injectable `now()` and `random()` functions for deterministic expiry, room-code, and shuffle tests.
- `createRoom(connectionId)` returns a six-character room code, local player ID A, Player A seat token, and a waiting snapshot.
- `joinRoom(code, connectionId)` returns local player ID B, Player B's seat token, and recipient snapshots for A and B; it starts the game with `createGame(random)` when the second seat connects.
- `reconnectRoom(code, seatToken, connectionId)` restores only the matching reserved seat and returns updated snapshots for both seats.
- `disconnect(connectionId)` marks its seat disconnected, returns an updated snapshot for the remaining connection, and sets the room to connection-paused while preserving game state.
- `handleAction(connectionId, message)` validates connection/phase/turn/table version, applies the existing engine transition, deduplicates action IDs per seat, and returns the correlated action result plus snapshots for both seats.
- `pruneExpiredRooms(now)` deletes waiting rooms older than 15 minutes and rooms idle for 30 minutes.

- [x] **Step 1: Write tests** for unique six-character codes, creator A assignment, one-joiner B assignment, second join starting a 30/30 game, third join rejection, and not-found errors.

```ts
test('starts one fixed-deck game after the first friend joins', () => {
  const created = rooms.createRoom('socket-a');
  const joined = rooms.joinRoom(created.roomCode, 'socket-b');
  expect(created.localPlayerId).toBe('A');
  expect(joined.localPlayerId).toBe('B');
  expect(joined.snapshot.players.A.drawCount).toBe(30);
  expect(joined.snapshot.players.B.drawCount).toBe(30);
});
```

- [x] **Step 2: Run `npm test -- --runInBand server/src/__tests__/roomManager.test.ts`** and confirm the room manager API is absent.
- [x] **Step 3: Implement room records** with two seats, seat tokens, connection IDs, game state, phase, timestamps, `tableVersion`, and per-seat recent action IDs.
- [x] **Step 4: Add transition tests** for out-of-turn flip rejection, valid flip/turn alternation, correct collection, wrong-ring penalty cap, game over, and Player A-only rematch.
- [x] **Step 5: Run the room manager tests** and confirm the existing `src/game/engine.ts` functions produce the expected state changes.
- [x] **Step 6: Add stale-ring and duplicate-action tests.** A stale `tableVersion` must leave piles unchanged; a wrong ring must not increment `tableVersion`; a duplicate `actionId` must not apply a second penalty.
- [x] **Step 7: Add disconnect/reconnect/expiry tests.** Actions must be rejected while either seat is disconnected; reconnecting with the matching token restores play; unknown tokens and expired rooms are rejected.
- [x] **Step 8: Add `@types/node` as a development dependency.** Exclude `server/` from the Expo `tsconfig.json`, and create `server/tsconfig.json` targeting ES2022 with strict mode and Node16 module resolution, including the service, `src/game/`, and `src/network/protocol.ts` while excluding tests.
- [x] **Step 9: Run `npx tsc -p server/tsconfig.json --noEmit` and `npm run typecheck`.** Confirm both the service and mobile app typecheck independently.
- [x] **Step 10: Commit the room manager, tests, type configurations, and Node type dependency** as `feat: add authoritative friend room engine`.

## Task 3: Add WebSocket Transport and Service Startup

**Files:**
- Create: `server/src/websocketServer.ts`
- Create: `server/src/index.ts`
- Create: `server/src/__tests__/websocketServer.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- `createWebSocketServer({ roomManager, port, host })` returns a closeable service instance for tests and local startup. `server/tsconfig.json` targets ES2022, uses CommonJS/Node resolution, strict mode, and Node types while including only service, shared protocol, and pure game files.
- Each socket is bound to one seat after a successful create/join. Later actions derive the player from that binding, never from client-supplied player IDs.
- A create, join, or reconnect request returns one `room.session` message to the requester and any changed `room.snapshot` to both connected seats.
- Accepted actions send one correlated `action.result` to the acting socket and recipient-specific snapshots to both room sockets; errors send typed error messages and the current snapshot when available.
- `GET /health` returns a small `{ status: "ok" }` response for tunnel and process checks.

- [x] **Step 1: Add `ws` and `tsx` and add `@types/ws`**; add scripts `server:dev` (`tsx server/src/index.ts`), `server:typecheck` (`tsc -p server/tsconfig.json --noEmit`), and `server:test` (`jest server/src/__tests__/ --runInBand`). Put service dependencies in the root package so one `npm install` installs the Expo app and test service.
- [x] **Step 2: Write WebSocket integration tests** for create, join, two recipient `room.session` messages, two recipient snapshots, action-result correlation, turn rejection, malformed messages, and room-full rejection using an ephemeral localhost port. Put `/** @jest-environment node */` at the top of this test file.
- [x] **Step 3: Run the tests to confirm the transport is missing.**
- [x] **Step 4: Implement HTTP health and WebSocket message routing** over the tested `RoomManager`; parse all input through `decodeClientMessage` and send no stack traces to clients.
- [x] **Step 5: Run focused transport tests and `npm run server:typecheck`.** Confirm sockets close cleanly after tests.
- [x] **Step 6: Start the service locally and request `/health`.** Confirm the configured port and host work without changing Expo app startup.
- [x] **Step 7: Commit** as `feat: add BellFive WebSocket room service`.

## Task 4: Add Reconnecting Mobile Game Client

**Files:**
- Create: `src/network/GameClient.ts`
- Create: `src/network/__tests__/GameClient.test.ts`
- Modify: `package.json` only if an existing Expo config dependency is needed for environment values.

**Interfaces:**
- `GameClient` receives `url`, `webSocketFactory`, and typed message/status handlers.
- `createRoom()` and `joinRoom(code)` open the socket; `flip()`, `ring(tableVersion)`, `rematch()`, and `disconnect()` expose client actions. Reconnection stays internal to the client.
- The client keeps the seat token in memory only and reconnects with the same room code/token after an unexpected socket close.
- Replayed gameplay actions reuse the original `actionId`; the server deduplicates them.

- [x] **Step 1: Write tests** for opening a socket, encoding create/join/flip/ring messages, surfacing server snapshots and correlated action results, and closing intentionally without reconnecting.
- [x] **Step 2: Run the focused test and verify it fails** because `GameClient` does not exist.
- [x] **Step 3: Implement the client around the injected WebSocket factory.** Use a monotonically unique client action ID and retain only unacknowledged gameplay commands for retry. Reuse each action ID on retry and remove that command when its `action.result` arrives.
- [x] **Step 4: Add tests** for reconnect status, token-based seat restore, retrying the same action ID once connected, and avoiding a reconnect after explicit disconnect.
- [x] **Step 5: Run the client tests and `npm run typecheck`.** Confirm no Node-only `ws` import enters the React Native client bundle.
- [x] **Step 6: Commit** as `feat: add reconnecting BellFive game client`.

## Task 5: Adapt Zustand Store to Room Sessions

**Files:**
- Modify: `src/store/gameStore.ts`
- Create: `src/store/__tests__/gameStore.test.ts`
- Modify: `src/network/GameClient.ts` only to expose a small injected interface required by the store.

**Interfaces:**
- Store state contains `connectionStatus`, `roomSnapshot`, `roomCode`, `localPlayerId`, `error`, and a `GameClient` instance.
- Store actions are `createRoom`, `joinRoom(code)`, `flip`, `ring`, `rematch`, `leaveRoom`, and `applyServerMessage(message)`.
- The store does not call game engine transitions; only server snapshots update match state.

- [x] **Step 1: Write tests** proving create/join state updates, local-player identity comes from the server, flip/ring send requests rather than changing game state locally, and server snapshots replace local state.
- [x] **Step 2: Run the store tests and confirm they fail** against the current hot-seat store API.
- [x] **Step 3: Replace local `game`, `flipForPlayer`, and `ringForPlayer` state mutations** with the typed `GameClient` adapter and snapshot state.
- [x] **Step 4: Add tests** for unknown room, full room, connection-paused actions, errors, leave, and rematch authorization feedback.
- [x] **Step 5: Run store tests plus all `src/game` tests and typecheck.** Existing pure game-rule tests must remain unchanged and pass.
- [x] **Step 6: Commit** as `feat: move BellFive client state to room snapshots`.

## Task 6: Add Room Entry and Waiting UI

**Files:**
- Create: `src/components/RoomEntry.tsx`
- Create: `src/components/WaitingRoom.tsx`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/__tests__/GameScreen.test.tsx`
- Modify: `src/store/gameStore.ts` only if a UI action is missing from the tested store interface.

**Interfaces:**
- `RoomEntry` calls `createRoom()` or validates and calls `joinRoom(code)`; it shows server errors next to the affected action.
- `WaitingRoom` shows the six-character code, calls React Native `Share.share` with the code and join instructions, and shows A/B connection state.
- `GameScreen` chooses room entry, waiting, match, connection-paused, and finished content from store state.

- [x] **Step 1: Write component tests** for initial create/join choices, normalized room-code entry, waiting code/share copy, and role-specific connected indicators.
- [x] **Step 2: Run the focused UI tests and verify they fail** because room components and states are missing.
- [x] **Step 3: Implement the entry and waiting screens** using the existing BellFive colors and typography; keep all networking in the Zustand store/client.
- [x] **Step 4: Add tests** for join errors and switching to the match snapshot when B joins.
- [x] **Step 5: Run UI tests and typecheck.** Confirm the single Expo Router route remains `app/index.tsx`.
- [x] **Step 6: Commit** as `feat: add BellFive friend room lobby`.

## Task 7: Bind Match Controls to the Local Player

**Files:**
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/PlayerDeck.tsx`
- Modify: `src/components/DebugPanel.tsx`
- Modify: `src/components/CollectionFly.tsx`
- Modify: `src/components/__tests__/GameScreen.test.tsx`
- Modify: `src/services/gameFeedback.ts` only if local/opponent result feedback needs a typed entry point.

**Interfaces:**
- Both devices render the same playmat snapshot, with only `localPlayerId` changing between devices.
- Deck display receives `drawCount`, `playedCount`, `topCard`, `isLocalPlayer`, and `isTurnOwner`; no component reads full remote pile data.
- FLIP sends only the local player's flip intent and is actionable only when that local player owns the turn.
- Bell sends only the local player's ring intent with the snapshot's `tableVersion`; it stays enabled during connected active play.

- [x] **Step 1: Write regression tests** with A and B snapshots showing that A's FLIP calls the A-bound action, B's FLIP calls the B-bound action, and neither phone can flip for the opponent.
- [x] **Step 2: Write ring tests** proving both phones call `ring(tableVersion)` for their local player and the Bell stays enabled when `canRing` is false.
- [x] **Step 3: Run the focused UI tests and verify the current dual-player controls fail** the local-player assertions.
- [x] **Step 4: Adapt the approved playmat layout** to snapshots and local-only actions; use `canRing` for the debug/status display but never to disable Bell.
- [x] **Step 5: Add connection-paused and game-over tests.** Both controls suspend during connection pause; game-over view identifies the local win/loss and exposes rematch only to A.
- [x] **Step 6: Preserve card reveal, bell press, correct/wrong ring animations, collection cue, Haptics, and audio.** Trigger action feedback from acknowledged server events so each device reacts once to its own action.
- [x] **Step 7: Run all component tests, typecheck, and existing game/service tests.**
- [x] **Step 8: Commit** as `feat: bind BellFive match actions to each phone`.

## Task 8: Document and Exercise Remote Test Setup

**Files:**
- Create: `server/README.md`
- Modify: `package.json` only if the documented local commands need an explicit script.

**Interfaces:**
- The service reads `PORT` and `HOST` with defaults `8787` and `0.0.0.0`.
- The mobile client reads `EXPO_PUBLIC_GAME_SERVER_URL`; development URL points to the temporary public WebSocket tunnel.
- No tunnel credential or private seat token is committed.
- Explicitly leaving a room deletes it and returns the other player to room entry. The client retries the same leave request until acknowledged and blocks new room creation/joining while it waits.
- Snapshots expose `ringVersion` so repeated identical outcomes replay feedback on both phones.

- [x] **Step 1: Document install, start, health check, Expo URL configuration, tunnel setup, and two-phone test steps** in `server/README.md`. The server uses `PORT` (default `8787`) and `HOST` (default `0.0.0.0`); the Expo client uses `EXPO_PUBLIC_GAME_SERVER_URL`.
- [x] **Step 2: Start the local service and verify `GET /health` returns status `ok`.**
- [x] **Step 3: Run the full automated suite** with `npm test -- --runInBand`, `npm run typecheck`, and `npm run server:typecheck`.
- [ ] **Step 4: Manual test with two phones on separate internet connections:** create/share/join, alternate flips, confirm both snapshots, correct ring, wrong ring, game over, host rematch, briefly disconnect/reconnect, then restart the server and confirm both clients receive a recoverable connection error.
- [x] **Step 5: Review `git diff --check` and commit docs/test setup** as `docs: add BellFive remote room test guide`.

## Task 9: Close Review Findings

- [x] Add an explicit `room.leave` request, remove both seats on the server, acknowledge the leaver, and notify the connected peer that the room closed.
- [x] Return to room entry after terminal reconnect errors and show the error there.
- [x] Add a monotonically increasing ring feedback version so repeated equal outcomes retrigger the Bell animation.
- [x] Add protocol, client, store, room manager, WebSocket, and component regression tests for those behaviors.
- [x] Keep the room entry actions disabled until leave is acknowledged; retry an unacknowledged leave with the same request ID and make server handling idempotent.
- [ ] Re-run the manual two-phone remote test with the updated leave flow.

## Plan Self-Review

- The user flow, hidden-card policy, action authority, room lifecycle, reconnection, rematch, and testing requirements from the design spec map to Tasks 1–8.
- No authentication, public matchmaking, database, or Supabase task is present.
- Both mobile and server paths use the same protocol and pure engine; the mobile client does not import the Node `ws` package.
- Stale-ring ordering, wrong-ring non-version changes, hidden cards, and action retry deduplication have explicit tests.
- Remote verification is called out separately from automated localhost transport tests.
