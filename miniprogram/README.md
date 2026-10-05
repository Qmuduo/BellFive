# BellFive Mini Program

This folder is an isolated Taro 4.3 project. Install its dependencies with `npm ci` from this directory, then run `npm run dev:weapp` or `npm run build:weapp`.

For a real Mini Program AppID, create `project.private.config.json` here and set its `appid` in the local copy. WeChat Developer Tools merges those private settings with the tracked `project.config.json`; the private file is ignored and must not contain service secrets. The tracked project uses the public `touristappid` placeholder.

Build-time service endpoints are provided as `BELLFIVE_MINI_AUTH_URL` (the HTTP(S) account API base URL) and `BELLFIVE_MINI_WS_URL` (the WSS game endpoint). For example, in PowerShell set both environment variables before running `npm run miniprogram:build`. Configure the matching request and socket domains in the WeChat Mini Program platform settings. Do not place the WeChat AppSecret in these client settings; it belongs only on the server.
