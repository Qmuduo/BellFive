# 微信小游戏 Android 视觉对齐 Implementation Plan

> **执行说明：**实现者必须按所选路线使用 `subagent-driven-development` 或 `executing-plans` skill 执行本计划；每项先写失败测试，再实现到通过，并在任务边界提交小而独立的改动。

## Goal

让微信小游戏 Canvas 2D 的首页、大厅、等待房间、账号页和对局页都采用 Android 客户端的信息结构、品牌颜色、卡片层级和操作优先级，同时保留现有功能、action ID、store、账号与网络协议、游戏规则。用户在窄屏和短屏上仍可触达全部主要入口；绘制出来的控件与触摸目标一致。

设计依据：[2026-10-10-minigame-android-visual-parity-design.md](../specs/2026-10-10-minigame-android-visual-parity-design.md) 与 `minigame/design-model.yaml`。视觉对照源是 `src/theme/gameColors.ts` 和 Android 的 `RoomEntry.tsx`、`WaitingRoom.tsx`、`AuthScreen.tsx`、`AccountSettings.tsx`、`GameScreen.tsx`。

## Architecture

- 在 `minigame/src/runtime/ui.ts` 建立 Canvas 2D 圆角面板、分隔线、标签/状态、输入框、头像徽标与按钮原语。圆角使用 Canvas path 绘制，避免依赖开发者工具版本特有的 `roundRect`。
- 在 `minigame/src/runtime/layout.ts` 和 `canvas.ts` 增加可选纵向滚动契约。可滚动屏幕提供内容高度，运行时统一处理触摸拖动、滚动边界、拖动后取消点击以及可视区域内的触摸目标裁切。滚动偏移放入 `ScreenLayout`，页面按偏移绘制并继续裁切到安全内容区。
- `home.ts`、`lobby.ts`、`waiting.ts`、`account.ts` 和 `match.ts` 保留现有状态快照、状态分支和 action ID，只替换各自的绘制/布局。已有有效账号进入或返回首页时主动订阅并加载大厅列表；访客不触发微信登录，保留单机并显示登录提示。首页及较长账号表单使用滚动；大厅房间列表与等待房间申请继续使用已有分页。
- 颜色只取自 `minigame/design-model.yaml` 中锁定的值。页面布局按当前逻辑画布和 safe area 计算；控件命中矩形由同一份绘制矩形产生。

## Tech Stack

TypeScript、微信小游戏 Canvas 2D、Jest、项目现有的 Mini Game API 类型。验证命令从仓库根目录运行：

- 定向测试：`npm test -- --runInBand <测试文件路径>`
- 小游戏类型检查：`npm run minigame:typecheck`
- 小游戏构建：`npm run minigame:build`

## Global Constraints

- 不修改 Android 页面、共享账号/游戏逻辑、规则、网络协议、翻译文案或 AppID 配置；不增加位图资源。
- 不改变任何既有 action ID、交互语义、访客单机回退或中英文支持。
- 保持安全区裁切、密码掩码、微信系统键盘、禁用/忙碌反馈、加载/错误/空状态和现有分页行为。
- 确认每个新增触摸目标与实际绘制区域重合；超出可视内容的部分不能响应点击。
- 不处理与本设计无关的预存 UI 基线失败；如果验证中遇到，记录原始失败并与本次小游戏定向结果区分。

## File Map

| 文件 | 计划用途 |
| --- | --- |
| `minigame/src/runtime/ui.ts`、`runtime/__tests__/ui.test.ts` | 共享 Canvas 视觉原语与对应单元测试 |
| `minigame/src/runtime/layout.ts`、`runtime/__tests__/layout.test.ts` | 滚动偏移、视口与触摸目标裁切 |
| `minigame/src/runtime/canvas.ts`、`runtime/__tests__/layout.test.ts` | 运行时触摸拖动、滚动边界和拖动/点击区分 |
| `minigame/src/platform/wxApi.ts`、`platform/__tests__/adapters.test.ts` | 接入微信 `touchmove` 并映射逻辑坐标 |
| `minigame/src/screens/home.ts`、`lobby.ts` | 首页和大厅专属卡片布局 |
| `minigame/src/screens/waiting.ts` | 房间码、玩家、申请和准备状态卡片 |
| `minigame/src/screens/account.ts` | 账号摘要、资料、凭据和恢复分组表单 |
| `minigame/src/screens/match.ts` | 玩家桌面、卡牌区、信息控制台与重赛状态 |
| `minigame/src/screens/__tests__/home.test.ts`、`lobby.test.ts`、`account.test.ts` | 页面布局、状态与 action/hit target 覆盖 |
| `minigame/src/screens/__tests__/waiting.test.ts`、`match.test.ts`、`authFlow.test.ts` | 扩展现有页面与流程回归覆盖 |
| `minigame/src/entry.ts` | 将首页/账号页的内容高度能力接到 CanvasScreen；其余 dispatch 只在需要时调整绘制状态适配 |

## Implementation Tasks

### Task 1：建立通用 Canvas 卡片与控件原语

**Files:** `minigame/src/runtime/ui.ts`, `minigame/src/runtime/__tests__/ui.test.ts`

1. 在测试中增加圆角路径、面板填充/描边、按钮禁用态、文本对齐和返回命中矩形的用例；先运行 `npm test -- --runInBand minigame/src/runtime/__tests__/ui.test.ts`，确认新用例因模块/行为缺失而失败。
2. 实现明确导出的纯绘制函数：
   - `drawRoundedPanel(context, rect, options: { fill: string; border?: string; radius: number; borderWidth?: number })`：用 `moveTo`/`lineTo`/`quadraticCurveTo` 构造圆角路径。
   - `drawDivider(context, rect, color)`：绘制一条像素对齐的分隔线。
   - `drawCanvasButton(context, rect, label, options: { variant: 'primary' | 'secondary' | 'lime' | 'text'; enabled: boolean; fontSize: number; radius: number })`：绘制禁用/启用态和居中标签，返回原 `rect` 供页面创建同范围 tap target；`text` 变体也绘制低对比度白色轻底板、不绘制强调描边，使完整命中区域可见且仍弱于主/次按钮。
   - `drawInputField(context, rect, label, value, options: { focused: boolean; enabled: boolean; fontSize: number; radius: number })`：标签、值、聚焦/禁用态分区绘制，输入值由页面控制。
   - `drawStatusBadge(context, rect, label, tone: 'neutral' | 'success' | 'warning' | 'error')`：按连接、准备和错误状态选择模型内颜色。
   - `drawAvatarBadge(context, rect, avatar: string, options: { background: string; foreground: string; fontSize: number; radius: number })`：使用现有头像 emoji 和圆形/圆角背景，不加载外部资源。
3. 使用 `design-model.yaml` 中的颜色与圆角。所有测试通过后重新运行该测试文件，并提交 `feat(minigame): add shared canvas visual primitives`。

### Task 2：为短屏页面增加可控触摸滚动

**Files:** `minigame/src/runtime/layout.ts`, `minigame/src/runtime/canvas.ts`, `minigame/src/platform/wxApi.ts`, `minigame/src/runtime/__tests__/layout.test.ts`, `minigame/src/platform/__tests__/adapters.test.ts`

1. 先为 `clipTapTargetsToContent(targets, content)`、滚动偏移边界、可视区域外目标移除和拖动结束不触发点击增加失败测试；扩展微信适配测试，断言 `touchmove` 被订阅并以逻辑坐标传递。
2. 在 `ScreenLayout` 增加 `scrollY`，默认值为 `0`；在 `CanvasScreen` 增加可选 `scrollContentHeight(layout): number`。无该方法的页面保持不可滚动。
3. 在微信 API 类型和平台适配器增加 `onTouchMove`/`offTouchMove` 与 `RuntimeEvent: 'touchmove'`；沿用 touchstart/end 相同的 `clientX/clientY` 逻辑坐标转换。
4. 在 `CanvasRuntime` 为每个 screen 保存滚动偏移；从触摸起点累计总位移超过 6 个逻辑像素即标记为拖动，无论当前 screen 是否可滚动都抑制 tap。可滚动 screen 只用纵向位移更新 scrollY，并按 content 高度限制在 `0..max(0, contentHeight - content.height)`。在 touchmove 与 touchend 都检查起点到当前位置的总位移，避免系统只在抬手时报告大位移而误触；轻点仍通过现有 `hitTest` 派发 action。
5. 每次渲染后将 tap target 与 `layout.content` 求交集，完全不可见的目标不参与 hit-test，部分可见区域只保留可见交集。屏幕切换、触摸取消和运行时销毁清除相应的手势状态。
6. 更新运行时测试中注册事件数（新增 `touchmove` 后由 7 项变为 8 项）。先通过 `npm test -- --runInBand minigame/src/runtime/__tests__/layout.test.ts`，再通过 `npm test -- --runInBand minigame/src/platform/__tests__/adapters.test.ts`；提交 `feat(minigame): support safe-area canvas scrolling`。

### Task 3：首页与大厅采用 Android 房间入口结构

**Files:** `minigame/src/screens/home.ts`, `minigame/src/screens/lobby.ts`, `minigame/src/entry.ts`, `minigame/src/screens/__tests__/home.test.ts`, `minigame/src/screens/__tests__/lobby.test.ts`, `minigame/src/screens/__tests__/authFlow.test.ts`

1. 新增首页和大厅绘制测试，覆盖主要卡片/紫色 CTA/青柠单机入口、房间卡片独立申请按钮、现有 action ID、禁用状态及所有 targets 位于内容视口内；扩展 `authFlow.test.ts` 验证已认证时首页自动订阅、未认证时不静默触发微信登录，以及离开首页/大厅或进入单机时关闭订阅。先运行新测试确认失败。
2. 首页替换 `drawMenu`：按顶部语言和账号入口、铃铛品牌标题、玩家资料卡、创建房间主按钮、单机难度组、开放房间列表、房间码输入与加入按钮分组绘制。对 `game.openRooms` 中的房间显示最多两张预览卡并复用 `lobby.apply.<roomCode>` action；通过 `entry.ts` 在 `stores.ready` 后及返回首页时同步订阅生命周期，已有有效认证时主动调用现有 `game.openLobby()`，在首页或大厅期间保持订阅，离开这两页或进入单机时调用 `closeLobby()`。无有效认证时展示已有在线登录提示和账号入口，不静默调用微信登录。保持 `home.solo.easy|normal|hard`、`home.create`、`home.lobby`、`field.roomCode`、`home.join`、`home.account`、`settings.language`、`home.cancelCreate`、`auth.retry`、`auth.cancel` 这些现有 action ID。
3. 导出纯函数 `homeContentHeight(layout, snapshot): number`，让首页 `CanvasScreen.scrollContentHeight` 提供稳定内容高度；将同一个 `scrollY` 用于绘制偏移与控件位置。首页底部房间码区在 320×568 逻辑画布和安全区下滚动后仍可触达。
4. 大厅改为独立房间卡片：房主头像/昵称、房间码和独立的“申请加入”按钮分区；保留刷新、4 间分页（按新卡片高度可调整每页数量，但 dispatch 上下界必须使用同一常量）、房间码加入、申请取消、状态与错误提示。
5. 用现有 `authFlow.test.ts` 验证首页 action dispatch 与账号/网络行为未变，再执行 `npm test -- --runInBand minigame/src/screens/__tests__/home.test.ts minigame/src/screens/__tests__/lobby.test.ts minigame/src/screens/__tests__/authFlow.test.ts`；提交 `feat(minigame): redesign home and lobby canvas screens`。

### Task 4：等待房间改为玩家状态与申请卡片

**Files:** `minigame/src/screens/waiting.ts`, `minigame/src/screens/__tests__/waiting.test.ts`

1. 扩展等待房间渲染测试，断言醒目的房间码卡、两个玩家状态卡、申请同意/拒绝独立按钮、连接暂停状态、准备按钮状态，以及 targets 与实际绘制矩形一致；先运行 `npm test -- --runInBand minigame/src/screens/__tests__/waiting.test.ts` 确认失败。
2. 用紫灰房间码卡、玩家头像/连接/准备状态卡、申请人请求卡与分离的同意/拒绝按钮替换行菜单。准备按钮按未准备紫色、已准备青柠色区分；分享为次级按钮，离开使用带低对比度轻底板的弱强调文字按钮。
3. 保留应用状态分页和所有 action ID（`waiting.share`、`waiting.approve.*`、`waiting.reject.*`、`waiting.applications.previous|next`、`waiting.cancelApplication`、`waiting.ready`、`waiting.leave`、`nav.home`）；连接异常、离开中、无房间、未连接和 auto-start 状态都继续可见。
4. 重新运行 waiting 测试与 `authFlow.test.ts`，确保联网动作没有被视觉重构改变；提交 `feat(minigame): redesign waiting room canvas screen`。

### Task 5：账号页按资料与认证流程分组

**Files:** `minigame/src/screens/account.ts`, `minigame/src/screens/__tests__/account.test.ts`, `minigame/src/screens/__tests__/authFlow.test.ts`

1. 新增账号绘制测试覆盖访客菜单、微信登录入口、用户名登录/注册、资料编辑、绑定确认、密码找回、提交成功/错误/忙碌状态和密码掩码；运行测试确认失败。
2. 按账号摘要、资料编辑、凭据表单、微信绑定/身份转移确认、账号恢复分组绘制卡片。菜单页突出微信登录或登录/注册操作；资料页保留昵称、所有头像选项与保存；表单页明确展示字段标签和聚焦态输入框。
3. 保留 `field.username|password|nickname`、`account.mode.*`、`account.wechat`、`account.submit`、`account.confirmTransfer`、`account.refresh`、`account.logout`、`account.avatar.*`、`account.mode.menu`、`nav.home` 与语言设置等 action ID。密码仍用圆点绘制，点击输入框仍由现有 wx 键盘接管。
4. 导出 `accountContentHeight(layout, snapshot)` 并把长表单接入滚动；确认表单提交和底部返回动作在短屏可滚动到达。运行 `npm test -- --runInBand minigame/src/screens/__tests__/account.test.ts minigame/src/screens/__tests__/authFlow.test.ts`；提交 `feat(minigame): redesign account canvas screen`。

### Task 6：对局页按 Android 桌面与底部操作台重排

**Files:** `minigame/src/screens/match.ts`, `minigame/src/screens/__tests__/match.test.ts`

1. 扩展对局绘制测试，断言回合提示条、双方信息卡、当前卡牌、深李紫操作台、紫色翻牌/青柠拍铃、统计/记录次级区、结束胜负与重赛按钮；并覆盖 enabled/disabled controls 的目标矩形；先运行该测试确认失败。
2. 使用圆角和锁定颜色重画安全区内桌面：顶部标题/计时/辅助操作，回合提示条，双方玩家信息和卡牌区域，底部深李紫控制台，牌堆统计/结果/活动记录次级显示区。
3. 将翻牌、拍铃与重赛/准备作为视觉主操作，但不改现有 `match.flip`、`match.ring`、`match.rematch`、`match.ready`、`match.leave`、`match.home` action ID 与 `createMatchViewModel` 的规则条件。对局主操作必须在 320×568 逻辑画布和较矮 safe-area 视口下保持完整可见；非主要历史内容可以省略旧记录但不改变 view model。
4. 通过 `npm test -- --runInBand minigame/src/screens/__tests__/match.test.ts`；提交 `feat(minigame): redesign match canvas screen`。

### Task 7：全路径验证并完成开发者工具验收

**Files:** 上述全部小游戏屏幕、运行时和测试文件；必要时仅修复本计划引入的回归。

1. 运行相关 Canvas/流程测试：`npm test -- --runInBand minigame/src/runtime/__tests__/ui.test.ts minigame/src/runtime/__tests__/layout.test.ts minigame/src/platform/__tests__/adapters.test.ts minigame/src/screens/__tests__/home.test.ts minigame/src/screens/__tests__/lobby.test.ts minigame/src/screens/__tests__/waiting.test.ts minigame/src/screens/__tests__/account.test.ts minigame/src/screens/__tests__/match.test.ts minigame/src/screens/__tests__/authFlow.test.ts`。
2. 运行 `npm run minigame:typecheck` 和 `npm run minigame:build`，确认类型检查与 `minigame/dist/game.js` 构建均成功；本任务不修改小游戏入口配置和 AppID。
3. 在微信开发者工具的小游戏模拟器做人工验收：检查安全区/窄屏滚动；首页创建房间、单机难度、房间码加入、语言和账号入口；大厅刷新/翻页/申请；等待房间分享/准备/申请同意拒绝；账号微信登录入口、用户名表单与键盘；对局翻牌、拍铃、断线提示、重赛/离开。至少分别检查简体中文、英文、在线忙碌/错误和未连接状态。
4. 与 Android 客户端对照同一组流程，核验页面结构、层级和品牌颜色；若开发者工具视觉验收发现偏差，先补相应的页面绘制测试再修正实现。最终记录运行过的命令及手工验收结果。

## Self-Review

- 五类页面和每个确认的主要视觉结构均被独立任务覆盖；首页与账号的短屏滚动，以及大厅/等待房间的分页均有实现路径。
- 滚动从微信 `touchmove`、CanvasRuntime 手势追踪、`ScreenLayout.scrollY` 一直连到页面坐标和目标裁切，接口职责明确。
- 新旧 action ID 的保留要求写在各页面任务中；账号、游戏规则、协议、翻译、Android 与 AppID 均受全局约束保护。
- 计划文件、测试文件、命令、任务边界提交名均明确，文档内容完整。
