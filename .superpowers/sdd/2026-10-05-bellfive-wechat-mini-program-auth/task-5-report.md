# Task 5 report

Status: implementation complete; focused verification passed. Commit: Task 5 implementation commit (hash provided in handoff).

## Changes

- Added platform-neutral auth DTOs and an injected AuthClient for username/password, WeChat login/link, credential setup, profile update, reset, and logout API calls.
- Added a persisted Zustand auth-store factory with session-expiry validation, unauthorized-session clearing, canonical server profile state, and injected storage/client dependencies. Expo binds it through AsyncStorage and a native-only fetch adapter.
- Extracted injectable profile/settings store factories while preserving the Expo singleton wrappers.
- Added localized Expo/Web registration and login screens, account/profile settings, and Expo Router routes. Guest profile edits stay local; signed-in profile edits use the account API and refresh an active lobby.
- Gated lobby/create/join behind auth while retaining guest solo controls and preserving a join code through login. Added an auth-hydration guard to prevent transient online/auth UI routing before persisted session restoration finishes.
- Wired the session token into the online game store and added client disposal/reset on token changes. Preserved active solo play through online-client lifecycle changes.
- Uses canonical AuthUser.profile while signed in and synchronizes it to the local cache after login.

## Test-first evidence

Focused tests were added before their implementations. Initial red runs confirmed missing auth DTO/client/store and UI modules, the missing injectable profile/settings factories, guest online actions still being available, and missing online-client reset behavior. Additional regressions first failed for expired persisted sessions, unauthorized session invalidation, WeChat login store support, and the auth-hydration transition. Those failures passed after the corresponding implementations.

## Final exact verification commands and outputs

### Auth, store, UI, and translations

Command:
~~~powershell
npx jest src/auth/__tests__/AuthClient.test.ts src/auth/__tests__/authStore.test.ts src/store/__tests__/profileStore.test.ts src/store/__tests__/settingsStore.test.ts src/store/__tests__/gameStoreAuth.test.ts src/components/__tests__/AuthScreen.test.tsx src/components/__tests__/AccountSettings.test.tsx src/components/__tests__/RoomEntry.test.tsx src/i18n/__tests__/translations.test.ts --runInBand
~~~

Exit code: 0.
~~~text
Test Suites: 9 passed, 9 total
Tests:       55 passed, 55 total
Snapshots:   0 total
~~~

### GameScreen online-flow integration

Command:
~~~powershell
npx jest src/components/__tests__/GameScreen.test.tsx --runInBand --testNamePattern="starts at the create/join|renders public rooms and routes an application|opens the public lobby after a room leave|sends normalized join codes"
~~~

Exit code: 0.
~~~text
Test Suites: 1 passed, 1 total
Tests:       29 skipped, 4 passed, 33 total
Snapshots:   0 total
~~~

### TypeScript

Command: npm run typecheck

Exit code: 0.
~~~text
> bellfive@1.0.0 typecheck
> tsc --noEmit
~~~

### Diff whitespace

Command: git diff --check

Exit code: 0. It emitted only Windows line-ending conversion warnings for src/store/__tests__/gameStoreAuth.test.ts, src/store/profileStore.ts, and src/store/settingsStore.ts.

## UI self-critique

The auth and account screens use the existing gameColors and project controls, with a compact BellFive cue (bell mark and five fruit-card chips) to connect the forms to the card game without turning them into a generic login template. Form hierarchy stays primary; the screens include password visibility, clear validation/error states, scrollable content, and accessible labels for smaller screens and keyboard use. I kept the project typography instead of introducing a new display font. The main limitation in the design review is that I verified structure and behavior through component tests and typecheck, not a live device/browser preview.

## Limitations and known baseline

- Expo/Web has no WeChat Mini Program runtime and cannot call wx.login; password reset with WeChat is exposed in the shared API/store but the Expo account screen gives recovery guidance instead of pretending it can obtain a fresh WeChat code. Complete reset interaction belongs in the Mini Program client.
- Expo Router route behavior was typechecked and covered through component/entry integration tests, but not manually exercised in a running Expo browser/device session.
- No password-change endpoint or unsupported password-change UI was added.
- The approved baseline ledger records five unrelated existing UI failures (three GameScreen and two BellButton). This Task 5 work leaves those expectations and visual snapshot state unchanged. The focused final commands above pass.

\n

## Independent review follow-up

The read-only review and root review identified three P2 lifecycle races; all are fixed in the follow-up commit:

- Guest sign-in and guest profile editing stay disabled until the local profile store hydrates. The Auth route allows login immediately but blocks switching into registration until the local profile is available, including when opened directly or from Account Settings.
- A delayed UNAUTHORIZED from a token-bound action now clears auth only if that same token remains current. Successful delayed profile/credential responses also cannot replace a newer account's user state.
- Persisted, unexpired sessions now refresh with GET /auth/me before auth hydration completes. An unauthorized response clears that session. A network failure retains the session for retry but marks its cached profile unverified; updateProfile refuses to send PATCH until a server profile has been refreshed or a fresh login establishes canonical state.

### Follow-up test-first evidence

Before production changes, the focused regression command failed as expected with 7 failing tests across hydration gates, stale 401 invalidation, canonical persisted-session refresh, unauthorized refresh, and network-failure write protection:

~~~powershell
npx jest src/components/__tests__/RoomEntry.test.tsx src/components/__tests__/AccountSettings.test.tsx src/components/__tests__/AuthScreen.test.tsx src/auth/__tests__/authStore.test.ts --runInBand -t 'saved local profile|saved guest profile|registration before|newer session|canonical server profile|canonical session refresh|canonical refresh failed|clears a persisted session when the app was closed'
~~~

After the implementation:

~~~powershell
npx jest src/auth/__tests__/AuthClient.test.ts src/auth/__tests__/authStore.test.ts src/store/__tests__/profileStore.test.ts src/store/__tests__/settingsStore.test.ts src/store/__tests__/gameStoreAuth.test.ts src/components/__tests__/AuthScreen.test.tsx src/components/__tests__/AccountSettings.test.tsx src/components/__tests__/RoomEntry.test.tsx src/i18n/__tests__/translations.test.ts --runInBand
~~~

Exit code: 0; 9 suites and 62 tests passed.

~~~powershell
npx jest src/components/__tests__/GameScreen.test.tsx --runInBand --testNamePattern="starts at the create/join|renders public rooms and routes an application|opens the public lobby after a room leave|sends normalized join codes"
~~~

Exit code: 0; 4 passed, 29 skipped.

~~~powershell
npm run typecheck
~~~

Exit code: 0.

~~~powershell
git diff --check
~~~

Exit code: 0; only Git's LF-to-CRLF informational warnings remain.

### Exact final focused output

The auth/store/UI/translations command returned:

~~~text
PASS src/components/__tests__/RoomEntry.test.tsx (6.793 s)
PASS src/components/__tests__/AccountSettings.test.tsx
PASS src/components/__tests__/AuthScreen.test.tsx
PASS src/store/__tests__/settingsStore.test.ts
PASS src/auth/__tests__/authStore.test.ts
PASS src/store/__tests__/profileStore.test.ts
PASS src/i18n/__tests__/translations.test.ts
PASS src/store/__tests__/gameStoreAuth.test.ts
PASS src/auth/__tests__/AuthClient.test.ts

Test Suites: 9 passed, 9 total
Tests:       62 passed, 62 total
Snapshots:   0 total
Time:        12.65 s
~~~

The GameScreen online-flow filter returned:

~~~text
PASS src/components/__tests__/GameScreen.test.tsx (6.295 s)

Test Suites: 1 passed, 1 total
Tests:       29 skipped, 4 passed, 33 total
Snapshots:   0 total
Time:        6.948 s
~~~

Root typecheck returned:

~~~text
> bellfive@1.0.0 typecheck
> tsc --noEmit
~~~

The final TDD red run returned:

~~~text
Test Suites: 4 failed, 4 total
Tests:       7 failed, 18 skipped, 25 total
Snapshots:   0 total
~~~

### Offline retry UI

Account Settings now displays a localized refresh-in-progress or refresh-required message for an unverified cached profile. It keeps profile fields/avatar/save disabled until canonical data is verified and offers a refresh retry after initial auth hydration settles. The retry calls GET /auth/me; a successful response updates the displayed canonical profile, while another network failure preserves the cached session and keeps writes disabled.

### Final rerun after offline retry UI

~~~text
Test Suites: 9 passed, 9 total
Tests:       63 passed, 63 total
Snapshots:   0 total
Time:        13.211 s
~~~

GameScreen online-flow filter:

~~~text
Test Suites: 1 passed, 1 total
Tests:       29 skipped, 4 passed, 33 total
Snapshots:   0 total
Time:        7.562 s
~~~

The final root typecheck again exited 0 with:

~~~text
> bellfive@1.0.0 typecheck
> tsc --noEmit
~~~
