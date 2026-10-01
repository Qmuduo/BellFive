# BellFive friend-room service

This Node.js service owns room seats, shuffled decks, turns, ring decisions, and the complete game state. Room data lives in memory; restarting the process clears every room.

Leaving a room closes it for both players. The leaving phone returns to room entry after the server acknowledges the request; a connected opponent receives a room-closed notice and returns to entry as well. If that opponent is offline, its next reconnect discovers that the room has closed.

## Run locally

From the repository root:

```powershell
npm ci
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

For two phones on the same Wi-Fi, set the app endpoint to the development computer's LAN IPv4 address before starting Expo:

```powershell
$env:EXPO_PUBLIC_GAME_SERVER_URL = "ws://192.168.1.20:8787"
npx expo start --tunnel
```

Replace `192.168.1.20` with the IPv4 address shown by `ipconfig`. Keep the room service running in its own terminal. Restart Expo after changing the endpoint so the value is included in the JavaScript bundle.

## Test from different internet connections

Use a temporary HTTPS tunnel for the room service. Install `cloudflared`, keep the room service running, then open a second terminal and run:

```powershell
cloudflared tunnel --url http://localhost:8787
```

The command prints a temporary `https://….trycloudflare.com` URL. Set the Expo WebSocket endpoint to the same host with `wss://`:

```powershell
$env:EXPO_PUBLIC_GAME_SERVER_URL = "wss://your-temporary-name.trycloudflare.com"
npx expo start --tunnel
```

Open the Expo development build/Expo Go project on both phones. Share the BellFive room code with the second player. The Expo tunnel serves the app bundle; the Cloudflare tunnel carries the game WebSocket. Keep both terminals running while testing. The temporary service URL changes when its tunnel process is restarted, so update the environment variable and restart Expo after that happens.

Quick Tunnels are intended for testing and development and create a temporary public URL. Cloudflare's proxy supports WebSocket connections without extra configuration. Anyone who obtains the temporary endpoint can reach the service, while joining a particular match still requires its six-character room code. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) and [Cloudflare WebSockets](https://developers.cloudflare.com/network/websockets/).

## Service checks

```powershell
npm run server:typecheck
npm run server:test
```
