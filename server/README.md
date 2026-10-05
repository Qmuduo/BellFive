# BellFive friend-room service

This Node.js service owns accounts, room seats, shuffled decks, turns, ring decisions, and the complete game state. Accounts and hashed sessions persist in SQLite. Room data lives in memory; restarting the process clears every room.

Leaving a room closes it for both players. The leaving phone returns to room entry after the server acknowledges the request; a connected opponent receives a room-closed notice and returns to entry as well. If that opponent is offline, its next reconnect discovers that the room has closed.

Rooms with one connected player appear in the public lobby for that running service process. A second player can apply from the room list or enter the room code; both paths require approval from the host. The match and every rematch start only after both connected seats send `room.ready`. Snapshots carry the same latest twelve ring/penalty events to both players, and the history clears when a new match starts. Restarting the service clears its rooms and lobby list.

## Run locally

Use **Node.js 22 or later** for the pinned `better-sqlite3@13.0.3` native dependency. From the repository root:

```powershell
npm ci
$env:BELLFIVE_AUTH_DB_PATH = "server/data/bellfive.sqlite"
$env:BELLFIVE_CORS_ORIGINS = "http://localhost:8081"
npm run server:dev
```

The service listens on `0.0.0.0:8787` by default. Check it from another terminal:

```powershell
Invoke-RestMethod http://localhost:8787/health
```

Expected response:

```json
{"status":"ok"}
```

Accounts are stored at `server/data/bellfive.sqlite` by default, relative to the process working directory (the repository root when using the commands above). The directory is created on startup. For a deployment, set `BELLFIVE_AUTH_DB_PATH` to a stable path on a mounted persistent volume; keep that volume attached when replacing or redeploying the service. The database contains account profiles, password hashes, linked WeChat identities, and session hashes. It must survive service restarts and deployments or users will lose their accounts. Keep SQLite's database, `-wal`, and `-shm` files together. Use SQLite's backup API/tooling for a live backup, or stop the service cleanly before copying the files. SQLite closes after the HTTP/WebSocket server finishes shutting down on `SIGINT` or `SIGTERM`.

See [`.env.example`](.env.example) for server configuration. The service reads process environment variables; it does not load `.env` files automatically.

| Variable | Purpose / default |
| --- | --- |
| `PORT` | HTTP and WebSocket port, `8787` |
| `HOST` | Listen address, `0.0.0.0` |
| `BELLFIVE_AUTH_DB_PATH` | Persistent SQLite path, `server/data/bellfive.sqlite` |
| `BELLFIVE_CORS_ORIGINS` | Comma-separated exact browser origins, including scheme and port; empty denies browser cross-origin account requests |
| `BELLFIVE_WECHAT_MINI_APP_ID` | Mini-program AppID used by the server's code exchange |
| `BELLFIVE_WECHAT_MINI_APP_SECRET` | Mini-program AppSecret, held only in the server environment |

Set the two WeChat variables in the server terminal to enable WeChat login, linking, and password recovery. Password registration/login and `/health` work when those variables are absent; WeChat operations return `503` with `WECHAT_NOT_CONFIGURED`. Keep AppSecret out of tracked files, mini-program output, Expo bundles, and Web clients.

The clients use these additional build-time variables. They configure public service addresses only; never place an AppSecret or other credential in a client variable.

| Variable | Used by | Value |
| --- | --- | --- |
| `EXPO_PUBLIC_AUTH_SERVER_URL` | Expo native and Expo Web account requests | HTTP(S) base URL for this service; defaults to `http://localhost:8787` |
| `EXPO_PUBLIC_GAME_SERVER_URL` | Expo native and Expo Web room WebSocket | WS(S) URL for this service; defaults to `ws://localhost:8787` |
| `BELLFIVE_MINI_AUTH_URL` | Taro Mini Program build | HTTP(S) base URL for this service; Taro appends `/auth/...` routes |
| `BELLFIVE_MINI_WS_URL` | Taro Mini Program build | WS(S) URL for this service |

Set the Expo variables before starting Expo, then restart Expo after changing them. The Mini variables are read by `miniprogram/config/index.ts` during the build and compiled into the Mini bundle; set them before every build. Use `http://`/`ws://` only for local development, and `https://`/`wss://` with valid certificates for deployed services. Expo Web's exact origin must also be listed in `BELLFIVE_CORS_ORIGINS`; native Expo requests do not need a browser CORS origin. CORS is independent from the Mini Program's WeChat domain allowlists below.

For a local password-account check, use a username and password you choose in a private development environment; do not reuse production credentials in local testing. Registration accepts `username`, `password`, and an optional initial profile. The Chinese operation manual describes the client-side registration and sign-in flows.

The account API accepts JSON bodies up to 16 KiB and returns `{ "error": { "code": "...", "message": "..." } }` on failure. Register returns an `AuthSession` with status `201`; password/WeChat login, WeChat linking, and WeChat password reset return an `AuthSession` with status `200`. `GET /auth/me`, `PATCH /auth/me/profile`, and `POST /auth/credentials` return an `AuthUser`; logout returns `204`. Send exactly one `Authorization: Bearer <token>` header to read/update the current account, add credentials, link WeChat, or log out. Password reset requires a fresh WeChat code for the identity already bound to a password account; first-release recovery is available only to those accounts. Identity conflicts require explicit confirmation for a temporary WeChat-only account and cannot overwrite an existing password account.

## WeChat mini-program domains

Deploy the account API behind HTTPS and the room connection behind WSS using a valid certificate. In the WeChat mini-program console, configure the API host in the **request legal domain** allowlist and the room host separately in the **WebSocket (socket) legal domain** allowlist. Adding one does not add the other. The mini-program obtains a fresh login code and sends it to `/auth/wechat/login`; the server exchanges it with WeChat using its AppSecret. Configure the registered Mini Program's AppID and AppSecret only in the server environment. Do not put the AppSecret in Mini project settings or the generated bundle.

To import and build the Mini Program from the repository root:

```powershell
npm ci
npm --prefix miniprogram ci
$env:BELLFIVE_MINI_AUTH_URL = "https://<your-api-host>"
$env:BELLFIVE_MINI_WS_URL = "wss://<your-room-host>"
npm run miniprogram:build
```

Replace the URL placeholders with the actual service hosts you control. In WeChat Developer Tools, open the repository's `miniprogram/` directory; the generated source root is `dist/`. The tracked `project.config.json` intentionally uses the public `touristappid` placeholder. Select the registered Mini Program AppID in Developer Tools or save it in the ignored local `miniprogram/project.private.config.json` override. The private settings file and build output are ignored by Git. Keep URL verification enabled and add the HTTPS request host and WSS socket host separately in the Mini Program platform's legal-domain settings. Rebuild after changing either URL: those values are embedded at build time. Do not submit a build made with placeholder URLs.

For a local preview, use a registered development AppID and endpoints reachable from the test device. A local preview does not replace configuring legal domains for real-device tests or release. The account service's `/health` route can confirm the HTTP endpoint before importing the project.

`BELLFIVE_CORS_ORIGINS` controls browser HTTP access and is separate from those WeChat allowlists. List each Expo Web origin exactly, including scheme and port where present; wildcard origins are not supported. The existing Expo client and in-memory room protocol continue to use the WebSocket endpoint described below.

For two phones on the same Wi-Fi, set the app endpoint to the development computer's LAN IPv4 address before starting Expo:

```powershell
$env:EXPO_PUBLIC_AUTH_SERVER_URL = "http://192.168.1.20:8787"
$env:EXPO_PUBLIC_GAME_SERVER_URL = "ws://192.168.1.20:8787"
npx expo start --tunnel
```

Replace `192.168.1.20` with the IPv4 address shown by `ipconfig`. Keep the room service running in its own terminal. Restart Expo after changing either endpoint so the values are included in the JavaScript bundle.

## Test from different internet connections

Use a temporary HTTPS tunnel for the room service. Install `cloudflared`, keep the room service running, then open a second terminal and run:

```powershell
cloudflared tunnel --url http://localhost:8787
```

The command prints a temporary `https://….trycloudflare.com` URL. Set Expo's account endpoint to that HTTPS host and its WebSocket endpoint to the same host with `wss://`:

```powershell
$env:EXPO_PUBLIC_AUTH_SERVER_URL = "https://<current-tunnel-host>"
$env:EXPO_PUBLIC_GAME_SERVER_URL = "wss://<current-tunnel-host>"
npx expo start --tunnel
```

Replace `<current-tunnel-host>` with the host printed by `cloudflared`. Open the Expo development build/Expo Go project on both phones. Share the BellFive room code with the second player. The Expo tunnel serves the app bundle; the Cloudflare tunnel carries account HTTP requests and the game WebSocket. Keep both terminals running while testing. The temporary service URL changes when its tunnel process is restarted, so update both environment variables and restart Expo after that happens.

Quick Tunnels are intended for testing and development and create a temporary public URL. Cloudflare's proxy supports WebSocket connections without extra configuration. Anyone who obtains the temporary endpoint can reach the service, while joining a particular match still requires its six-character room code. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) and [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/).

## Service checks

```powershell
npm run server:typecheck
npm run server:test
```
