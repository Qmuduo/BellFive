# BellFive 双方牌库展示与转牌动画实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 在当前左右并排牌桌和底部操作区中并排突出双方 draw pile 张数，并让抢铃后的飞牌与加减提示对齐到实际牌库位置。

**Architecture:** 游戏快照仍是双方 draw pile 数量的唯一来源。对局中在固定操作区显示本地玩家与对手的紧凑计数，桌面牌面继续显示桌面牌数；动画层以测量得到的屏幕锚点为起终点，再转换到屏幕覆盖层坐标。

**Tech Stack:** React Native, Expo, TypeScript, react-native-reanimated, Expo Router.

## Global Constraints

- 本地玩家固定显示在左侧牌面，对手显示在右侧牌面；计数始终按“我、对手”顺序排列。
- 服务端快照提供双方的 `drawCount` 和 `playedCount`；动画事件提供真实 `PlayerId` 与 `movedCardCount`。
- 正确抢铃的实体规则及事件计数不变；错误抢铃不移动超过规则实际移动的牌数。
- 320px 窄屏和紧凑高度下计数清晰可读，不能挤压翻牌或按铃按钮。
- 动画覆盖层设置 `pointerEvents="none"`；不得改变服务端状态、游戏规则或网络协议。
- 中英文都提供可见短标签与明确无障碍名称。

---

### Task 1: 添加并排牌库计数和对应文案

**Files:**
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/GameCard.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- `GameScreen` 通过 `localPlayerId` 计算 `opponentPlayerId`，将双方 `drawCount` 分别传入控制区中的本地与对手计数。
- `GameCard` 新增可选 `showDrawCount?: boolean`，缺省为 `true`；结束状态继续在桌面牌面显示双方 draw count。

- [x] 在 `translations.ts` 添加本地与对手计数标签，中文分别显示“我的牌库”和“对手牌库”，英文分别显示“You”与“Opponent”；同时给每个计数容器添加完整无障碍名称。
- [x] 在 `GameScreen` 身份区把当前单一计数改为两个等权、并排的小计数块，顺序由 `localPlayerId` 与另一名玩家确定，数字从对应快照读取。
- [x] 在进行中向 `GameCard` 传 `showDrawCount={false}`，保留 `TABLE N`；在 `isFinished` 时传 `true`，保证重赛界面仍可观察双方 draw count。
- [x] 调整身份区布局，使 320px 可用宽度下姓名可收缩、两块计数不重叠，紧凑高度仍使用相同布局。

### Task 2: 让飞牌动画使用双方牌库与桌面牌锚点

**Files:**
- Modify: `src/components/CardTransferFly.tsx`
- Modify: `src/components/GameScreen.tsx`

**Interfaces:**
- 在 `CardTransferFly.tsx` 导出以下只读类型，并用它替换硬编码位移：

```ts
export type Point = Readonly<{ x: number; y: number }>;
export type TransferAnchors = Readonly<{
  deck: Readonly<Record<PlayerId, Point>>;
  table: Readonly<Record<PlayerId, Point>>;
}>;
```

- `CardTransferFly` 接收 `{ event, localPlayerId, anchors }`。`anchors.deck` 与 `anchors.table` 均以 `GameScreen` 覆盖层左上角为原点。
- [x] 在双方 draw count 容器和各自 `GameCard` 的外层 `View` 上挂 ref；在布局提交后通过 `measureInWindow` 采样矩形中心，并减去 `GameScreen` 覆盖层的屏幕原点，保存成 `TransferAnchors`。
- [x] 仅当四个锚点就绪时启动飞牌动画；位置取每个矩形中心。错误抢铃从 `event.caller` 的 `deck` 飞向另一玩家的 `deck`；正确抢铃从 A、B 各自的 `table` 锚点交替发牌并汇聚到 caller 的 `deck` 锚点。
- [x] 保留最多 5 张可见牌背、实际 `movedCardCount`、分张延迟及 0 张不渲染的行为；删除 `top: '47%'`、`-260` 等旧布局偏移。
- [x] 将 `−N` 与 `+N` 提示定位在对应 `deck` 锚点附近；正确收牌的 `+N` 只定位在 caller 锚点附近。锚点按真实 player ID 索引，不用 A/B 直接假设屏幕左右。
- [x] 让 `GameScreen` 的绝对定位覆盖层与被测量的根容器共用坐标原点。滚动内容和底部固定操作区的测量都需转到该原点，且动画期间覆盖层不截获触摸。

### Task 3: 接入响应式状态并检查实现

**Files:**
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/CardTransferFly.tsx`
- Modify: `src/i18n/translations.ts`

- [x] 确认 `localPlayerId` 为 A、B 两种情况时，牌桌仍是本地玩家左、对手右，而底部计数同样按我、对手排列；ring event caller 决定牌流方向。
- [x] 检查连接暂停、结束对局、`ringCue` 清理和 0 张错误抢铃路径：没有未就绪锚点导致的异常动画，也没有残留反馈。
- [x] 检查 320px 宽、短屏和中英文计数文案的可读性，并确认 `TABLE N` 仍代表 played pile 数量。
- [x] 运行 `npm run typecheck`，检查 `git diff --check`，审阅最终差异，确认只涉及计数、动画、必要文案和本计划内文档。
