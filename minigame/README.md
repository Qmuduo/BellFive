# 铃果派对 微信小游戏

`minigame/` 是独立的微信**小游戏** Canvas 2D 客户端，微信开发者工具必须按“小游戏”类型打开它。仓库里的 `miniprogram/` 是另一套 Taro 微信**小程序**客户端；不要把 `miniprogram/` 导入小游戏模式。

## 背景音乐

首页底部或账号页的“游戏设置”可开关背景音乐，并用音量加减按钮以 10 个百分点调整音量。默认音量为 15%，开关与音量分别保存在本机。局内顶部的“音乐开 / 音乐关”按钮可随时切换背景音乐，翻牌和抢铃音效仍会正常播放。

音乐会在首次触摸后循环播放，切到后台时暂停，回到前台时按保存的设置恢复。构建会将现有原创曲目 `assets/audio/background-music.wav` 一同打入小游戏包，构建校验会检查文件内容，避免再次漏打包。

## 本地构建

在仓库根目录打开 PowerShell：

```powershell
npm ci
npm --prefix minigame ci
npm run minigame:build
```

输出位于 `minigame/dist/`，其中包含开发者工具需要的 `game.js` 和 `game.json`。如果没有安装仓库根依赖，先运行 `npm ci`；如果只改了小游戏依赖，也要重新运行 `npm --prefix minigame ci`。

## 导入微信开发者工具

1. 在开发者工具中选择“小游戏”项目类型。
2. 项目目录选择仓库里的 **`minigame/` 根目录**。所选目录应直接包含 `project.config.json`；不要选仓库根目录、`minigame/dist/`、`miniprogram/` 或 `miniprogram/dist/`。
3. 根配置使用 `compileType: "game"`，并将构建输出配置为 `dist/`。因此开发者工具会读取 `minigame/dist/game.json`。如果仍看到 `dist/game.json` 找不到，回到仓库根目录运行 `npm run minigame:build`，并确认开发者工具导入的路径是 `minigame/`。
4. 在项目设置中填入已注册的**小游戏** AppID。也可以在本地的 `minigame/project.private.config.json` 中写入：

   ```json
   {
     "appid": "wx你的小游戏AppID"
   }
   ```

   该私有配置已被 Git 忽略。小游戏 AppID 与仅用于微信小程序的 AppID 不是同一目标类型；不能用小程序 AppID 将此项目改成小游戏。
5. 构建完成后点编译。Canvas 首页应显示 BellFive。开发者工具模拟器可使用本机默认服务地址进行游客单机；在线游戏和微信登录还需按下文启动及配置服务。

## 本地服务地址

没有本地配置文件时，构建会把模拟器默认地址写进小游戏包：账号 API 为 `http://localhost:8787`，房间 WebSocket 为 `ws://localhost:8787`。启动服务：

```powershell
$env:BELLFIVE_AUTH_DB_PATH = "server/data/bellfive.sqlite"
npm run server:dev
```

如果微信开发者工具模拟器无法访问默认地址，可在 `minigame/local.settings.json` 创建仅本机使用的服务配置：

```json
{
  "authUrl": "http://localhost:8787",
  "socketUrl": "ws://localhost:8787"
}
```

真机上的 `localhost` 指手机本身。真机联网测试须将这两个地址改为设备可访问、证书有效且已在微信后台配置的 HTTPS/WSS 服务，例如：

```json
{
  "authUrl": "https://api.example.com",
  "socketUrl": "wss://game.example.com"
}
```

`authUrl` 只能是 HTTP 或 HTTPS 服务根地址；`socketUrl` 只能是 WS 或 WSS 服务根地址。路径、查询参数和片段不受支持。此配置只包含公开服务地址，不要加入 AppID、AppSecret、会话令牌或其他凭据。文件已被 Git 忽略。修改后重新运行 `npm run minigame:build`；若使用 `npm run minigame:dev`，需停止并重新启动监听命令，让它重新读取配置。

微信小游戏后台要将账号服务主机配置为 **request 合法域名**，并将房间服务主机单独配置为 **socket 合法域名**。真机和发布使用有效 HTTPS/WSS 证书及微信认可的合法域名。需要在开发者工具模拟器本地调试时，可打开 **详情 → 本地设置**，临时勾选“**不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**”（不同版本的菜单或选项名称可能略有差异）。该选项只放宽本地开发者工具模拟器校验，不代表真机网络可用，也不能替代真机及发布所需的合法域名和有效证书配置。普通局域网 HTTP/WS 地址只用于支持该方式的模拟器调试。

## 登录、账号和单机

- 游客可以直接玩单机，不依赖账号服务。
- 大厅、好友房和在线对局需要服务端会话。小游戏使用 `wx.login`；首次成功时服务端自动创建 BellFive 账号。
- 登录失败或服务不可用时，仍可返回游客单机；确认网络或服务恢复后再试在线功能。
- Expo/Web 使用自选用户名和密码。要让微信小游戏与现有 Expo/Web 账号共用资料，先在小游戏微信登录，再在账号页绑定已有用户名和密码；也可以在微信新账号上设置用户名和密码，随后在 Expo/Web 登录同一账号。
- 服务端的 `BELLFIVE_WECHAT_MINI_APP_ID` 必须与本地小游戏 AppID 对应；`BELLFIVE_WECHAT_MINI_APP_SECRET` 只设置在服务端的私密环境中。不要把 AppSecret 放入 `project.private.config.json`、`local.settings.json`、小游戏构建输出或客户端环境变量。
- 当前服务端配置一组微信 AppID/AppSecret。若 Taro 小程序使用另一个 AppID，不能让两个不同微信应用同时共用这一组代码交换配置；本地联调时服务端必须配置为正在测试的小游戏 AppID。

可在 Expo/Web 端先注册一组仅用于本地测试的用户名和密码。需要把它关联到小游戏时，使用小游戏账号页的“绑定已有账号”流程。不要在公开或生产环境复用测试密码。

## 检查命令

从仓库根目录运行：

```powershell
node --test minigame/scripts/__tests__/local-settings.test.mjs
npm run minigame:typecheck
npm test -- --runInBand minigame/src src/game/__tests__ src/network/__tests__ src/auth/__tests__ src/store/__tests__ miniprogram/src
npm run typecheck
npm run server:typecheck
npm run minigame:build
```

规则、服务端认证和小游戏 UI 的测试覆盖见仓库对应测试目录。微信开发者工具启动、真机网络、微信凭据和后台合法域名仍需在相应微信项目环境中单独验证。
