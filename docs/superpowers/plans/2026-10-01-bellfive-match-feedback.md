# BellFive Match Feedback and Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add the confirmed five-minute match limit, one-card false-ring penalty and cooldown, shared outcome audio, stable fruit placement, and two-phone card-transfer feedback to BellFive friend rooms.

**Architecture:** Keep rule transitions pure in `src/game`, deadlines and ring ordering authoritative in `server/src/roomManager.ts`, and publish redacted snapshots through `src/network/protocol.ts`. The mobile screen renders snapshots and plays each new event once; button press feedback stays local.

**Tech Stack:** React Native, Expo, TypeScript, Expo Router, Zustand, React Native Reanimated, Expo Haptics, Expo Audio, Jest.

## Global Constraints

- Each match uses the fixed C001–C060 card definitions, shuffled and dealt 30 cards per player.
- Each card has one to five symbols and at most one Wild Bell.
- Only the two current top cards count toward `canRing`; a correct ring awards both full played piles.
- A false ring transfers at most one card from the caller's draw-pile top to the opponent's draw-pile bottom.
- A false ringer must successfully flip their next card before their ring can be accepted again; the opponent's ring remains available.
- Ring stays pressable during connected active play, including cooldown; a cooldown press shows a reminder without another penalty.
- The five-minute clock starts when both seats connect and a game is dealt, resets on rematch, and pauses during `connection-paused`. The server owns timeout decisions; equal totals produce a draw.
- Correct and wrong outcome sounds and card-transfer animations play once on each connected phone. Press scale and press haptics happen only on the device that initiated the action.
- Keep draw-pile card identities and order hidden from clients. Do not add accounts, public matchmaking, persistence, or commerce features.
- Do not add dependencies; use existing Expo, Reanimated, Haptics, Audio, and Jest packages.

---

### Task 1: Enforce the one-bell fixed card manifest

**Files:**
- Modify: `src/game/cards.ts`
- Test: `src/game/__tests__/cards.test.ts`

**Interfaces:**
- Consumes: `CARD_DEFINITIONS: readonly CardDefinition[]`.
- Produces: the same 60 stable card IDs, with no definition containing more than one `bell` symbol.

- [ ] **Step 1: Add a failing manifest assertion**

```ts
it('defines no more than one Wild Bell on any fixed card', () => {
  expect(CARD_DEFINITIONS).toHaveLength(60);
  expect(CARD_DEFINITIONS.every(card => card.symbols.filter(symbol => symbol === 'bell').length <= 1)).toBe(true);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails on C059 and C060**

```powershell
npm test -- --runInBand src/game/__tests__/cards.test.ts
```

Expected: the new assertion fails because C059 and C060 each currently contain two bells.

- [ ] **Step 3: Replace only the duplicate bell symbols**

In `src/game/cards.ts`, preserve each ID and five-symbol count; replace C059's extra bell with `banana` and C060's extra bell with `pear`.

- [ ] **Step 4: Re-run the card-definition tests**

```powershell
npm test -- --runInBand src/game/__tests__/cards.test.ts
```

Expected: all card-definition tests pass and IDs remain C001–C060.

- [ ] **Step 5: Commit the deck constraint**

```powershell
git add src/game/cards.ts src/game/__tests__/cards.test.ts
git commit -m "fix: limit fixed cards to one wild bell"
```

### Task 2: Implement penalty, ring cooldown, and timeout scoring in the pure engine

**Files:**
- Modify: `src/game/types.ts`
- Modify: `src/game/engine.ts`
- Test: `src/game/__tests__/engine.test.ts`
- Test: `src/game/__tests__/rules.test.ts` (add the cooldown fields to its `GameState` fixture)

**Interfaces:**
- Consumes: immutable `GameState`, `PlayerId`, and the existing transitions.
- Produces: `GameState.ringBlockedUntilFlip: Readonly<Record<PlayerId, boolean>>`, `canPlayerRing(state, caller): boolean`, and `finishGameByTimeout(state): GameState`.

- [ ] **Step 1: Write failing engine tests**

Add cases showing: a wrong ring transfers one available card and zero when none is available; only the caller is blocked; that caller's next successful flip clears their block; timeout compares each player's `drawPile.length + playedPile.length`; and equal totals finish with `winner: null`.

```ts
expect(finishGameByTimeout(state)).toMatchObject({ status: 'finished', winner: 'A' });
expect(canPlayerRing(afterWrongRing, 'A')).toBe(false);
```

- [ ] **Step 2: Run the engine tests and confirm the old rules fail them**

```powershell
npm test -- --runInBand src/game/__tests__/engine.test.ts src/game/__tests__/rules.test.ts
```

Expected: failures show the two-card transfer and missing cooldown/timeout transitions.

- [ ] **Step 3: Add the minimum pure state transitions**

Initialize cooldown flags to `false` in `createGame`; change `transferPenaltyCards` to take `slice(0, 1)`; set only the caller's flag after a wrong ring; clear the active player's flag only when a card is actually flipped; implement `canPlayerRing`; and implement timeout as a finished state with total-card comparison. Preserve the ordinary empty-draw winner rule.

```ts
export function canPlayerRing(state: GameState, caller: PlayerId): boolean {
  return state.status === 'playing' && !state.ringBlockedUntilFlip[caller];
}
```

- [ ] **Step 4: Re-run pure game tests**

```powershell
npm test -- --runInBand src/game/__tests__/engine.test.ts src/game/__tests__/rules.test.ts
```

Expected: visible-top counting, full-pile collection, one-card penalty, cooldown, and timeout scoring pass.

- [ ] **Step 5: Commit pure game transitions**

```powershell
git add src/game/types.ts src/game/engine.ts src/game/__tests__/engine.test.ts src/game/__tests__/rules.test.ts
git commit -m "feat: add BellFive penalty cooldown and timeout scoring"
```

### Task 3: Extend and validate the room snapshot protocol

**Files:**
- Modify: `src/network/protocol.ts`
- Test: `src/network/__tests__/protocol.test.ts`

**Interfaces:**
- Consumes: `GameState.ringBlockedUntilFlip` and the room's server-owned match metadata.
- Produces: `RingFeedbackEvent`, `RoomSnapshot.remainingSeconds`, `RoomSnapshot.ringBlockedUntilFlip`, and `RoomSnapshot.lastRingEvent`.

- [ ] **Step 1: Add failing snapshot round-trip and validation cases**

Extend `createRoomSource()` with timer and ring-event values. Assert that `createRoomSnapshot()` preserves them, that the decoder rejects a negative countdown and malformed caller/outcome/version/count, and that snapshots still contain only each player's visible top card.

```ts
expect(snapshot).toMatchObject({
  remainingSeconds: 300,
  ringBlockedUntilFlip: { A: false, B: false },
  lastRingEvent: { version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 1 },
});
```

- [ ] **Step 2: Run protocol tests and confirm the new shape fails**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts
```

Expected: TypeScript or assertions fail because the snapshot source and decoder lack the new fields.

- [ ] **Step 3: Add the shared event and snapshot fields**

```ts
export type RingFeedbackEvent = Readonly<{
  version: number;
  caller: PlayerId;
  outcome: RingOutcome;
  movedCardCount: number;
}>;
```

Add `remainingSeconds: number | null`, `ringBlockedUntilFlip: Readonly<Record<PlayerId, boolean>>`, and `lastRingEvent: RingFeedbackEvent | null` to the snapshot and source types. Validate nonnegative seconds/count/version and valid player/outcome values. Continue projecting only draw counts and current top cards.

- [ ] **Step 4: Re-run protocol tests**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts
```

Expected: new snapshots round-trip, malformed fields fail decoding, and draw-pile contents remain absent.

- [ ] **Step 5: Commit the protocol contract**

```powershell
git add src/network/protocol.ts src/network/__tests__/protocol.test.ts
git commit -m "feat: add timer and ring event to room snapshots"
```

### Task 4: Enforce the ring cooldown and publish transfer metadata

**Files:**
- Modify: `server/src/roomManager.ts`
- Test: `server/src/__tests__/roomManager.test.ts`

**Interfaces:**
- Consumes: `canPlayerRing`, `ringBell`, `RoomSnapshotSource`, and `RingFeedbackEvent` from prior tasks.
- Produces: one room event per accepted ring; rejected cooldown attempts return `RING_COOLDOWN` without a penalty.

- [ ] **Step 1: Add failing room-manager ring tests**

Update the existing wrong-ring expectations to one card. Assert that the snapshot event identifies caller, outcome, event version, and moved count; that a second ring by that player before their next flip returns `RING_COOLDOWN` without another move/version; and that the opponent can still ring. Update the `customGame()` fixture with both cooldown flags.

```ts
expect(snapshot.lastRingEvent).toEqual({ version: 1, caller: 'A', outcome: 'wrong', movedCardCount: 1 });
expect(messageOf(blocked, 'socket-a', 'error').code).toBe('RING_COOLDOWN');
```

- [ ] **Step 2: Run room-manager tests and confirm the old server behavior fails**

```powershell
npm test -- --runInBand server/src/__tests__/roomManager.test.ts
```

Expected: the old server moves two cards and accepts a second ring without a cooldown event.

- [ ] **Step 3: Reject cooldown rings and record accepted ring events**

Check `canPlayerRing(room.game, caller)` before stale-table evaluation so a blocked caller consistently gets the cooldown reminder. On each accepted ring, increment `ringVersion` and save `{ version, caller, outcome, movedCardCount }` on the room. Pass that event and the game cooldown map into each player's snapshot. Clear the last ring event on rematch while keeping the room's version monotonic.

- [ ] **Step 4: Re-run room-manager tests**

```powershell
npm test -- --runInBand server/src/__tests__/roomManager.test.ts
```

Expected: one-card penalties, caller cooldown, opponent availability, full-pile collection, and existing action deduplication pass.

- [ ] **Step 5: Commit authoritative ring behavior**

```powershell
git add server/src/roomManager.ts server/src/__tests__/roomManager.test.ts
git commit -m "feat: enforce false ring cooldown and publish transfer events"
```

### Task 5: Add the five-minute server clock and pause it on disconnect

**Files:**
- Modify: `server/src/roomManager.ts`
- Test: `server/src/__tests__/roomManager.test.ts`
- Modify: `server/src/websocketServer.ts`
- Test: `server/src/__tests__/websocketServer.test.ts`

**Interfaces:**
- Consumes: `finishGameByTimeout`, room snapshot timer fields, and the injected `now` clock.
- Produces: `RoomManager.tick(now?: number): RoomManagerEvent[]`; a five-minute deadline that starts on initial deal, pauses in `connection-paused`, resumes with saved time, and resets on rematch.

- [ ] **Step 1: Add failing fake-clock tests**

Test that the waiting room has no active clock; both connected players see 300 seconds after the deal; remaining seconds decrease; disconnect preserves remaining time; reconnect resumes that remainder; reaching zero broadcasts a finished snapshot with the larger-total winner or a draw; and rematch restarts at 300 seconds. Add `matchDurationMs?: number` to test configuration so the WebSocket test can use a short duration while production defaults to `300_000`.

```ts
now += 60_000;
expect(messageOf(manager.tick(now), 'socket-a', 'room.snapshot').snapshot.remainingSeconds).toBe(240);
```

- [ ] **Step 2: Run room-manager tests and confirm missing clock behavior**

```powershell
npm test -- --runInBand server/src/__tests__/roomManager.test.ts
```

Expected: the manager has no `tick` transition or saved pause duration.

- [ ] **Step 3: Implement deadline, pause/resume, and timeout snapshots**

Record the initial deadline when both seats connect and a game is created. Store remaining milliseconds on disconnect, resume the deadline when both seats reconnect, and reset it after an accepted rematch. `tick(now)` should finish expired games through `finishGameByTimeout`; otherwise emit snapshots when the displayed second changes. Every flip or ring handler must also settle an already-expired match before applying an action.

- [ ] **Step 4: Broadcast periodic ticks from the WebSocket server**

Run `roomManager.tick()` once per second through `sendEvents`; clear the interval in `closeServers`. Add a WebSocket test using a short injected match duration and assert both sockets receive the timeout snapshot.

- [ ] **Step 5: Run server and protocol integration tests**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts
```

Expected: both phones receive matching time, timeout result, and ring-event metadata; actions after timeout are rejected.

- [ ] **Step 6: Commit server timer behavior**

```powershell
git add server/src/roomManager.ts server/src/__tests__/roomManager.test.ts server/src/websocketServer.ts server/src/__tests__/websocketServer.test.ts
git commit -m "feat: add synchronized five minute match timer"
```

### Task 6: Show match status and play ring feedback on each phone

**Files:**
- Modify: `src/services/gameFeedback.ts`
- Test: `src/services/__tests__/gameFeedback.test.ts`
- Modify: `src/components/BellButton.tsx`
- Test: `src/components/__tests__/BellButton.test.tsx`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/DebugPanel.tsx`
- Test: `src/components/__tests__/GameScreen.test.tsx`
- Update snapshot fixtures: `src/network/__tests__/GameClient.test.ts` and `src/store/__tests__/gameStore.test.ts`.
- Modify: `docs/中文操作手册.md`

**Interfaces:**
- Consumes: `RoomSnapshot.remainingSeconds`, `ringBlockedUntilFlip`, `lastRingEvent`, and caller-only `action.result`.
- Produces: an `MM:SS` display, explicit timeout `DRAW`, cooldown reminder, once-per-event result sound, and caller-only bell result animation/haptics.

- [ ] **Step 1: Add failing feedback and screen assertions**

Assert the correct profile plays the existing bell sound and success haptic; the wrong profile uses a lower-volume short cue and soft haptic; a remote ring updates shared text without animating the local BellButton; and the screen renders `05:00`, a reduced timer, `DRAW`, and the cooldown error while keeping Ring pressable.

```ts
expect(screen.getByText('05:00')).toBeOnTheScreen();
expect(screen.getByText('DRAW')).toBeOnTheScreen();
```

- [ ] **Step 2: Run the focused tests and confirm the missing UI/feedback behavior**

```powershell
npm test -- --runInBand src/services/__tests__/gameFeedback.test.ts src/components/__tests__/BellButton.test.tsx src/components/__tests__/GameScreen.test.tsx
```

Expected: no countdown/draw/cooldown display exists, wrong audio has no short cue, and both BellButtons animate from the shared outcome.

- [ ] **Step 3: Implement local and shared feedback paths**

Use `bell.wav` for correct results and replay a lower-volume short segment for wrong results. Play sound from `lastRingEvent.version` on both devices once; initialize the first observed version as the reconnect baseline. Trigger immediate press scale/light haptic locally and keep correct-success or wrong-soft outcome haptics on the initiating device's action result. Gate BellButton result animation on `lastRingEvent.caller === localPlayerId`, while keeping result copy shared.

- [ ] **Step 4: Render countdown, winner/draw, cooldown, and debug fields**

Format `remainingSeconds` as `MM:SS`, show `DRAW` when a finished snapshot has `winner === null`, display timeout winner copy for a player winner, and add the timer and both cooldown flags to DebugPanel. Keep Ring enabled for a connected active room during cooldown; show the server's `RING_COOLDOWN` message. Update the Chinese manual to document one-card penalty, next-flip cooldown, five-minute scoring, and disconnect pause/resume.

```ts
const minutes = Math.floor(remainingSeconds / 60);
const seconds = remainingSeconds % 60;
const label = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
```

- [ ] **Step 5: Re-run client feedback and snapshot tests**

```powershell
npm test -- --runInBand src/services/__tests__/gameFeedback.test.ts src/components/__tests__/BellButton.test.tsx src/components/__tests__/GameScreen.test.tsx src/network/__tests__/GameClient.test.ts src/store/__tests__/gameStore.test.ts
```

Expected: remote event audio plays once per version, local-only button response is preserved, and every updated snapshot fixture decodes and renders.

- [ ] **Step 6: Commit the game status and audio behavior**

```powershell
git add src/services/gameFeedback.ts src/services/__tests__/gameFeedback.test.ts src/components/BellButton.tsx src/components/__tests__/BellButton.test.tsx src/components/GameScreen.tsx src/components/DebugPanel.tsx src/components/__tests__/GameScreen.test.tsx src/network/__tests__/GameClient.test.ts src/store/__tests__/gameStore.test.ts docs/中文操作手册.md
git commit -m "feat: show BellFive timer and shared ring feedback"
```

### Task 7: Arrange fruit symbols and animate card transfers on both phones

**Files:**
- Create: `src/game/cardLayout.ts`
- Test: `src/game/__tests__/cardLayout.test.ts`
- Modify: `src/components/GameCard.tsx`
- Create: `src/components/CardTransferFly.tsx`
- Delete: `src/components/CollectionFly.tsx`
- Modify: `src/components/GameScreen.tsx`
- Test: `src/components/__tests__/GameScreen.test.tsx`

**Interfaces:**
- Produces: `getCardSymbolPositions(cardId: string, count: number): readonly CardSymbolPosition[]` and `CardTransferFly({ event: RingFeedbackEvent })`.

- [ ] **Step 1: Add failing stable-layout and direction tests**

Test that symbol counts 1–5 produce the same number of normalized coordinates, every coordinate stays between 0 and 1, and equal card ID/count inputs return equal coordinates. Add screen assertions for a collection toward the caller and a one-card transfer from caller to opponent, for both A and B.

```ts
expect(getCardSymbolPositions('C059', 5)).toHaveLength(5);
expect(getCardSymbolPositions('C059', 5)).toEqual(getCardSymbolPositions('C059', 5));
```

- [ ] **Step 2: Run the focused tests and confirm the helper and transfer direction are missing**

```powershell
npm test -- --runInBand src/game/__tests__/cardLayout.test.ts src/components/__tests__/GameScreen.test.tsx
```

Expected: the layout module is missing and transfer feedback remains caller-only.

- [ ] **Step 3: Implement deterministic five-count fruit positions**

```ts
export type CardSymbolPosition = Readonly<{ x: number; y: number }>;
export function getCardSymbolPositions(cardId: string, count: number): readonly CardSymbolPosition[];
```

Use a center for one symbol, diagonal endpoints for two, an asymmetric triangle for three, four separate regions for four, and a loose five-point layout for five. Choose a stable rotation/reflection from `cardId`; position each emoji absolutely inside the existing animated card face.

- [ ] **Step 4: Implement direction-aware event animation**

```tsx
<View testID={event.outcome === 'correct' ? `collect-to-${event.caller}` : `transfer-${event.caller}-to-${opponent}`} />
```

Create a Reanimated overlay that reads the synchronized event on both phones. A correct event moves the played-card stack toward the caller; a wrong event moves the actual penalty count from caller to opponent. Set `pointerEvents="none"`, cap individual flying backs at five with a count badge, and render no flight when the moved count is zero.

- [ ] **Step 5: Re-run layout and screen tests**

```powershell
npm test -- --runInBand src/game/__tests__/cardLayout.test.ts src/components/__tests__/GameScreen.test.tsx
```

Expected: fruit stays in bounds and stable, and both client roles show the transfer in the correct direction.

- [ ] **Step 6: Commit the card-face and transfer animations**

```powershell
git add src/game/cardLayout.ts src/game/__tests__/cardLayout.test.ts src/components/GameCard.tsx src/components/CardTransferFly.tsx src/components/CollectionFly.tsx src/components/GameScreen.tsx src/components/__tests__/GameScreen.test.tsx
git commit -m "feat: animate BellFive card transfers"
```

### Task 8: Run complete regression and type checks

**Files:** existing app and server source and test suites.

- [ ] **Step 1: Run both TypeScript checks**

```powershell
npm run typecheck
npm run server:typecheck
```

Expected: both commands exit successfully with no diagnostics.

- [ ] **Step 2: Run all Jest tests**

```powershell
npm test -- --runInBand
```

Expected: app, engine, protocol, room lifecycle, reconnect, store, screen, audio, timer, and animation tests all pass.

- [ ] **Step 3: Review the final change set**

```powershell
git status --short --branch
git diff --check
git log -8 --oneline
```

Expected: no whitespace errors or unrelated files; each implementation task has a focused commit.
