# BellFive 单机电脑对战 Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Add an offline solo mode where one player competes against an AI at one of three selectable difficulty levels, reusing the existing BellFive rules and game table.

**Architecture:** A focused local controller owns the solo GameState, countdown, AI decisions, and timers, then projects state through createRoomSnapshot. GameStore explicitly distinguishes no session, online session, and solo session so local actions never reach GameClient. RoomEntry and GameScreen expose and render the mode while continuing to use the shared table and feedback UI.

**Tech Stack:** React Native, TypeScript, Zustand, existing BellFive engine and snapshot projection, Expo audio and game feedback.

## Global Constraints

- Reuse the current fixed 60-card deck, 30/30 deal, alternating flips, bell rules, winner calculation, and five-minute timeout.
- Solo mode must start and remain playable when the game server is unavailable; solo gameplay actions must not be sent to the online GameClient.
- Keep room creation, joining, the server protocol, and online game rules unchanged.
- Difficulty values are Easy 1100 ms flip / 900 ms correct-ring reaction / 20% false ring; Normal 750 ms / 550 ms / 8%; Hard 420 ms / 250 ms / 2%.
- AI decisions use visible cards only; cancel and invalidate pending timers on player actions, rematch, leaving, and game end.
- Preserve the existing uncommitted dual-deck animation work in GameScreen and translations; extend those files in place, do not reset or stage unrelated changes.
- Do not add or run tests for this implementation. Run the TypeScript typecheck once after the code changes.

## File Structure

- Create src/game/singlePlayerController.ts to own one solo match, GameState transitions, AI timing, countdown, and RoomSnapshot projection.
- Modify src/store/gameStore.ts to hold sessionMode and the active controller and to route local actions separately from GameClientPort.
- Modify src/components/RoomEntry.tsx to present an offline entry and difficulty picker that does not depend on connection status.
- Modify src/components/GameScreen.tsx to pass solo entry actions and make gameplay, connection messaging, rematch, names, and title mode-aware.
- Modify src/components/DebugPanel.tsx so solo details identify a local match instead of reporting a disconnected server.
- Modify src/components/RingActivityLog.tsx to allow the solo opponent's localized name in the existing ring history.
- Modify src/i18n/translations.ts with matching English and Simplified Chinese strings for the mode, opponent, and three difficulty choices.
- Leave src/network/protocol.ts and all server files unchanged; use the existing RoomSnapshotSource and createRoomSnapshot projection.

---

### Task 1: Implement the local match controller

**Files:**
- Create: src/game/singlePlayerController.ts
- Read: src/game/engine.ts
- Read: src/game/rules.ts
- Read: src/network/protocol.ts
- Read: src/profile.ts

**Interfaces:**
- Export SinglePlayerDifficulty as 'easy' | 'normal' | 'hard'.
- Export SinglePlayerActionResult as Extract<ServerMessage, { type: 'action.result' }>.
- Export SinglePlayerController with start(profile: PlayerProfileInput, difficulty: SinglePlayerDifficulty), flip(), ring(), rematch(), and stop() methods.
- Its constructor accepts { onUpdate(update: { snapshot: RoomSnapshot, lastActionResult: SinglePlayerActionResult | null }): void }.
- Sanitize the input profile with sanitizePlayerProfile(profile, 'A') before snapshot projection.

- [x] **Step 1: Define difficulty configuration and controller state**

Add the exact difficulty map and controller API. Keep the current game, profile, difficulty, counters, and timer handles private to the controller.

~~~ts
export type SinglePlayerDifficulty = 'easy' | 'normal' | 'hard';

const DIFFICULTY = {
  easy: { flipDelayMs: 1100, correctRingDelayMs: 900, falseRingChance: 0.20 },
  normal: { flipDelayMs: 750, correctRingDelayMs: 550, falseRingChance: 0.08 },
  hard: { flipDelayMs: 420, correctRingDelayMs: 250, falseRingChance: 0.02 },
} as const;
~~~

- [x] **Step 2: Project the local game into the existing room snapshot shape**

Build RoomSnapshotSource from the active game with an empty internal roomCode, both seats available, the user's profile for A, a bell-avatar placeholder for B, ready false for both players, and the controller's event versions and remainingSeconds. Convert it with createRoomSnapshot(source, 'A'); GameScreen will render a localized solo title and opponent name instead of exposing the internal roomCode or placeholder nickname.

~~~ts
const snapshot = createRoomSnapshot({
  roomCode: '',
  phase: game.status === 'playing' ? 'playing' : 'finished',
  game,
  connected: { A: true, B: true },
  profiles: { A: this.profile, B: { nickname: '', avatarId: 'bell' } },
  tableVersion: this.tableVersion,
  ringVersion: this.ringVersion,
  remainingSeconds: this.remainingSeconds,
  lastRingEvent: this.lastRingEvent,
  lastFlipEvent: this.lastFlipEvent,
  ready: { A: false, B: false },
  ringHistory: this.ringHistory,
}, 'A');
~~~

- [x] **Step 3: Implement player and AI engine actions**

Use flipCard, ringBell, canPlayerRing, and countVisibleItems from the current game modules. Increment tableVersion and flip event version only when a card is actually flipped; increment ringVersion on every accepted ring; increment tableVersion after a correct ring only. Keep at most the latest 12 ring events. Emit a local SinglePlayerActionResult for the player's ring only, so AI haptics do not fire on the human device.

- [x] **Step 4: Add countdown, AI scheduling, and cancellation**

Start at 300 seconds, update remainingSeconds once per second using a deadline, and call finishGameByTimeout at zero. Schedule AI reactions from the visible state: correct ring first, otherwise sample at most one false ring for that table version, then flip after flipDelayMs only when B owns the turn. If a false ring leaves the game active and B still owns the turn, schedule the flip step. Keep an actionRevision that increments on every accepted player or AI action; every timeout captures the session generation, actionRevision, tableVersion, and expected turn and rechecks them before acting. A player action clears the pending AI timeout and schedules a fresh decision from the resulting state without sampling a second false-ring decision for an already evaluated table version. When a flip or timeout finishes the game, clear both AI and countdown timers. stop() clears all handles; start() and rematch() invalidate prior generations before creating the new game.

- [x] **Step 5: Publish snapshot updates from all transitions**

Use one private publish method after start, action, timer tick, timeout, and rematch. Keep AI transitions visible through lastFlipEvent and lastRingEvent; pass the existing lastActionResult through unchanged on AI updates.

~~~ts
private publish(actionResult = this.lastActionResult) {
  if (!this.game) return;
  this.onUpdate({ snapshot: this.createSnapshot(), lastActionResult: actionResult });
}
~~~

### Task 2: Route solo sessions through GameStore

**Files:**
- Modify: src/store/gameStore.ts
- Consume: src/game/singlePlayerController.ts

**Interfaces:**
- Add sessionMode: 'none' | 'online' | 'single-player'.
- Add startSinglePlayer(profile: PlayerProfileInput, difficulty: SinglePlayerDifficulty): void.
- Existing flip(), ring(), setReady(), rematch(), and leaveRoom() branch on sessionMode; online behavior continues to use GameClientPort.

- [x] **Step 1: Add solo session fields and controller ownership**

Keep the controller in the createGameStore closure, not in React component state. Initialize sessionMode to none. When an online room.session arrives set online; when an online room leaves or closes set none.

- [x] **Step 2: Implement startSinglePlayer and local action branches**

startSinglePlayer stops any prior solo controller, sets sessionMode to single-player, roomCode to null, localPlayerId to A, clears online errors and action results, increments roomSessionVersion, constructs the controller, and starts it with the supplied profile and difficulty. In single-player mode, flip and ring call the controller and publish the returned snapshot locally. Never call GameClientPort.flip() or GameClientPort.ring() on that path.

- [x] **Step 3: Handle replay, exit, and online transitions**

When setReady(true) is called in solo mode, restart the local match at its current difficulty; setReady(false) is a no-op. rematch() uses the same controller method. leaveRoom() stops the controller and clears solo state immediately without calling GameClientPort.leaveRoom(); retain the existing asynchronous leave path for online mode. Starting or joining an online room first stops and clears any solo controller. Before controller.rematch(), increment roomSessionVersion in the Store from both rematch() and setReady(true), so GameScreen treats reused event counters as a new session.

~~~ts
if (get().sessionMode === 'single-player') {
  if (ready) soloController?.rematch();
  return;
}
get().client?.setReady(ready);
~~~

### Task 3: Add the offline entry and difficulty picker

**Files:**
- Modify: src/components/RoomEntry.tsx
- Modify: src/i18n/translations.ts
- Consume: startSinglePlayer from GameStore

**Interfaces:**
- RoomEntry accepts an optional onStartSinglePlayer(difficulty: SinglePlayerDifficulty) callback so existing callers without solo mode remain valid.
- The solo start button is disabled only while the player profile is not hydrated; network busy/error state must not disable it.

- [x] **Step 1: Add localized solo and difficulty labels**

Add matching keys to both translation dictionaries for entry.singlePlayer, entry.chooseDifficulty, difficulty.easy, difficulty.normal, difficulty.hard, game.singlePlayer, solo.opponent, and debug.singlePlayer. Import TranslationKey as a type for the difficulty-label map. Preserve the existing dirty translation edits.

- [x] **Step 2: Add a compact picker to RoomEntry**

Keep the current online create/join controls and add a separate solo button. Pressing it reveals three difficulty choices; choosing one calls onStartSinglePlayer immediately. Gate only on profileHydrated for this action, not busy, applyingRoomCode, connectionStatus, or error.

~~~tsx
const DIFFICULTIES: readonly SinglePlayerDifficulty[] = ['easy', 'normal', 'hard'];
const DIFFICULTY_LABEL_KEYS: Readonly<Record<SinglePlayerDifficulty, TranslationKey>> = {
  easy: 'difficulty.easy', normal: 'difficulty.normal', hard: 'difficulty.hard',
};

<Pressable disabled={!profileHydrated} onPress={() => setShowDifficulties(true)}>
  <Text>{t('entry.singlePlayer')}</Text>
</Pressable>
{showDifficulties ? DIFFICULTIES.map(difficulty => (
  <Pressable key={difficulty} onPress={() => onStartSinglePlayer?.(difficulty)}>
    <Text>{t(DIFFICULTY_LABEL_KEYS[difficulty])}</Text>
  </Pressable>
)) : null}
~~~

### Task 4: Make the shared game screen session-aware

**Files:**
- Modify: src/components/GameScreen.tsx
- Modify: src/components/DebugPanel.tsx
- Modify: src/components/RingActivityLog.tsx
- Consume: sessionMode and local controller actions from GameStore

**Interfaces:**
- GameScreen reads sessionMode and passes onStartSinglePlayer to RoomEntry.
- DebugPanel accepts an optional sessionMode prop defaulting to online, preserving existing callers, and displays the localized solo indicator instead of online room/connection status in solo mode.
- RingActivityLog accepts an optional opponentName prop; formatRingActivity accepts the same optional fourth argument and keeps its current seat label when omitted.

- [x] **Step 1: Add the solo entry callback and table labels**

Pass the player's hydrated profile and selected difficulty to startSinglePlayer. In a solo session show game.singlePlayer in the table heading instead of roomCode and show solo.opponent for B wherever GameScreen or RingActivityLog builds opponent display labels.

- [x] **Step 2: Derive interaction and status UI from sessionMode**

Treat solo as locally connected for canInteract, music activation, and finished-dock replay availability. Suppress connection-paused banners and connection-paused turn text only in solo mode; keep actual connection status behavior unchanged for online games. Pass sessionMode into DebugPanel so it never labels a local match as disconnected.

~~~tsx
const isSinglePlayer = sessionMode === 'single-player';
const canInteract = isPlaying && (isSinglePlayer || connectionStatus === 'connected');
const music = useBackgroundMusic(Boolean(
  roomSnapshot?.phase === 'playing' &&
  (isSinglePlayer || connectionStatus === 'connected') &&
  !leavingRoom,
));
~~~

- [x] **Step 3: Preserve existing rematch and effects for solo mode**

Keep the existing setReady(true) call for the finished-dock action so the store restarts the same difficulty. Ensure AI ring and flip versions flow through the existing snapshot effect, sound, bell animation, card transfer animation, winner sound, and paired deck counts. The Store increments roomSessionVersion on every new solo match so old event versions are not replayed as new events.

### Task 5: Run the requested compile check

**Files:**
- No file changes in this task.

- [x] **Step 1: Run TypeScript typecheck**

Run: npm run typecheck

Expected: TypeScript exits with code 0. Fix only errors caused by the solo-mode implementation; do not add or run tests.

## Self-Review

- Entry, three difficulty values, game rules, AI ring/flip behavior, timeout, replay, exit, localization, mode-aware connection UI, feedback animations, and network isolation each have an implementation task.
- The controller callback, Store session mode, RoomEntry callback, and DebugPanel session mode are defined consistently across tasks.
- No backend or wire protocol change is planned, and no test files are to be modified or executed.
- Existing uncommitted dual-deck work is explicitly preserved; do not stage or commit the mixed dirty files as part of solo implementation.
