# BellFive Public Lobby, Readiness, Activity Log, and Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live public room lobby with creator approval, a two-player ready gate for every match, a synchronized contextual ring log, and a fixed deck with a single Wild Bell and a five-of-a-kind fruit card.

**Architecture:** Keep room discovery, application decisions, readiness, and ring history authoritative in the existing WebSocket `RoomManager`. Extend the typed protocol, client/store, and existing lobby/waiting/game screens to display that state. Keep the 60 card definitions static and validate all 1,770 face-up pairs with the unchanged ring rule.

**Tech Stack:** React Native, Expo, TypeScript, Expo Router, Zustand, React Native Reanimated, Expo Audio, Node.js WebSocket service, Jest, React Native Testing Library.

## Global Constraints

- Keep exactly 60 fixed card definitions, `C001`–`C060`; shuffle them and deal 30/30 for every match.
- Each card has 1–5 symbols; the entire fixed deck contains exactly one Wild Bell symbol and at least one card with five identical fruits.
- Keep the existing ring formula unchanged; at least 177 of 1,770 distinct card pairs must satisfy it.
- Both current visible cards are the only cards counted for ring eligibility.
- Every room entry path, including room-code entry, requires the creator's approval.
- Both connected players must be ready before the initial match or a rematch starts; the five-minute clock starts at that transition.
- A waiting player who disconnects must ready again after reconnecting. Active-match disconnect pause behavior stays unchanged.
- Keep the latest 12 server-authored ring/card-transfer events in room snapshots; contextualize text per local seat and clear it on rematch.
- Keep flip, identical bell, and local victory/defeat audio behavior; do not add a sound dependency.
- Do not add accounts, persistent room storage, online matchmaking, Supabase, friends, ranking, commerce, or production hosting.

---

### Task 1: Update the fixed deck and prove the new constraints

**Files:**
- Modify: `src/game/__tests__/cards.test.ts`
- Modify: `src/game/cards.ts`

**Interfaces:**
- Keep `CARD_DEFINITIONS` as the existing readonly `CardDefinition[]` consumed by `createGame`.
- Keep `canRing` and the existing `countsForPair` test helper unchanged.

- [ ] **Step 1: Add the failing Bell-total and five-of-a-kind assertions**

Add these assertions to `describe('CARD_DEFINITIONS', ...)`:

```typescript
it('contains exactly one Wild Bell symbol across the fixed deck', () => {
  expect(CARD_DEFINITIONS.flatMap(card => card.symbols).filter(symbol => symbol === 'bell'))
    .toHaveLength(1);
});

it('contains a card with five copies of one fruit', () => {
  expect(CARD_DEFINITIONS.some(card =>
    card.symbols.length === 5 &&
    card.symbols[0] !== 'bell' &&
    card.symbols.every(symbol => symbol === card.symbols[0]),
  )).toBe(true);
});
```

- [ ] **Step 2: Run the deck test and confirm it fails for the current deck**

Run: `npm test -- --runInBand src/game/__tests__/cards.test.ts`

Expected: the Bell-total assertion reports more than one Bell and the five-of-a-kind assertion reports `false`.

- [ ] **Step 3: Change only fixed card literals**

Keep all IDs and array order. Replace nine Bell symbols with fruit symbols and make one five-symbol card five copies of a fruit. For example, reserve the one Bell in `C060` and make `C056` five bananas:

```typescript
{ id: 'C056', symbols: ['banana', 'banana', 'banana', 'banana', 'banana'] },
{ id: 'C060', symbols: ['peach', 'banana', 'grape', 'pear', 'bell'] },
```

Adjust other `C051`–`C060` symbol arrays as fixed fruit combinations until the existing exhaustive test still finds at least 177 valid pairs. Do not generate card contents at runtime and do not change `src/game/rules.ts`.

- [ ] **Step 4: Run the deck test and verify all static invariants**

Run: `npm test -- --runInBand src/game/__tests__/cards.test.ts`

Expected: all card tests pass, including 60 ordered IDs, 1–5 legal symbols per card, exactly one total Bell, five-of-a-kind, and at least 177 ringable pairs.

- [ ] **Step 5: Commit the deck change**

```powershell
git add src/game/cards.ts src/game/__tests__/cards.test.ts
git commit -m "feat: add single-bell five-of-a-kind deck"
```

### Task 2: Define and validate lobby, application, readiness, and history protocol data

**Files:**
- Modify: `src/network/protocol.ts`
- Modify: `src/network/__tests__/protocol.test.ts`
- Modify: snapshot fixtures in `src/network/__tests__/GameClient.test.ts`, `src/store/__tests__/gameStore.test.ts`, `src/components/__tests__/WaitingRoom.test.tsx`, and `src/components/__tests__/GameScreen.test.tsx`

**Interfaces:**
- Add `OpenRoomSummary = { roomCode: string; hostProfile: PlayerProfile }`.
- Add `JoinApplication = { applicationId: string; roomCode: string; profile: PlayerProfile }`.
- Add `ready: Readonly<Record<PlayerId, boolean>>` and `ringHistory: readonly RingFeedbackEvent[]` to `RoomSnapshot` and `RoomSnapshotSource`.
- Keep `room.join` as the application request; add lobby subscribe/refresh/unsubscribe, application decision/cancel, and `room.ready` client messages.
- Add server messages for room-list snapshots, pending applications, and application status. A successful approval continues to use `room.session`.

- [ ] **Step 1: Add decoder tests for the new wire contracts**

Add representative assertions to `src/network/__tests__/protocol.test.ts`:

```typescript
expect(decodeClientMessage('{"type":"room.lobby.subscribe"}')).toEqual({
  type: 'room.lobby.subscribe',
});
expect(decodeClientMessage(
  '{"type":"room.application.decision","applicationId":"app-1","approved":true}',
)).toEqual({
  type: 'room.application.decision',
  applicationId: 'app-1',
  approved: true,
});
```

Also test a room snapshot with both ready flags and a ring history of 12 entries, and reject malformed room summaries, application profiles, ready flags, or histories longer than 12.

- [ ] **Step 2: Run protocol tests and confirm the missing message types fail**

Run: `npm test -- --runInBand src/network/__tests__/protocol.test.ts`

Expected: the new lobby message decode returns `null`; the current protocol rejects the proposed lobby/application message variants.

- [ ] **Step 3: Add the typed client/server messages and snapshot fields**

Use these message shapes in the existing discriminated unions:

```typescript
| { type: 'room.lobby.subscribe' }
| { type: 'room.lobby.refresh' }
| { type: 'room.lobby.unsubscribe' }
| { type: 'room.application.decision'; applicationId: string; approved: boolean }
| { type: 'room.application.cancel'; applicationId: string }
| { type: 'room.ready'; actionId: string; ready: boolean }
```

Add server variants `room.lobby.snapshot { rooms }`, `room.application.pending { application }`, and `room.application.status { applicationId, status, message }`. Status is one of `pending`, `rejected`, `cancelled`, or `room_full`. Keep application approval success represented by the existing validated `room.session` message.

- [ ] **Step 4: Extend strict decoders and snapshot construction**

Validate every new client/server variant. Require a valid room code and sanitized profile in every public summary/application; require exactly A/B booleans for `ready`; require an array of at most 12 valid `RingFeedbackEvent` objects for `ringHistory`. Copy the new fields from `RoomSnapshotSource` in `createRoomSnapshot`.

- [ ] **Step 5: Update snapshot fixtures and run protocol tests**

Add literal fixture values such as `ready: { A: false, B: false }` and `ringHistory: []` to each `RoomSnapshot` fixture. Run: `npm test -- --runInBand src/network/__tests__/protocol.test.ts`

Expected: all valid new messages decode and every invalid fixture is rejected.

- [ ] **Step 6: Commit the protocol contract**

```powershell
git add src/network/protocol.ts src/network/__tests__/protocol.test.ts src/network/__tests__/GameClient.test.ts src/store/__tests__/gameStore.test.ts src/components/__tests__/WaitingRoom.test.tsx src/components/__tests__/GameScreen.test.tsx
git commit -m "feat: define BellFive lobby and ready protocol"
```

### Task 3: Implement live room discovery and approval in the authoritative room manager

**Files:**
- Modify: `server/src/roomManager.ts`
- Modify: `server/src/__tests__/roomManager.test.ts`
- Modify: `server/src/__tests__/websocketServer.test.ts`

**Interfaces:**
- `room.lobby.subscribe` registers the connection and returns `room.lobby.snapshot`.
- `room.lobby.refresh` returns a fresh snapshot; `room.lobby.unsubscribe` removes the subscription.
- `room.join` creates a pending application and never assigns a seat directly.
- `room.application.decision` is accepted only from the room creator. Approval atomically assigns seat B; rejection notifies the requester.
- `room.application.cancel` removes that request. Applicant disconnect, room leave, and room expiry remove affected pending applications. A host reconnect receives still-pending applications again.
- Public summaries include only connected creators' waiting rooms with an empty seat.

- [ ] **Step 1: Add failing tests for room-list filtering and approval**

Add a test to `roomManager.test.ts` that creates a waiting room, subscribes a second connection, and checks the returned list. Then send `room.join` and assert that it notifies A but does not send B a `room.session` before approval:

```typescript
const created = manager.handleMessage('socket-a', { type: 'room.create', requestId: 'create-a' });
const roomCode = messageOf(created, 'socket-a', 'room.session').roomCode;
const list = manager.handleMessage('socket-b', { type: 'room.lobby.subscribe' });
expect(messageOf(list, 'socket-b', 'room.lobby.snapshot').rooms).toHaveLength(1);

const application = manager.handleMessage('socket-b', {
  type: 'room.join', requestId: 'join-b', roomCode,
  profile: { nickname: 'Kai', avatarId: 'banana' },
});
expect(messageOf(application, 'socket-a', 'room.application.pending').application.profile.nickname)
  .toBe('Kai');
expect(application.some(event => event.connectionId === 'socket-b' && event.message.type === 'room.session'))
  .toBe(false);
```

Add separate tests for rejection, cancellation, applicant disconnect cleanup, room expiry cleanup, lobby list updates, host reconnect replay of pending applications, and two approvals racing for the last seat.

- [ ] **Step 2: Run the room-manager test and observe the direct-join behavior fail the new assertions**

Run: `npm test -- --runInBand server/src/__tests__/roomManager.test.ts`

Expected: the current `room.join` immediately returns a session and there is no lobby snapshot or application event.

- [ ] **Step 3: Store lobby subscriptions and pending applications**

Add a connection set for subscribed lobby clients and an application map carrying `applicationId`, `requestId`, `roomCode`, `connectionId`, and sanitized `profile`. Use the existing event return mechanism; do not write directly to sockets from `RoomManager`. Initialize each room's `ready` flags to `{ A: false, B: false }` and `ringHistory` to `[]`; include both fields in every seat's snapshot.

- [ ] **Step 4: Build room summaries and broadcast lobby changes**

Add one helper that constructs the available list from current rooms and emits `room.lobby.snapshot` to subscribed connections. Call it after room creation, application approval, room deletion/expiry, and seat availability changes. Refresh requests return the same helper's snapshot.

- [ ] **Step 5: Implement request, decision, cancel, and race handling**

On `room.join`, validate the room is waiting and has a seat, create an application, notify the host with `room.application.pending`, and notify the requester with `room.application.status: pending`. On approval, recheck the seat synchronously; either assign B and send a `room.session`, or report `room_full`. On rejection/cancel, clear the request and update both affected clients. Multiple applicants may wait; only the first approval can take the seat.

- [ ] **Step 6: Run manager and WebSocket integration tests**

Run: `npm test -- --runInBand server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts`

Expected: lobby subscriptions receive live lists, the host sees requests, approval creates a normal B session, rejected applicants remain outside the room, and a second approval cannot take an occupied seat.

- [ ] **Step 7: Commit the room admission flow**

```powershell
git add server/src/roomManager.ts server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts
git commit -m "feat: add public room applications and approval"
```

### Task 4: Gate initial games and rematches on both players being ready

**Files:**
- Modify: `server/src/roomManager.ts`
- Modify: `server/src/__tests__/roomManager.test.ts`
- Modify: `server/src/__tests__/websocketServer.test.ts`
- Modify: `src/network/protocol.ts` tests if a ready message edge case is uncovered

**Interfaces:**
- `room.ready { actionId, ready }` records the sender's readiness in the current waiting/finished phase.
- The match starts only when both seats are connected and both flags are true.
- Starting a match creates a fresh shuffled `GameState`, sets `phase: 'playing'`, starts the five-minute clock, and clears ring history.
- `game.rematch` is removed as a host-only shortcut; both players ready through the same action for every match.

- [ ] **Step 1: Add failing tests for first-match and rematch readiness**

After joining a room, assert phase is `waiting`, both ready flags are false, `game.flip` is rejected with `GAME_NOT_STARTED`, and the timer is `null`. Set A ready and assert it remains waiting. Set B ready and assert `playing` with 300 seconds (using the existing fake clock). After finishing the game, assert one ready action does not restart it and the second starts a new match.

- [ ] **Step 2: Run room-manager tests and confirm the current auto-start behavior fails**

Run: `npm test -- --runInBand server/src/__tests__/roomManager.test.ts`

Expected: current tests show that joining starts the game before either player readies.

- [ ] **Step 3: Add server ready state and a single `startMatch` transition**

Initialize `ready` to `{ A: false, B: false }` for a new room. When a valid ready action makes both flags true and both connections are present, call the game factory, clear ring history and old ring/flip feedback, set `phase` to `playing`, and start the clock at `now + matchDurationMs`.

- [ ] **Step 4: Keep waiting and finished phases stable until both are ready**

Remove game creation from the ordinary “both seats assigned and connected” phase update. During pre-start waiting, reject flips/rings. On disconnect during `waiting` or `finished`, reset the disconnected seat's ready flag; preserve existing pause/resume clock behavior for a `playing` game.

- [ ] **Step 5: Adapt game-action test setup to ready both seats explicitly**

Update the shared room setup helper in `roomManager.test.ts` and WebSocket tests so game-action tests call `room.ready` for A and B before acting. Keep dedicated tests that intentionally assert the not-ready phase.

- [ ] **Step 6: Run room-manager and WebSocket tests**

Run: `npm test -- --runInBand server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts`

Expected: no flip/ring before readiness; the match and clock begin on the second ready action; rematches also require both players; active-game reconnect tests still pause and resume correctly.

- [ ] **Step 7: Commit the ready gate**

```powershell
git add server/src/roomManager.ts server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts
git commit -m "feat: require both players ready before each match"
```

### Task 5: Connect the lobby and room actions through GameClient and Zustand

**Files:**
- Modify: `src/network/GameClient.ts`
- Modify: `src/network/__tests__/GameClient.test.ts`
- Modify: `src/store/gameStore.ts`
- Modify: `src/store/__tests__/gameStore.test.ts`

**Interfaces:**
- Add client operations `subscribeLobby`, `refreshLobby`, `applyToRoom`, `decideApplication`, `cancelApplication`, and `setReady`.
- Add handlers for lobby snapshots, pending applications, and application status.
- Store `openRooms`, received host applications, the local application status/id, and ready snapshots alongside existing game state.
- An approved application enters through the normal `room.session` handler; rejection/cancel leaves the lobby connection usable.

- [ ] **Step 1: Add failing transport tests for lobby subscription and approval session**

Test that `subscribeLobby()` sends `room.lobby.subscribe` after socket open, a `room.lobby.snapshot` reaches the handler, applying sends `room.join`, and a later approved `room.session` sets the local player to B. Test that a `room.application.status: rejected` clears the pending state without closing the lobby socket.

- [ ] **Step 2: Run GameClient tests and confirm new handlers/actions are absent**

Run: `npm test -- --runInBand src/network/__tests__/GameClient.test.ts`

Expected: the targeted tests fail because lobby methods, handler cases, and state transitions are missing.

- [ ] **Step 3: Add the GameClient methods and reconnect lifecycle**

Keep one client socket while browsing or waiting for an approval. Subscribe after the socket opens; send room-code applications through `room.join`; preserve the current pending application until the server answers; clear it on rejection/cancel/session. If a no-seat lobby connection closes, reconnect and resubscribe without replaying a rejected application.

- [ ] **Step 4: Extend the Zustand port and state**

Add typed fields/actions to `GameClientPort` and `GameStore`. Route the new GameClient handlers into store updates. Clear room-local application and approval data on leave/session transitions; retain the local lobby list until the next server list arrives.

- [ ] **Step 5: Add store tests for lobby and application state transitions**

Test a server lobby snapshot, a pending application from another player, local pending/rejected status, and approved session. Assert rejection keeps the existing client connection and the lobby screen state.

- [ ] **Step 6: Run transport and store tests**

Run: `npm test -- --runInBand src/network/__tests__/GameClient.test.ts src/store/__tests__/gameStore.test.ts`

Expected: all lobby/application events reach the store with no regression to create, reconnect, leave, or game-action behavior.

- [ ] **Step 7: Commit client and store integration**

```powershell
git add src/network/GameClient.ts src/network/__tests__/GameClient.test.ts src/store/gameStore.ts src/store/__tests__/gameStore.test.ts
git commit -m "feat: expose room lobby state to the app"
```

### Task 6: Add the public lobby, host approval controls, and ready screens

**Files:**
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/RoomEntry.tsx`
- Modify: `src/components/WaitingRoom.tsx`
- Modify: `src/components/__tests__/RoomEntry.test.tsx`
- Modify: `src/components/__tests__/WaitingRoom.test.tsx`
- Modify: `src/components/__tests__/GameScreen.test.tsx`

**Interfaces:**
- `RoomEntry` receives the open-room list, local application status, and callbacks for apply/cancel/create.
- `WaitingRoom` receives the host's pending applications, approval callback, `ready` state, and ready toggle callback.
- `GameScreen` opens the lobby subscription when no room session exists and routes host/requester controls to the store.

- [ ] **Step 1: Add failing lobby UI tests**

Test that each available room displays creator nickname/avatar and an Apply button; tapping it calls `onApply(roomCode)`. Test that a pending request shows its status and Cancel button. Keep create and code-entry controls present.

- [ ] **Step 2: Add failing waiting-room tests**

Test that the creator sees the applicant profile and Approve/Reject controls; each calls the correct application ID/decision. Test that both seats show their readiness and the local Ready/Not Ready control. No match-start action is shown before the server phase changes.

- [ ] **Step 3: Run the targeted UI tests and confirm controls are missing**

Run: `npm test -- --runInBand src/components/__tests__/RoomEntry.test.tsx src/components/__tests__/WaitingRoom.test.tsx`

Expected: new assertions fail because the screens do not yet render room rows, application actions, or ready controls.

- [ ] **Step 4: Implement the room list and applicant status in `RoomEntry`**

Render server-provided summaries with host profile and room code. Route list buttons and code submission to `applyToRoom`; while a request is pending, show its status and allow cancel. Keep profile hydration behavior and the existing Create Room path.

- [ ] **Step 5: Implement approval and ready controls in `WaitingRoom`**

Render pending application rows with profile/avatar and Approve/Reject buttons. Add a local Ready/Not Ready button and each player's readiness label. Explain that the match starts automatically after both are ready; show connection and server errors as before.

- [ ] **Step 6: Wire lobby subscription and screen callbacks**

When `GameScreen` has no room snapshot, call `openLobby` once for the current client. Pass store room/application state into `RoomEntry`; pass pending host requests/readiness into `WaitingRoom`. Ensure leaving or switching from a pending application does not leak the old request.

- [ ] **Step 7: Run room-entry, waiting-room, and game-screen tests**

Run: `npm test -- --runInBand src/components/__tests__/RoomEntry.test.tsx src/components/__tests__/WaitingRoom.test.tsx src/components/__tests__/GameScreen.test.tsx`

Expected: room application, host decision, and ready actions are available in the correct screen; existing audio, navigation-state, reconnect, and result-screen tests remain green.

- [ ] **Step 8: Commit lobby and readiness UI**

```powershell
git add src/components/GameScreen.tsx src/components/RoomEntry.tsx src/components/WaitingRoom.tsx src/components/__tests__/RoomEntry.test.tsx src/components/__tests__/WaitingRoom.test.tsx src/components/__tests__/GameScreen.test.tsx
git commit -m "feat: add room approval and ready screens"
```

### Task 7: Persist and render the contextual ring activity log

**Files:**
- Modify: `server/src/roomManager.ts`
- Modify: `server/src/__tests__/roomManager.test.ts`
- Create: `src/components/ActivityLog.tsx`
- Create: `src/components/__tests__/ActivityLog.test.tsx`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/__tests__/GameScreen.test.tsx`

**Interfaces:**
- `RoomSnapshot.ringHistory` is an ordered list of no more than 12 `RingFeedbackEvent` items, oldest first.
- Add `formatRingActivity(event: RingFeedbackEvent, localPlayerId: PlayerId): string` in `ActivityLog.tsx` and display the bounded history in a scrollable log.
- Keep `lastRingEvent` for the existing transfer animation and bell feedback.

- [ ] **Step 1: Add failing server tests for bounded ring history and rematch reset**

Assert that each accepted ring appends the event to both players' snapshots, the history never exceeds 12 items, a reconnect snapshot includes recent history, and the first match after rematch begins with an empty history.

- [ ] **Step 2: Run the room-manager tests and confirm snapshots lack history**

Run: `npm test -- --runInBand server/src/__tests__/roomManager.test.ts`

Expected: the new tests fail because snapshots only contain `lastRingEvent`.

- [ ] **Step 3: Keep a bounded history in `RoomManager`**

Create one non-null server-authored event, assign it to `lastRingEvent`, append that same local value, and retain the newest 12 entries:

```typescript
const ringEvent: RingFeedbackEvent = {
  version: room.ringVersion,
  caller: connection.playerId,
  outcome: result.outcome,
  movedCardCount: result.movedCardCount,
};
room.lastRingEvent = ringEvent;
room.ringHistory = [...room.ringHistory, ringEvent].slice(-12);
```

Pass it through `RoomSnapshotSource` for both seats. Clear it only when the next ready transition starts a new match.

- [ ] **Step 4: Add caller/opponent text tests**

Cover correct ring and wrong ring for caller A, caller B, and zero-card penalty. Example expected strings:

```typescript
expect(formatRingActivity(correctEventForA, 'A')).toBe('拍铃正确，获得 6 张牌');
expect(formatRingActivity(correctEventForA, 'B')).toBe('1号玩家拍铃正确，获得 6 张牌');
expect(formatRingActivity(wrongEventForA, 'B')).toBe('1号玩家拍铃错误，你获得 1 张牌');
```

- [ ] **Step 5: Implement the scrollable latest-12 log**

Render a compact activity panel using `ScrollView`, display entries oldest-to-newest, and retain all entries supplied in the snapshot until the server clears them on rematch. Do not turn flips into log entries.

- [ ] **Step 6: Place the log in the game screen and preserve feedback behavior**

Pass `roomSnapshot.ringHistory` and `localPlayerId` into `ActivityLog`. Keep `CardTransferFly`, the shared bell sound, flip sound version handling, and victory/defeat sound effects unchanged.

- [ ] **Step 7: Run activity, server, and game-screen tests**

Run: `npm test -- --runInBand src/components/__tests__/ActivityLog.test.tsx server/src/__tests__/roomManager.test.ts src/components/__tests__/GameScreen.test.tsx`

Expected: both players receive contextual lines, recent history is readable and bounded, rematch clears it, and sounds/animations still respond once per event.

- [ ] **Step 8: Commit the ring activity log**

```powershell
git add server/src/roomManager.ts server/src/__tests__/roomManager.test.ts src/components/ActivityLog.tsx src/components/__tests__/ActivityLog.test.tsx src/components/GameScreen.tsx src/components/__tests__/GameScreen.test.tsx
git commit -m "feat: add synchronized ring activity log"
```

### Task 8: Update operating instructions and run full verification

**Files:**
- Modify: `docs/中文操作手册.md`
- Modify: `server/README.md`

- [ ] **Step 1: Update the Chinese manual's lobby flow**

Document that a client sees connected waiting rooms, may apply from a row or by code, and waits for creator approval. Explain how the creator approves/rejects and how a rejected/full-room applicant retries.

- [ ] **Step 2: Update the readiness, log, deck, and sound sections**

Document that both players prepare for initial and rematch games; a waiting disconnect requires readiness again; both screens retain the latest 12 contextual ring/card-transfer log lines; the deck has one Bell total and a five-identical-fruit card; flip audio is already included.

- [ ] **Step 3: Update server notes and two-phone test checklist**

Explain that the public list is scoped to one running test-server instance, and add a two-phone checklist: discover a room; verify approval and rejection; verify neither phone can flip before both are ready; play a ready rematch; compare caller/opponent transfer messages; confirm a visible pair never has two Bells; and confirm a five-identical-fruit card is present in the fixed deck.

- [ ] **Step 4: Run all required verification commands**

```powershell
npm run typecheck
npm run server:typecheck
npm test -- --runInBand
git diff --check
```

Expected: both typechecks and every Jest suite pass; `git diff --check` emits no whitespace errors.

- [ ] **Step 5: Commit documentation after successful verification**

```powershell
git add docs/中文操作手册.md server/README.md
git commit -m "docs: describe public lobby and ready flow"
```

## Plan self-review

- Room discovery, room-code applications, creator approval, cancellation, races, and room lifecycle are covered in Tasks 2–3 and UI integration in Task 6.
- Both-ready start, not-ready action rejection, timer start, waiting disconnect reset, and rematch readiness are covered in Task 4 and Task 6.
- Ring event history, maximum length, reconnect snapshots, contextual text, empty penalty feedback, and rematch reset are covered in Tasks 2, 4, and 7.
- Static card constraints and exhaustive probability threshold are covered in Task 1; the ring formula stays untouched.
- Documentation and full frontend/server verification are covered in Task 8.
- Every production change has a preceding failing test and a named verification command.
