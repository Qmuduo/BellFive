# BellFive 微信小程序与账号系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 Expo/Web 的前提下，交付完整的 BellFive 微信小程序，并让线上房间使用持久账号和跨端同步的昵称头像。

**Architecture:** 新增独立 Taro/React 微信小程序，复用无平台依赖的游戏规则、协议和客户端状态工厂。现有 Node 服务增加 SQLite 账号、认证 HTTP API 与 WebSocket 会话认证；Expo/Web 使用用户名密码，小程序用 `wx.login` 自动建档并支持绑定同一 BellFive 账号。

**Tech Stack:** Expo SDK 57、React Native、React 19、TypeScript、Zustand、Node.js 24、WebSocket (`ws`)、SQLite (`better-sqlite3`)、Taro 4.3、React 18、微信小程序开发者工具。

## Global Constraints

- 游客可玩单机，线上大厅与好友房需要登录。
- 房间、牌局及对局历史持久化不在本期范围；房间继续进程内存储。
- 微信小程序 AppSecret 只存在服务端环境变量，不能放进小程序产物、Expo bundle 或 Web 客户端。
- 首期用户名密码找回仅对已绑定微信身份的账号开放。
- 绑定冲突不得静默覆盖或合并已有凭据。
- 保留现有 Expo 客户端，不迁移或替换现有 Expo 客户端。
- 当前工作区已有未提交的 UI 文件和文档。执行前保留这些改动，功能提交只暂存本计划实际改动的文件。

---

## 文件结构与边界

- `server/src/auth/`：SQLite 初始化、账号仓库、密码派生、会话令牌、微信 code 兑换与账号服务。HTTP 层通过服务接口调用这些模块，不直接写 SQL。
- `server/src/auth/httpApi.ts`：处理账号 JSON 请求、请求体限制、CORS 和统一错误响应。
- `server/src/websocketServer.ts`：保留 `/health`，认证 WebSocket 首消息，在连接上下文中记录已验证的账号资料。
- `server/src/roomManager.ts`：继续管理内存房间；玩家昵称头像由认证上下文传入，不由网络消息决定。
- `src/network/protocol.ts`、`src/network/GameClient.ts`：定义会话握手和认证后的游戏消息流。客户端重连时重复认证。
- `src/auth/`：跨端 DTO、注入式 HTTP transport、认证 API 和可注入持久化的 Zustand store。不得依赖 React Native 或 Taro 运行时。
- `src/store/createGameStore.ts`、`createProfileStore.ts`、`createSettingsStore.ts`：抽出可被多个客户端注入依赖的工厂；现有 `gameStore.ts`、`profileStore.ts`、`settingsStore.ts` 保留 Expo 默认适配。
- `src/components/AuthScreen.tsx`、`AccountSettings.tsx` 与 `app/auth.tsx`、`app/account.tsx`：Expo/Web 注册、登录、退出、资料及账号凭据管理界面。
- `miniprogram/`：独立 npm/Taro 工程及微信小程序页面。使用项目自己的 React/Taro 依赖和 TypeScript 配置；编译配置显式包含仓库根目录下的共享 `src/`。
- `miniprogram/src/platform/`：微信端 HTTP、WebSocket、异步存储、音频/震动和动画适配。
- `miniprogram/src/pages/`：入口/大厅、账号、等待房间和牌桌页面；仅小程序层依赖 Taro 组件和 API。
- `server/README.md`、`docs/中文操作手册.md`、`server/.env.example`：本地服务、数据库持久化和小程序域名/凭据配置说明。

## 实施任务

### Task 1: 建立账号数据模型与 SQLite 仓库

**Files:**

- Create: `server/src/auth/types.ts`
- Create: `server/src/auth/database.ts`
- Create: `server/src/auth/repository.ts`
- Create: `server/src/auth/crypto.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server/tsconfig.json`

**Interfaces:**

- `AuthUser`: `{ userId: string; username: string | null; profile: PlayerProfile; wechatLinked: boolean }`
- `AuthPrincipal`: `{ userId: string; username: string | null; profile: PlayerProfile }`
- `AuthSession`: `{ token: string; expiresAt: number; user: AuthUser }`
- `openAuthDatabase(path: string): Database.Database`
- `AuthRepository`: `createPasswordUser`, `createWechatUser`, `findByUsername`, `findByWechatIdentity`, `attachWechatIdentity`, `transferWechatIdentity`, `addPasswordCredential`, `updatePasswordCredential`, `updateProfile`, `createSession`, `findSessionByTokenHash`, `revokeSession`, and `revokeUserSessions`.

- [ ] **Step 1: Add SQLite runtime and type packages**

  Add `better-sqlite3@13.0.3` to runtime dependencies and `@types/better-sqlite3@9.6.0` to development dependencies. Keep the Taro dependencies out of the root Expo package.

- [ ] **Step 2: Define account and session types**

  In `server/src/auth/types.ts`, use existing `PlayerProfile` and export the four interfaces above. Represent absent username as `null`; use the stable internal user ID for authorization and room ownership.

- [ ] **Step 3: Create the SQLite schema and open helper**

  In `database.ts`, export `openAuthDatabase(path)`; create the parent directory recursively with `node:fs`, enable `PRAGMA foreign_keys = ON` and WAL, and execute idempotent schema initialization. Create `users`, `password_credentials`, `wechat_identities`, and `sessions` tables. Make `username_normalized` unique; make `(app_id, openid)` unique; reference `users.id` with foreign keys. Use `BELLFIVE_AUTH_DB_PATH`, defaulting to `server/data/bellfive.sqlite`.

- [ ] **Step 4: Implement repository transactions**

  Implement the listed repository methods with parameterized statements. Password-account creation writes user plus password credential in one transaction; first-time WeChat login writes a WeChat-only user plus identity in one transaction. Keep `addPasswordCredential` insert-only; `updatePasswordCredential` replaces the salt/digest for an existing credential after the service verifies the linked WeChat identity. WeChat identity transfer updates the identity row and revokes the temporary user’s sessions in one transaction. Store only normalized username, salt, derived password digest, app ID, openid, profile fields, and token digests; never store raw passwords or session tokens.

- [ ] **Step 5: Implement password and token primitives**

  In `crypto.ts`, use `node:crypto` `scrypt` with a fresh random salt for each password. Compare derived digests with `timingSafeEqual`. Generate 32 random bytes for a session token, return its base64url form once, and persist only its SHA-256 digest. Set a 30-day session expiry and use the same expiry check in repository lookups.

- [ ] **Step 6: Type-check the server boundary**

  Run `npm run server:typecheck`. Fix only type errors introduced by the new files before proceeding.

### Task 2: Implement auth service and WeChat identity flows

**Files:**

- Create: `server/src/auth/service.ts`
- Create: `server/src/auth/wechat.ts`
- Modify: `server/src/auth/repository.ts`
- Modify: `server/src/auth/types.ts`

**Interfaces:**

- `AuthService.register(input, initialProfile): Promise<AuthSession>`
- `AuthService.login(username, password): Promise<AuthSession>`
- `AuthService.loginWithWechat(code): Promise<AuthSession>`
- `AuthService.bindWechat(input: { code: string; username: string; password: string; confirmedTransfer: boolean }): Promise<AuthSession>`
- `AuthService.addPasswordCredential(userId, username, password): Promise<AuthUser>`
- `AuthService.resetPasswordWithWechat(code, newPassword): Promise<AuthSession>`
- `AuthService.authenticateToken(token): Promise<AuthPrincipal | null>`
- `AuthService.updateProfile(userId, profile): Promise<PlayerProfile>`
- `AuthService.logout(token): Promise<void>`
- The repository exposes one transaction operation for password reset that replaces the existing credential, revokes existing user sessions, and creates the replacement session atomically.

- [ ] **Step 1: Define username/password validation**

  Normalize usernames with `trim().toLowerCase()`. Accept 3–24 ASCII characters matching `^[A-Za-z0-9_]{3,24}$`. Require passwords to contain 8–128 Unicode code points. Use distinct service errors `USERNAME_TAKEN`, `INVALID_CREDENTIALS`, `INVALID_INPUT`, `WECHAT_CODE_INVALID`, `WECHAT_NOT_CONFIGURED`, and `WECHAT_IDENTITY_CONFLICT`.

- [ ] **Step 2: Add the server-side WeChat code exchanger**

  In `wechat.ts`, call WeChat’s `jscode2session` endpoint from server-side `fetch`; read `BELLFIVE_WECHAT_MINI_APP_ID` and `BELLFIVE_WECHAT_MINI_APP_SECRET` only from `process.env`. Return the app ID and openid to the service. Do not request or persist WeChat nickname/avatar fields.

- [ ] **Step 3: Implement account/password registration and login**

  In `service.ts`, create a user and credential transactionally. On login, look up the normalized username, verify `scrypt` digest using constant-time comparison, then re-read and compare the credential before creating a session so a concurrent password reset cannot authenticate the old password. Return the same `INVALID_CREDENTIALS` error for missing username or wrong password. On success create a persisted opaque session and return `AuthSession`.

- [ ] **Step 4: Implement automatic WeChat registration and account linking**

  `loginWithWechat` resolves `(appId, openid)`; create a default-profile user if no identity exists, otherwise return its current user session. `bindWechat` first verifies the target username/password, exchanges the WeChat code, then re-reads and compares the credential before mutating identity ownership so a concurrent password reset cannot bind with a stale password. If the identity belongs to a WeChat-only user, require an explicit `confirmedTransfer: true` in the input and transactionally move it to the target account; keep the target account profile and revoke temporary-user sessions. Reject an identity already attached to another username account.

- [ ] **Step 5: Implement credential addition, profile, reset, and logout**

  `addPasswordCredential` refuses a username used by another user and attaches credentials to the authenticated WeChat user. `resetPasswordWithWechat` requires an identity already linked to the credential account; replace the credential, revoke previous sessions, and create the returned replacement session in one repository transaction. `updateProfile` sanitizes the existing nickname/avatar shape from `src/profile.ts`. `logout` revokes only the presented session.

- [ ] **Step 6: Type-check the service layer**

  Run `npm run server:typecheck`; ensure the service’s public return types match `AuthUser`, `AuthSession`, and `AuthPrincipal` before exposing HTTP routes.

### Task 3: Expose authenticated HTTP API and configuration

**Files:**

- Create: `server/src/auth/httpApi.ts`
- Create: `server/.env.example`
- Modify: `server/src/auth/service.ts`
- Modify: `server/src/websocketServer.ts`
- Modify: `server/src/index.ts`
- Modify: `server/README.md`

**Interfaces:**

- `handleAuthHttpRequest(request, response, authService, config): Promise<boolean>` returns `true` when the request path belongs to `/auth/` or `/health`.
- `parseBearerToken(request): string | null` accepts only one `Authorization: Bearer <token>` value.
- `AuthService.getUser(userId): Promise<AuthUser>` returns the canonical account profile and WeChat-linked status for authenticated self-service responses.

- [ ] **Step 1: Add bounded JSON and CORS handling**

  In `httpApi.ts`, accept JSON bodies no larger than 16 KiB, reject malformed JSON with `400 INVALID_JSON`, reject oversized bodies with `413 BODY_TOO_LARGE`, and respond to `OPTIONS` using origins listed in `BELLFIVE_CORS_ORIGINS`. Preserve the current `GET /health` response.

- [ ] **Step 2: Map the approved account operations to HTTP**

  Add `POST /auth/register` with `{ username, password, initialProfile? }`, `POST /auth/login` with `{ username, password }`, `POST /auth/wechat/login` with `{ code }`, `POST /auth/wechat/link` with `{ code, username, password, confirmedTransfer }`, `POST /auth/credentials` with `{ username, password }`, `GET /auth/me`, `PATCH /auth/me/profile` with `{ profile }`, `POST /auth/password/reset/wechat` with `{ code, newPassword }`, and `POST /auth/logout`. Use the bearer token for routes that modify or read the current account. Successful login routes return `AuthSession`; profile routes return `AuthUser`. Respond with `{ error: { code, message } }` on failure and never include password digests, openids, AppSecret, or raw session tokens in logs.

- [ ] **Step 3: Wire HTTP requests into the existing server**

  Pass a single `AuthService` instance into `createWebSocketServer`. Route health/auth paths through `handleAuthHttpRequest`; keep unknown paths as JSON `404`. Allow the Web app origin only from `BELLFIVE_CORS_ORIGINS`; do not use wildcard CORS with account credentials.

- [ ] **Step 4: Initialize and close persistence with the server lifecycle**

  In `server/src/index.ts`, create the auth database and repository before starting the HTTP/WebSocket listener. Route WebSocketServer and HTTP listener startup errors into one handled startup failure path; close the HTTP/WebSocket resources and SQLite handle if binding fails. On normal shutdown, close the SQLite handle after the WebSocket server stops. Add example values for database path, mini-program AppID/Secret, CORS origins, and port in `server/.env.example`; keep all real secrets out of tracked files.

- [ ] **Step 5: Document local account-service startup**

  Update `server/README.md` with the Node 22+ runtime requirement for `better-sqlite3@13.0.3`, the persistent database path, environment variables, HTTPS requirement for WeChat login, and separate request/WebSocket domain allowlists.

- [ ] **Step 6: Build/type-check the server entry point**

  Run `npm run server:typecheck` and start `npm run server:dev` with absent WeChat credentials. Confirm `/health` and username/password registration/login remain available, while WeChat login/link/reset return structured `WECHAT_NOT_CONFIGURED` errors rather than crashing the listener. Add a focused occupied-port check proving startup failure is handled and does not leave the database open.

### Task 4: Authenticate WebSocket sessions and use server-owned profiles

**Files:**

- Modify: `src/network/protocol.ts`
- Modify: `src/network/GameClient.ts`
- Modify: `src/store/gameStore.ts`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/RoomEntry.tsx`
- Modify: `server/src/websocketServer.ts`
- Modify: `server/src/roomManager.ts`

**Interfaces:**

- Client protocol adds `{ type: 'session.authenticate'; token: string }`.
- Server protocol adds `{ type: 'session.authenticated'; userId: string }`.
- `GameClientOptions` adds `authToken: string` and continues to accept `webSocketFactory(url): SocketLike`.
- `GameClientFactory(handlers, authToken): GameClientPort`; `createGameStore(clientFactory, authTokenProvider)` obtains the credential without importing platform storage.
- Online store/client actions become `createRoom(): string`, `joinRoom(code): string`, and `applyToRoom(code): string`; they no longer accept a client profile.
- `RoomManager.handleMessage(connectionId, message, principal: AuthPrincipal)` receives identity/profile only from server connection state.

- [ ] **Step 1: Add protocol handshake messages**

  Extend `ClientMessage`/`ServerMessage` decoders for the auth handshake. Online room `create` and `join` messages carry request IDs and room codes only; remove the optional `profile` fields from `GameClientPort`, `GameStore`, and `GameClient` room methods, and update existing `GameScreen`/`RoomEntry` callers to omit profile arguments. Leave login gating/navigation for Task 5.

- [ ] **Step 2: Gate each WebSocket connection before room actions**

  Track each connection as `{ socket, principal: AuthPrincipal | null, authTimer }`. Start a 5-second auth deadline. Accept only `session.authenticate` until `AuthService.authenticateToken` succeeds; then store its principal and send `session.authenticated`. Close unauthenticated, invalid-token, and expired-token sockets with close code `4401`; clear the timer on auth or close.

- [ ] **Step 3: Pass authenticated identity into RoomManager**

  For every post-handshake room/game message, call `RoomManager.handleMessage(connectionId, message, principal)`. Derive the seat profile from `principal.profile`; retain `userId` on the seat for stable account identity. Reject a second seat in the same room if it is the same `userId`.

- [ ] **Step 4: Make GameClient authenticate before flushing queued room messages**

  On socket open, send `session.authenticate` with the configured token. Buffer the pending room request and lobby subscription until `session.authenticated`; only then flush them. Repeat the handshake after every reconnect. If authentication is rejected, stop reconnecting, clear room state, and report `AUTH_REQUIRED` to the store.

- [ ] **Step 5: Add token-provider injection to GameStore**

  Change `GameClientFactory` to receive `(handlers, authToken)` and add `authTokenProvider: () => string | null` to `createGameStore`. Do not construct an online client or flush room/lobby requests when the provider returns `null`; report `AUTH_REQUIRED`. Task 5 connects the provider to the persisted auth store.

- [ ] **Step 6: Confirm server protocol type compatibility**

  Run root and server TypeScript checks. Confirm all online calls supply an authenticated principal and the protocol decoder rejects malformed handshake payloads.

### Task 5: Add Expo/Web account screens and profile synchronization

**Files:**

- Create: `src/auth/contracts.ts`
- Create: `src/auth/AuthClient.ts`
- Create: `src/auth/createAuthStore.ts`
- Create: `src/auth/authStore.ts`
- Create: `src/auth/nativeTransport.ts`
- Create: `src/components/AuthScreen.tsx`
- Create: `src/components/AccountSettings.tsx`
- Create: `app/auth.tsx`
- Create: `app/account.tsx`
- Create: `src/store/createProfileStore.ts`
- Create: `src/store/createSettingsStore.ts`
- Modify: `src/store/profileStore.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/RoomEntry.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**

- `AuthTransport(request: { method: 'GET' | 'POST' | 'PATCH'; path: string; token?: string; body?: unknown }): Promise<unknown>`
- `AuthClient.register`, `login`, `wechatLogin`, `linkWechat`, `addCredentials`, `me`, `updateProfile`, `resetPasswordWithWechat`, and `logout` map to Task 3 endpoints.
- `createAuthStore(storage: StateStorage, client: AuthClient)` exposes `user`, `sessionToken`, `hydrated`, `login`, `register`, `updateProfile`, and `logout`.
- Shared store factories accept `StateStorage`; native wrappers continue to default to `getDefaultStorage()`.

- [ ] **Step 1: Define auth DTOs and an injected HTTP client**

  In `contracts.ts`, mirror the server `AuthUser`/`AuthSession` JSON shapes. Implement `AuthClient` over an injected `AuthTransport`; keep `fetch` and Expo environment variables in a native-only adapter so the shared client has no platform globals.

- [ ] **Step 2: Separate store factories from Expo storage bindings**

  Extract the bodies of the profile/settings factories into `createProfileStore.ts` and `createSettingsStore.ts`. Keep `profileStore.ts` and `settingsStore.ts` as Expo wrappers using `getDefaultStorage()`. Add an Expo auth store wrapper using `AsyncStorage` and native `fetch` transport.

- [ ] **Step 3: Add registration and login routes**

  Implement `AuthScreen` with username, password, confirm-password on registration, loading state, password visibility, and localized validation/error copy. `app/auth.tsx` renders it; pass `returnTo` and optional `roomCode` as Expo Router params. After login, return to the entry screen with the room code preserved; the user can retry the room action.

- [ ] **Step 4: Add account/profile settings**

  Implement `AccountSettings` with username, WeChat-bound status, nickname, avatar, first-time username/password setup for WeChat-only accounts, password-reset instructions, and logout. Save authenticated profile changes through `PATCH /auth/me/profile`; save guest changes in the existing local profile store. Password reset is available through the already-linked WeChat identity; do not expose a password-change action without a corresponding approved endpoint.

- [ ] **Step 5: Gate only online actions and preserve guest solo**

  In `RoomEntry`/`GameScreen`, show account status and a login/register control. Remove client profile arguments from online create/join callbacks. If a guest selects lobby, create room, or join by room code, navigate to `app/auth.tsx` with `returnTo` and the current `roomCode`, then return to the entry screen so the user can retry. Keep the single-player difficulty controls available without an account.

  In `gameStore.ts`, pass `useAuthStore.getState().sessionToken` as the `authTokenProvider` to `createGameStore`. Dispose and recreate the online client when login, logout, or account switching changes the token.

- [ ] **Step 6: Switch online UI to server profile after login**

  Use `AuthUser.profile` while authenticated and the local profile only in guest mode. Initialize the account profile from local values at registration; after later logins, overwrite the authenticated local cache with the server profile. Add translations for auth fields, account actions, and credential errors in English and Simplified Chinese.

- [ ] **Step 7: Type-check Expo/Web**

  Run `npm run typecheck`; resolve errors without changing the existing uncommitted visual files except where `GameScreen` or `RoomEntry` needs auth integration.

### Task 6: Scaffold Taro and extract portable game/store boundaries

**Files:**

- Create: `miniprogram/package.json`
- Create: `miniprogram/package-lock.json`
- Create: `miniprogram/tsconfig.json`
- Create: `miniprogram/config/index.ts`
- Create: `miniprogram/config/dev.ts`
- Create: `miniprogram/config/prod.ts`
- Create: `miniprogram/project.config.json`
- Create: `miniprogram/src/app.tsx`
- Create: `miniprogram/src/app.config.ts`
- Create: `miniprogram/src/app.scss`
- Create: `miniprogram/src/platform/storage.ts`
- Create: `miniprogram/src/platform/socket.ts`
- Create: `miniprogram/src/platform/feedback.ts`
- Create: `src/store/createGameStore.ts`
- Modify: `src/store/gameStore.ts`
- Modify: `package.json`
- Modify: `tsconfig.json`

**Interfaces:**

- `createGameStore(clientFactory: GameClientFactory, authTokenProvider: () => string | null)` exports the pure store factory without choosing a platform URL/socket/storage.
- `createTaroStorage(): StateStorage` wraps Taro async storage APIs.
- `createTaroSocket(url): SocketLike` wraps `Taro.connectSocket` events and `send/close` to the existing `GameClient` contract.
- `playMiniFeedback(kind)` supports the shared correct/wrong/flip/finish feedback events and degrades to no-op when disabled/unavailable.

- [ ] **Step 1: Create an isolated Taro package**

  Add `miniprogram/package.json` using `@tarojs/*` packages all at `4.3.0` and React/React DOM `18.2.0`; use its own lockfile and `node_modules` so Taro dependencies do not alter the Expo React 19 dependency graph. Define `build:weapp` as `taro build --type weapp` and `dev:weapp` as `taro build --type weapp --watch`.

- [ ] **Step 2: Configure Taro compilation of shared source**

  In `config/index.ts`, set the source root to `src`, output to `dist`, React framework, and `mini.compile.include: [path.resolve(__dirname, '../../src')]`. Add the generated WeChat `project.config.json` with `miniprogramRoot: 'dist/'` and the public `touristappid` placeholder. Document local overrides in ignored `project.private.config.json`; do not commit an owner-specific AppID or secret.

- [ ] **Step 3: Add root Mini build commands and typecheck separation**

  Add `miniprogram:dev` mapping to `npm --prefix miniprogram run dev:weapp` and `miniprogram:build` mapping to `npm --prefix miniprogram run build:weapp` in root `package.json`. Keep root `tsconfig.json` excluding `miniprogram`; the Mini package has its own `tsconfig.json` that includes its source and the shared files.

- [ ] **Step 4: Extract the reusable GameStore factory**

  Move the `createGameStore` implementation and its public types from `src/store/gameStore.ts` into `src/store/createGameStore.ts`. Leave `gameStore.ts` responsible for constructing the Expo singleton with the existing environment URL, native socket factory, and `useAuthStore.getState().sessionToken` provider. Preserve the `(handlers, authToken)` client factory signature from Task 4.

- [ ] **Step 5: Implement Taro storage and WebSocket adapters**

  In `storage.ts`, implement the `StateStorage` promise methods with Taro storage APIs. In `socket.ts`, translate `Taro.connectSocket` open/message/close/error events into `SocketLike` and preserve only string message bodies. Do not use browser `WebSocket` in the Mini runtime.

- [ ] **Step 6: Add Mini config and run a starter build**

  Add the app entry and config files, then run `npm --prefix miniprogram run build:weapp`. Confirm the output is in `miniprogram/dist` and the project opens in WeChat Developer Tools.

### Task 7: Add Mini auth, profile, entry and room lifecycle

**Files:**

- Create: `miniprogram/src/platform/authTransport.ts`
- Create: `miniprogram/src/store/authStore.ts`
- Create: `miniprogram/src/store/gameStore.ts`
- Create: `miniprogram/src/store/profileStore.ts`
- Create: `miniprogram/src/store/settingsStore.ts`
- Create: `miniprogram/src/components/WechatLoginPrompt.tsx`
- Create: `miniprogram/src/components/ExistingAccountBinding.tsx`
- Create: `miniprogram/src/pages/index/index.tsx`
- Create: `miniprogram/src/pages/index/index.scss`
- Create: `miniprogram/src/pages/account/index.tsx`
- Create: `miniprogram/src/pages/account/index.scss`
- Create: `miniprogram/src/pages/waiting/index.tsx`
- Create: `miniprogram/src/pages/waiting/index.scss`
- Modify: `miniprogram/src/app.config.ts`
- Modify: `miniprogram/src/app.tsx`
- Modify: `miniprogram/src/platform/socket.ts`

**Interfaces:**

- Mini `AuthTransport` uses `Taro.request` and `Taro.getStorage`/`setStorage` for the same shared `AuthClient` contract.
- Mini auth store persists the BellFive session token and canonical profile with `createTaroStorage()`.
- Mini `createGameStore` creates `GameClient` with the WebSocket URL, authenticated token, and `createTaroSocket` factory.

- [ ] **Step 1: Implement Mini HTTP and storage adapters**

  In `authTransport.ts`, convert `Taro.request` responses to the shared `AuthTransport` shape, attach bearer authorization when a token is supplied, reject non-2xx responses with the server’s structured code/message, and read `EXPO_PUBLIC` variables nowhere in Mini code. Use `BELLFIVE_MINI_AUTH_URL`/`BELLFIVE_MINI_WS_URL` build-time values.

- [ ] **Step 2: Connect shared AuthClient and GameClient to Taro**

  Build Mini auth/game stores using the shared factories. Construct the profile store with `createProfileStore(createTaroStorage())` so guest profile edits persist, and construct the settings store with `createSettingsStore(createTaroStorage())` so language and audio settings persist. Resolve the token from Mini auth state before constructing an online client; recreate/disconnect the client after login, logout, or token replacement.

- [ ] **Step 3: Add guest entry and WeChat account entry**

  In the index page, provide single-player difficulty selection for guests plus the authenticated lobby controls. When an online action is selected, call `Taro.login`, send the code to `/auth/wechat/login`, persist the returned session, and resume the requested action. If `Taro.login` returns no code or fails, keep guest solo available and retain any room code so the user can retry. On network/service failure, show retry and keep the selected online action pending without opening a socket. `WechatLoginPrompt` provides the WeChat login action; `ExistingAccountBinding` collects username/password and calls `/auth/wechat/link` with the current code and `confirmedTransfer` only after the user confirms a transfer. On an identity conflict, show the server error and do not detach or overwrite either account.

- [ ] **Step 4: Add cross-client credential setup and account settings**

  In the account page, allow a WeChat-only user to set a unique username/password using `/auth/credentials`, edit nickname/avatar through `/auth/me/profile`, display whether WeChat is linked, and reset password through a freshly obtained WeChat code. Explain that an unbound username account has no first-release password recovery path.

- [ ] **Step 5: Port public lobby and join flow**

  Recreate open-room list, refresh, room-code validation, application status, host approval/rejection, application cancel, and room error states using Taro `View`, `Text`, `Input`, `Button`, and scroll components. Use the authenticated profile from the auth store.

- [ ] **Step 6: Port waiting-room controls**

  Show room code, host profile, pending requests and approve/reject actions, ready/cancel-ready, connection/reconnect status, leave room, and WeChat share. Preserve the existing two-player ready rule and do not start a match until both seats are connected and ready.

- [ ] **Step 7: Preview entry/auth/room states in Developer Tools**

  Build with `npm run miniprogram:build` and preview the guest entry, WeChat login fallback errors, account linking form, lobby empty/loading/error states, and waiting room at a phone-sized viewport.

### Task 8: Port Mini match UI and platform feedback

**Files:**

- Create: `miniprogram/src/pages/game/index.tsx`
- Create: `miniprogram/src/pages/game/index.scss`
- Create: `miniprogram/src/components/GameCard.tsx`
- Create: `miniprogram/src/components/BellButton.tsx`
- Create: `miniprogram/src/components/PlayerDeck.tsx`
- Create: `miniprogram/src/components/RingActivityLog.tsx`
- Create: `miniprogram/src/components/MatchStatus.tsx`
- Modify: `miniprogram/src/platform/feedback.ts`
- Modify: `miniprogram/src/app.config.ts`
- Modify: `miniprogram/src/app.tsx`

**Interfaces:**

- `GameCard({ card, revealed, orientation })` renders one shared `CardDefinition` using Taro components.
- `BellButton({ disabled, onPress })` is the single local-player ring action.
- `MatchStatus({ snapshot, localPlayerId })` renders turn, connection, countdown, winner and ready states.
- `RingActivityLog({ events, localPlayerId, language: Language })` formats the latest twelve shared ring events.

- [ ] **Step 1: Render the shared snapshot and card layout**

  Rebuild the current match arrangement with both player counts, top visible cards, turn, timer, current room state, and local player identity. Read `RoomSnapshot` and `CardDefinition` only; do not duplicate or reimplement game rules.

- [ ] **Step 2: Wire flip, ring, ready, leave and rematch controls**

  Call shared GameStore actions. Disable flip unless it is the local turn; keep the bell active during connected play when the shared rules permit it; suspend actions when the room is paused/finished. Reuse server snapshots for all online outcomes.

- [ ] **Step 3: Add Mini card and transfer animations**

  Use Taro-compatible CSS transitions/keyframes for card reveal, bell press, correct/wrong ring feedback, and collection/penalty movement. If a specific transition cannot be measured or animated in the Mini renderer, keep the state transition and use a short opacity/scale fallback.

- [ ] **Step 4: Add sound, vibration, language and log presentation**

  Implement short local audio and `Taro.vibrateShort` behind `feedback.ts`; honor the existing settings where shared and no-op when permissions or APIs are unavailable. Reuse `src/i18n/translations.ts` with a Mini-compatible language selector. Keep ring history at twelve entries as already defined by the protocol.

- [ ] **Step 5: Exercise the entire match flow in Developer Tools**

  Use two authenticated clients against one room server to check create/share/apply/approve/ready, flips, correct and wrong rings, reconnect pause, game over, and rematch. Check a guest can complete a full offline solo match when the account service is stopped.

- [ ] **Step 6: Build and type-check all client packages**

  Run `npm run miniprogram:build` and `npm run typecheck`. Resolve Mini-only imports accidentally leaking into the Expo bundle and Expo-only imports accidentally entering `miniprogram/dist`.

### Task 9: Document operations and complete cross-platform acceptance

**Files:**

- Modify: `server/.env.example`
- Modify: `server/README.md`
- Modify: `docs/中文操作手册.md`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `miniprogram/project.config.json`

- [ ] **Step 1: Document environment and persistent storage**

  List `BELLFIVE_AUTH_DB_PATH`, `BELLFIVE_WECHAT_MINI_APP_ID`, `BELLFIVE_WECHAT_MINI_APP_SECRET`, `BELLFIVE_CORS_ORIGINS`, Expo auth/game URLs, and Mini auth/WebSocket URLs. Explain that the SQLite directory must survive service restarts and deployments.

- [ ] **Step 2: Document Mini Developer Tools configuration**

  Explain importing `miniprogram/` into WeChat Developer Tools, adding HTTPS request and WSS socket domains, setting the local AppID in ignored developer config, using test accounts, and switching to production domains before release.

- [ ] **Step 3: Ignore generated and secret files**

  Add `miniprogram/dist/`, Mini local project settings containing AppID, SQLite database/WAL/SHM files, and `.env` files to `.gitignore`. Leave `.env.example` tracked with blank/safe placeholders.

- [ ] **Step 4: Update Chinese user instructions**

  Add steps for Expo/Web username registration/login, guest solo play, Mini WeChat auto-registration, cross-client username binding, account recovery after WeChat binding, and clear password-recovery limitations for unbound accounts.

- [ ] **Step 5: Perform approved acceptance walkthrough**

  With test credentials configured, verify Expo/Web registration/login/logout and profile synchronization; Mini first-time WeChat login and returning login; linking a Mini WeChat identity to an existing username account; adding username/password credentials to a WeChat-only account and using them on Expo/Web; username/identity conflict errors; guest solo without the server; authenticated room auth rejection; public lobby/approval/ready/full match/rematch across two clients.

- [ ] **Step 6: Confirm external-configuration boundary**

  Record which real-device flows were exercised. If no AppID/AppSecret or approved service domains are available, report WeChat real-account login as not verified and leave all server-secret placeholders empty.

## Plan Self-Review

- The approved spec’s account store, password auth, automatic WeChat registration, both binding directions, profile sync, session expiry, WebSocket identity, guest solo, lobby, room approval, ready flow, gameplay, audio/animation adaptation, persistence boundary, recovery rule, and external WeChat configuration each have implementation tasks above.
- The Mini dependency graph is isolated from Expo’s React 19 dependencies; shared modules are restricted to domain rules, protocol, auth contracts, and injected store/client factories.
- Auth principal fields use `userId`, `username`, and `profile` consistently across server types and the WebSocket boundary.
- No database file, auth token, Mini AppSecret, or generated Mini build output is committed.
- Existing user changes in the dirty worktree remain outside feature commits.

## References

- [Taro documentation](https://docs.taro.zone/docs/)
- [Taro configuration reference](https://docs.taro.zone/docs/config-detail/)
- [Expo documentation](https://docs.expo.dev/)
