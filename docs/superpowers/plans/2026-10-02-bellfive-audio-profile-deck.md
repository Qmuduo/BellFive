# BellFive 音效、玩家资料与牌组机会实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** 为 BellFive 增加双端翻牌音效、统一铃声、胜负音效、正确归属的得失牌提示、本机持久昵称与预设头像，并将满足抢铃条件的固定牌面对比例提高到至少 10%。

**Architecture:** 服务端继续权威维护牌局，只新增独立递增的翻牌反馈事件和房间内公开玩家资料；客户端按事件版本播放共享音效，并按本机胜负播放结束音效。玩家资料保存在各自设备，并在创建/加入房间时提交给服务端；卡牌概率通过调整固定牌定义提升，`canRing` 规则不变。

**Tech Stack:** React Native, Expo, TypeScript, Expo Router, Zustand, React Native Reanimated, Expo Haptics, Expo Audio, AsyncStorage, Jest, `tsx`.

## Global Constraints

- 牌组固定为 C001–C060，每局洗牌并给双方各 30 张；每张 1–5 个图标且最多一个铃铛。
- 保持现有 `canRing` 判定公式、误按惩罚、误按冷却、5 分钟计时、断线暂停和服务端裁定不变。
- 所有 1,770 种不同 ID 无序牌对中，至少 177 种满足 `canRing`；牌定义测试继续检查 ID、元素和图标数。
- 正确/错误抢铃在两台手机播放相同完整 `bell.wav`；已接受翻牌在两端各播放一次；结束音效按各设备玩家胜负选择。
- 正确抢铃显示接收者 `+N`；错误抢铃显示按铃者 `−N` 与对手 `+N`，按玩家 ID 定位。
- 昵称和六种内置头像在本机持久保存；房间快照同步两名玩家的资料。头像固定为 `banana`、`grape`、`pear`、`strawberry`、`peach`、`bell`，不支持相册照片。
- 不加入账户、匹配、好友列表、云端资料存储、排行榜、商城、皮肤、每日任务、广告或内购。
- 先写行为测试、运行确认失败，再写生产实现；完成后运行前端/服务端类型检查和完整 Jest 套件。

---

### Task 1: 调整固定牌组并守住抢铃组合比例

**Files:**
- Modify: `src/game/cards.ts`
- Modify: `src/game/__tests__/cards.test.ts`
- Test: `src/game/__tests__/cards.test.ts`

**Interfaces:**
- Consumes: `CARD_DEFINITIONS`, `canRing(counts: VisibleCounts)`.
- Produces: 固定牌组不同 ID 牌对的命中率至少 `177 / 1770`；C056–C060 使用下列 5 图标定义，达到 `201 / 1770`，并保持每牌一个铃铛：

```ts
C056: ['banana', 'banana', 'banana', 'banana', 'bell']
C057: ['grape', 'grape', 'grape', 'pear', 'bell']
C058: ['pear', 'pear', 'pear', 'strawberry', 'bell']
C059: ['strawberry', 'strawberry', 'strawberry', 'peach', 'bell']
C060: ['peach', 'peach', 'peach', 'banana', 'bell']
```

- [ ] **Step 1: 写出枚举所有不同卡对的失败测试**

在 `cards.test.ts` 导入 `canRing`、`CardDefinition` 和 `VisibleCounts`。测试内写 `countsForPair(first, second): VisibleCounts`，将两张牌的水果逐项计数、将 `bell` 累加到 `wildBellCount`；遍历所有 `i < j` 的卡牌对并调用生产 `canRing` 函数。

```ts
function countsForPair(first: CardDefinition, second: CardDefinition): VisibleCounts {
  const counts = { banana: 0, grape: 0, pear: 0, strawberry: 0, peach: 0, wildBellCount: 0 };
  for (const symbol of [...first.symbols, ...second.symbols]) {
    if (symbol === 'bell') counts.wildBellCount += 1;
    else counts[symbol] += 1;
  }
  return counts;
}

let ringPairs = 0;
for (let i = 0; i < CARD_DEFINITIONS.length; i += 1) {
  for (let j = i + 1; j < CARD_DEFINITIONS.length; j += 1) {
    if (canRing(countsForPair(CARD_DEFINITIONS[i], CARD_DEFINITIONS[j]))) ringPairs += 1;
  }
}
const totalPairs = (CARD_DEFINITIONS.length * (CARD_DEFINITIONS.length - 1)) / 2;
expect(CARD_DEFINITIONS).toHaveLength(60);
expect(totalPairs).toBe(1770);
expect(ringPairs).toBeGreaterThanOrEqual(177);
```

- [ ] **Step 2: 运行测试确认当前牌组未达标**

运行：

```powershell
npm test -- --runInBand src/game/__tests__/cards.test.ts
```

预期：新比例测试失败，当前结果为 `85 / 1770`；既有牌组约束测试保持通过。

- [ ] **Step 3: 修改 C056–C060 的固定符号**

按本任务 Interfaces 中的精确定义替换 `src/game/cards.ts` 的 C056–C060；不更换 ID、不改牌张数、不改其他卡牌内容。

- [ ] **Step 4: 验证牌面不变量和命中率**

再次运行同一命令。预期所有测试通过，`ringPairs` 为 `201`，每张牌的符号数仍是 1–5、bell 数不超过 1，卡牌 ID 仍唯一且覆盖 C001–C060。

- [ ] **Step 5: 提交固定牌组调整**

```powershell
git add src/game/cards.ts src/game/__tests__/cards.test.ts
git commit -m "feat: increase BellFive ring opportunities"
```

### Task 2: 为已接受翻牌加入独立同步事件版本

**Files:**
- Modify: `src/network/protocol.ts`
- Modify: `src/network/__tests__/protocol.test.ts`
- Modify: `server/src/roomManager.ts`
- Test: `server/src/__tests__/roomManager.test.ts`
- Test: `server/src/__tests__/websocketServer.test.ts`

**Interfaces:**
- Produces: `FlipFeedbackEvent = { version: number; player: PlayerId }`；`RoomSnapshot.lastFlipEvent: FlipFeedbackEvent | null`；房间内单调递增的 `flipVersion`。
- Consumes: 当前 `tableVersion` 仍用于铃声动作的桌面新鲜度校验。正确抢铃也会改变 `tableVersion`，客户端不得将它当作翻牌声音事件。

- [ ] **Step 1: 增加协议和房间管理器失败测试**

为快照 fixture 增加 `lastFlipEvent: null`。新增断言：创建房间时事件为空；每次实际翻出一张牌后，A/B 收到相同玩家 ID、版本递增的事件；空牌堆触发终局时不产生新翻牌事件；正确抢铃增加 `tableVersion` 但不增加 `flipVersion`。

```ts
expect(snapshot.lastFlipEvent).toEqual({ version: 1, player: 'A' });
expect(correctRingSnapshot.lastFlipEvent?.version).toBe(previousFlipVersion);
```

同时为 `decodeServerMessage` 增加合法事件解码和非法版本/玩家 ID 拒绝用例。

- [ ] **Step 2: 运行指定协议与服务端测试确认失败**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts
```

预期：类型或断言指出快照缺少事件，且服务端尚无事件版本。

- [ ] **Step 3: 实现事件并在实际翻牌时推进版本**

在 `protocol.ts` 定义并验证 `FlipFeedbackEvent`，将 `lastFlipEvent` 加到 `RoomSnapshot` 与 `RoomSnapshotSource`。在 `RoomRecord` 加 `flipVersion` 和 `lastFlipEvent`，新建房间时版本为 0、事件为空。只有 `hadCard === true` 的翻牌递增版本并记录 `{ version, player }`。重赛只将事件清空，不把版本回退。

- [ ] **Step 4: 运行协议、房间和 WebSocket 测试**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts
```

预期：双方快照包含相同的新事件，非法事件被拒绝，所有指定测试通过。

- [ ] **Step 5: 提交翻牌事件协议**

```powershell
git add src/network/protocol.ts src/network/__tests__/protocol.test.ts server/src/roomManager.ts server/src/__tests__/roomManager.test.ts server/src/__tests__/websocketServer.test.ts
git commit -m "feat: publish versioned card flip events"
```

### Task 3: 加入统一铃声、翻牌音和胜负音

**Files:**
- Create: `scripts/generate-audio-sfx.mjs`
- Create: `assets/audio/card-flip.wav`
- Create: `assets/audio/victory.wav`
- Create: `assets/audio/defeat.wav`
- Modify: `src/services/gameFeedback.ts`
- Modify: `src/services/__tests__/gameFeedback.test.ts`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/store/gameStore.ts`
- Modify: `src/store/__tests__/gameStore.test.ts`
- Test: `src/components/__tests__/GameScreen.test.tsx`

**Interfaces:**
- Produces: `playCardFlipSound(audioPlayer)`、`playBellSound(audioPlayer)` 和 `playMatchResultSound(outcome, audioPlayer)`。Correct/wrong 只改变本地震动类型；双方 ring event 都调用同一 `playBellSound`，设置音量 1、seek 到 0 并播放完整资源。
- Consumes: `RoomSnapshot.lastFlipEvent`；结果音效只对客户端在线观察到的本局 `playing → finished` 转换播放。

- [ ] **Step 1: 先写服务音效失败测试**

先写 service tests：`playBellSound` 每次都设音量 1、seek 到 0 并播放一次，推进 300ms 后仍未调用 `pause`；`playCardFlipSound` 和两个 `playMatchResultSound` 分别 seek/play 绑定资源。保留 correct/wrong 震动差异和铃声异步重叠测试，并将 `GameFeedbackProfile` 简化为只描述 Haptics，声音播放由三个显式函数负责。

- [ ] **Step 2: 运行音效测试确认旧实现失败**

```powershell
npm test -- --runInBand src/services/__tests__/gameFeedback.test.ts
```

预期：旧错误铃声实现仍被裁短；翻牌/胜败声音函数导出缺失。

- [ ] **Step 3: 创建可重复生成的短音效资源**

在 `scripts/generate-audio-sfx.mjs` 使用 Node 内置 `fs`、`path` 和 `Buffer` 写 WAV，不加第三方音频依赖。WAV 格式为 22,050 Hz、单声道、16-bit PCM。`writeWav(name, duration, sampleAt)` 分配 `44 + sampleCount * 2` bytes，写 RIFF/WAVE/PCM header（声道 1、bit depth 16、byte rate 44,100、block align 2），并将每个 `sampleAt(i / 22050)` clamp 到 [-1, 1] 后写为 signed 16-bit little-endian。生成内容为：

```js
// card-flip.wav: duration 0.12s; 0.65 * exp(-t * 38) * sin(2π * 900 * t)
// + 0.35 * exp(-t * 38) * sin(2π * 1900 * t)
// + 0.08 * exp(-t * 65) * deterministicXorshiftNoise(t).
// victory.wav: [523.25, 659.25, 783.99] Hz; each note 0.18s,
// 0.02s silence between notes, sample = 0.28 * exp(-localT * 4) * sin(2π * hz * localT).
// defeat.wav: [392, 261.63] Hz; each note 0.28s,
// 0.04s silence between notes, sample = 0.24 * exp(-localT * 4) * sin(2π * hz * localT).
```

`deterministicXorshiftNoise` 使用初始 state `0x6d2b79f5`；每个 sample 执行 `state ^= state << 13; state ^= state >>> 17; state ^= state << 5; state >>>= 0;`，再用 `state / 0xffffffff * 2 - 1` 映射到 [-1, 1]。按 sample index 递增调用，确保每次生成的文件相同。

总音长由音符数、时长和间隔求和。运行 `node scripts/generate-audio-sfx.mjs` 后用 `Get-Item assets/audio/card-flip.wav,assets/audio/victory.wav,assets/audio/defeat.wav` 检查三个文件非空。

- [ ] **Step 4: 实现各声音播放函数并统一铃声**

移除 wrong outcome 专用降音量、220ms timeout 和 pause 行为，保留上一轮 generation token 防止延迟 seek 重放旧铃声。实现 `playBellSound`、`playCardFlipSound` 和 `playMatchResultSound`，seek 失败或音频未加载时安静返回。

- [ ] **Step 5: 将服务端事件接到 GameScreen**

在 `GameScreen` 为铃声、翻牌、胜利和失败音效各绑定相应本地音频资源。用 `lastFlipEvent.version` 去重双端翻牌声音；铃声继续用 `lastRingEvent.version` 去重。`gameStore` 添加本地 `roomSessionVersion`，每次收到 `room.session`（包含重连）递增；当它变化时，`GameScreen` 将翻牌/铃声版本和当前 phase 设为播放基线，不播放快照中已有的历史事件。随后只有观察到新的翻牌/铃声版本时播放共享音效；只有在线观察到 `playing → finished` 且 winner 已确定时播放本机胜负声。平局不播胜败声。正确/错误铃声使用同一 `playBellSound` 函数。

- [ ] **Step 6: 测试事件去重与比赛结果**

在 `GameScreen.test.tsx` 检查：新翻牌事件只播放一次；相同版本快照不重播；correct 和 wrong 都调用同一铃声播放路径；A 胜时 A 播 victory、B 播 defeat；初次结束态 session 快照和重连 session 快照不播放；平局不播放胜败音；普通重渲染不重复播放。在 `gameStore.test.ts` 检查收到每条 room.session 后 `roomSessionVersion` 恰增 1。

- [ ] **Step 7: 运行音效和界面测试并提交**

```powershell
npm test -- --runInBand src/services/__tests__/gameFeedback.test.ts src/components/__tests__/GameScreen.test.tsx
git add scripts/generate-audio-sfx.mjs assets/audio/card-flip.wav assets/audio/victory.wav assets/audio/defeat.wav src/services/gameFeedback.ts src/services/__tests__/gameFeedback.test.ts src/components/GameScreen.tsx src/components/__tests__/GameScreen.test.tsx src/store/gameStore.ts src/store/__tests__/gameStore.test.ts
git commit -m "feat: add shared BellFive match sounds"
```

### Task 4: 按玩家显示加牌和减牌数量

**Files:**
- Modify: `src/components/CardTransferFly.tsx`
- Modify: `src/components/__tests__/CardTransferFly.test.tsx`

**Interfaces:**
- Consumes: `RingFeedbackEvent { caller, outcome, movedCardCount }`。
- Produces: 用玩家 ID 定位的 `+N`/`−N` 徽标；正确收集只有 caller `+N`，错误惩罚有 caller `−N` 和 opponent `+N`。

- [ ] **Step 1: 添加方向与零张牌的失败测试**

增加 caller=A、caller=B 的 correct 和 wrong 事件测试，断言每个数量文字绑定对应 `data-testid="player-feedback-A"` 或 `player-feedback-B`。wrong 的 caller 显示 `−1`、对方 `+1`；`movedCardCount=0` 不渲染徽标和飞牌。

- [ ] **Step 2: 运行组件测试确认徽标定位失败**

```powershell
npm test -- --runInBand src/components/__tests__/CardTransferFly.test.tsx
```

预期：当前固定位置徽标缺少预期玩家归属。

- [ ] **Step 3: 按玩家身份渲染独立数量徽标**

在 `CardTransferFly` 中构造 `Record<PlayerId, number>`：correct 将完整 `movedCardCount` 记到 caller；wrong 将负数记到 caller、正数记到对手。对非零值分别渲染徽标并用 A/B 样式锚定在桌面 A/B 卡区；飞牌的 from/to 坐标仍按 caller 和 outcome 计算。徽标显示完整 N 并替代旧的 `N−5` overflow badge，避免同一收牌事件重复显示数量。

- [ ] **Step 4: 运行组件测试并提交**

```powershell
npm test -- --runInBand src/components/__tests__/CardTransferFly.test.tsx
git add src/components/CardTransferFly.tsx src/components/__tests__/CardTransferFly.test.tsx
git commit -m "fix: anchor card transfer counts to each player"
```

### Task 5: 建立本机持久玩家资料

**Files:**
- Create: `src/profile.ts`
- Create: `src/store/profileStore.ts`
- Create: `src/store/__tests__/profileStore.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces: `AVATAR_OPTIONS`、`AvatarId`、`PlayerProfile`、`sanitizePlayerProfile(profile, playerId)` 和 `usePlayerProfileStore`。
- Profile fields: `nickname: string`，最多 12 个 Unicode code point；`avatarId: 'banana' | 'grape' | 'pear' | 'strawberry' | 'peach' | 'bell'`。初始头像为 `strawberry`，空昵称按座位回退为 `Player A`/`Player B`。
- `src/profile.ts` 另导出 `PlayerProfileInput = { nickname: string; avatarId: string }`，供网络边界接收未经信任的头像 ID；store state 为 `{ profile, hydrated, setProfile }`，通过 Zustand persist 自动异步 hydration，且仅持久化 `profile`。
- `createProfileStore(storage?: StateStorage)` 可传入内存 storage 供单测使用；`usePlayerProfileStore` 使用 AsyncStorage 实例。

- [ ] **Step 1: 安装 Expo 匹配的 AsyncStorage 并创建失败用例**

先安装依赖，然后写 `profileStore.test.ts` 覆盖默认头像、昵称 trim/截断、空昵称按座位回退、未知 avatar ID 回退、异步 hydration 和 setProfile 持久化；使用 `createProfileStore(storage)` 注入内存 `StateStorage` stub 验证状态，不依赖真实手机存储。

运行依赖安装：

```powershell
npx expo install @react-native-async-storage/async-storage
```

运行用例确认新导出缺失：

```powershell
npm test -- --runInBand src/store/__tests__/profileStore.test.ts
```

- [ ] **Step 2: 实现共享资料类型、规范化和 Zustand 持久化 store**

在 `src/profile.ts` 定义六种 avatar ID 和 `sanitizePlayerProfile`。昵称规范化用 `Array.from(trimmed).slice(0, 12).join('')` 保留完整 Unicode code point。用 `persist`、`createJSONStorage` 包装 AsyncStorage；只保存 profile，公开 hydration 状态，在异步加载结束前禁止创建/加入房间。

- [ ] **Step 3: 运行资料 store 测试**

```powershell
npm test -- --runInBand src/store/__tests__/profileStore.test.ts
```

预期：默认值、清理边界、预设头像回退、hydration 和写入测试全部通过。

- [ ] **Step 4: 提交本机资料持久层**

```powershell
git add package.json package-lock.json src/profile.ts src/store/profileStore.ts src/store/__tests__/profileStore.test.ts
git commit -m "feat: persist BellFive player profiles locally"
```

### Task 6: 同步资料到房间并在服务端校验

**Files:**
- Modify: `src/network/protocol.ts`
- Modify: `src/network/__tests__/protocol.test.ts`
- Modify: `src/network/GameClient.ts`
- Modify: `src/network/__tests__/GameClient.test.ts`
- Modify: `src/store/gameStore.ts`
- Modify: `src/store/__tests__/gameStore.test.ts`
- Modify: `server/src/roomManager.ts`
- Test: `server/src/__tests__/roomManager.test.ts`

**Interfaces:**
- Consumes: `PlayerProfile` 和 `sanitizePlayerProfile`。
- Produces: `room.create`/`room.join` 请求携带 profile；`PlayerSnapshot.profile: PlayerProfile`；房间座位保存资料，双方快照包含相同 A/B 资料，重连保留资料。

- [ ] **Step 1: 添加协议、客户端和服务端失败测试**

验证 create/join 序列化包含 nickname/avatarId；`decodeClientMessage` 接受资料输入字段；服务端 trim/truncate 名称、将空名设为座位默认值、将未知头像替换为座位默认头像；A/B 的 room.session 和后续 room.snapshot 都返回两人资料；room.reconnect 沿用原座位资料且不接收第二份资料覆盖。

- [ ] **Step 2: 运行相关测试确认当前协议失败**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts src/network/__tests__/GameClient.test.ts src/store/__tests__/gameStore.test.ts server/src/__tests__/roomManager.test.ts
```

预期：create/join 不带资料，PlayerSnapshot 缺少 profile。

- [ ] **Step 3: 扩展客户端消息和快照类型**

在 `ClientMessage` 的 create/join 分支加 `profile` 输入；在 `PlayerSnapshot` 加规范化后的 profile。更新快照构建和 validator；新增合法 avatar ID、长度边界和未知头像 fallback 用例。更新所有测试快照 fixture。

- [ ] **Step 4: 将资料从 RoomEntry 请求传给服务端座位**

修改 `GameClient.createRoom(profile)`、`joinRoom(code, profile)` 和 `RoomRequest`；`gameStore` create/join 接收相同参数并转发；服务端 `RoomSeat` 保存规范化 profile，create/join 时写入，`snapshotFor` 输出两人资料，reconnect 只恢复座位。

- [ ] **Step 5: 运行协议、传输、store 和服务端测试**

```powershell
npm test -- --runInBand src/network/__tests__/protocol.test.ts src/network/__tests__/GameClient.test.ts src/store/__tests__/gameStore.test.ts server/src/__tests__/roomManager.test.ts
```

预期：两端 session/snapshot 中 A/B 昵称和头像一致，重连继续同一资料，既有红牌/回合协议测试通过。

- [ ] **Step 6: 提交房间资料同步**

```powershell
git add src/network/protocol.ts src/network/__tests__/protocol.test.ts src/network/GameClient.ts src/network/__tests__/GameClient.test.ts src/store/gameStore.ts src/store/__tests__/gameStore.test.ts server/src/roomManager.ts server/src/__tests__/roomManager.test.ts
git commit -m "feat: sync player profiles in friend rooms"
```

### Task 7: 增加昵称头像编辑器并显示双方资料

**Files:**
- Create: `src/components/AvatarPicker.tsx`
- Create: `src/components/__tests__/AvatarPicker.test.tsx`
- Modify: `src/components/RoomEntry.tsx`
- Modify: `src/components/__tests__/RoomEntry.test.tsx`
- Modify: `src/components/WaitingRoom.tsx`
- Modify: `src/components/__tests__/WaitingRoom.test.tsx`
- Modify: `src/components/PlayerDeck.tsx`
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/__tests__/GameScreen.test.tsx`

**Interfaces:**
- `AvatarPicker` receives `selected: AvatarId` and `onSelect(id)`，渲染 `AVATAR_OPTIONS` 六个可访问选项。
- `RoomEntry` 在 Create/Join 控件上方显示昵称和头像选择；hydration 完成前不允许 create/join；create/join 回调接收 `PlayerProfile`。
- `WaitingRoom`、`PlayerDeck`、桌面玩家标题均消费 `snapshot.players[id].profile`。

- [ ] **Step 1: 添加头像选择器和入口测试**

头像选择测试覆盖六项、当前选择可访问状态、点击回传 ID。`RoomEntry` 测试覆盖昵称编辑、profile 更新、Create/Join 携带当前资料、hydration 未完成时按钮禁用、房间码输入和既有错误提示不回归。

- [ ] **Step 2: 运行组件测试确认入口资料 UI 不存在**

```powershell
npm test -- --runInBand src/components/__tests__/AvatarPicker.test.tsx src/components/__tests__/RoomEntry.test.tsx
```

- [ ] **Step 3: 实现资料编辑器并连接持久 store**

实现 `AvatarPicker`，以圆形背景和固定水果/铃铛 emoji 显示六个预设。`RoomEntry` 读取 `usePlayerProfileStore` 并显示昵称 TextInput；输入调用 `setProfile`，create/join 以当前 profile 调用 gameStore。hydration 前显示加载态且禁用房间动作。

- [ ] **Step 4: 更新等待界面、牌堆和桌面身份显示**

`WaitingRoom` 对 A/B 分别显示 avatar、nickname 和连接状态。`PlayerDeck` 显示同一 profile，保留 A/B 配色、回合边框和本机 YOU 标记。桌面卡牌标题显示昵称，A/B ID 仍用于布局、动画方向和服务端动作。

- [ ] **Step 5: 更新相关 UI 断言并运行测试**

```powershell
npm test -- --runInBand src/components/__tests__/AvatarPicker.test.tsx src/components/__tests__/RoomEntry.test.tsx src/components/__tests__/WaitingRoom.test.tsx src/components/__tests__/GameScreen.test.tsx
```

预期：名字/头像在创建端和加入端均按同一快照显示；旧房间码/离开/等待/游戏结束 UI 测试通过。

- [ ] **Step 6: 提交玩家资料界面**

```powershell
git add src/components/AvatarPicker.tsx src/components/__tests__/AvatarPicker.test.tsx src/components/RoomEntry.tsx src/components/__tests__/RoomEntry.test.tsx src/components/WaitingRoom.tsx src/components/__tests__/WaitingRoom.test.tsx src/components/PlayerDeck.tsx src/components/GameScreen.tsx src/components/__tests__/GameScreen.test.tsx
git commit -m "feat: let players choose a nickname and avatar"
```

### Task 8: 更新中文操作手册并完成全量验证

**Files:**
- Modify: `docs/中文操作手册.md`
- Test: all Jest suites

**Interfaces:**
- 文档说明：设置昵称与六种预设头像、资料保存在本机并在房间显示、翻牌/铃声/胜负音效、抢铃牌对机会调整和得失牌提示。
- 本任务不修改网络房间使用步骤或之前确认的惩罚、冷却、计时规则。

- [ ] **Step 1: 更新手册并按用户步骤核对**

在“开始/加入房间”步骤说明入口如何选 nickname/avatar、如何更改、离开后如何保留；增加翻牌音/统一铃声/胜负音效说明；说明正确显示 `+N`、错误显示双方 `−N/+N`，不在手册中称牌对比例为对局保证概率。

- [ ] **Step 2: 运行完整验证**

```powershell
npm run typecheck
npm run server:typecheck
npm test -- --runInBand
git diff --check
```

预期：两项 TypeScript 检查成功，所有 Jest 套件通过，无空白错误。

- [ ] **Step 3: 检查工作树并提交文档**

确认生成 WAV 资源均可读取、git status 仅含本任务手册差异，然后提交：

```powershell
git add docs/中文操作手册.md
git commit -m "docs: update BellFive sound and profile guide"
git status --short --branch
```

预期：本功能提交完整，工作树干净；不合并、不推送，等待用户决定分支整合方式。
