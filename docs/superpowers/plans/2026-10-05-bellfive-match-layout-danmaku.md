# BellFive 对局布局与弹幕实现计划

> **For agentic workers:** Use inline execution with checkpoints. Steps use checkbox syntax for tracking.

**Goal:** 强调当前玩家的剩余牌数，放大并居中牌桌，同时让多条纯文字抢铃弹幕在牌桌不同高度并行播放，并在各自结束后进入详情列表。

**Architecture:** 新增轻量 `RingDanmaku` 动画组件；`GameScreen` 按事件版本轮换分配四条并行轨道，只有轨道全部占用时才等待。每条动画完成后更新按事件版本排序的最近 12 条记录并复用该轨道。牌桌舞台利用主滚动区的可伸展空间居中，固定操作区只调整视觉层级和辅助文案。

**Tech Stack:** React Native、TypeScript、React Native Reanimated、现有 `RingFeedbackEvent` 与 `formatRingActivity`。

## Global Constraints

- 保持抢铃规则、游戏快照协议和服务端行为不变。
- 详情列表和弹幕使用相同的 `formatRingActivity` 文案。
- 初次载入对局时已有事件直接显示，不进行弹幕回放；最多显示最近 12 条已完成事件。
- 四条弹幕轨道可并行播放，同一轨道始终最多只有一条弹幕，新增弹幕使用纯文字和阴影对比，不使用气泡底框。
- `RingDanmaku` 使用 `React.memo`；完成回调保持稳定，倒计时快照更新不会重新渲染仍在移动的弹幕。
- 保留 `CardTransferFly` 现有独立生命周期、动画定位和事件处理。
- 本轮执行约束：不新增或运行测试；完成代码后运行 `npm run typecheck`。

---

### Task 1: 新增牌桌弹幕动画组件

**Files:**
- Create: `src/components/RingDanmaku.tsx`

**Interfaces:**
- Consumes: `event: RingFeedbackEvent`、`message: string`、`lane: number`、`laneCount: number`、稳定的 `onComplete: (event: RingFeedbackEvent) => void`。
- Produces: `RingDanmaku`，在牌桌容器指定轨道从右向左播放一条不拦截触控的单行消息，并在动画正常完成时调用一次 `onComplete`。

- [x] 使用 `Animated.View` 覆盖父容器，测量单行文字宽度，以屏幕宽度和文字宽度设置起止位移；用 `lane/laneCount` 将弹幕分布在牌桌四个高度。
- [x] 用 `withTiming` 和线性缓动播放约 2.4 秒；使用 Reanimated 工作线程完成回调调用 JS 完成回调；卸载时取消动画。
- [x] 将 `onComplete` 最新引用放入 ref，避免父屏幕重渲染时因回调身份变化重启动画。
- [x] 用 `React.memo` 导出组件并由父级传递稳定完成回调，避免每秒倒计时快照让活动中的文字节点重复渲染。
- [x] 弹幕使用纯文字和轻量阴影，不画底框；正确结果为绿色字，错误结果为珊瑚色字；保留 `pointerEvents="none"`。

```tsx
type RingDanmakuProps = Readonly<{
  event: RingFeedbackEvent;
  message: string;
  lane: number;
  laneCount: number;
  onComplete: (event: RingFeedbackEvent) => void;
}>;
```

### Task 2: 串联弹幕队列与对局详情

**Files:**
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/RingActivityLog.tsx` only if a prop adjustment is needed; otherwise retain its `events` API.

**Interfaces:**
- Consumes: `RoomSnapshot.ringHistory`, `roomSessionVersion`、`RingDanmaku` 和 `formatRingActivity`。
- Produces: 按事件版本排列的待播放队列，以及只包含弹幕已结束事件的 `RingActivityLog` 输入。

- [x] 增加已完成记录 state、活动轨道 state 和等待队列 state。新对局会用当前 `ringHistory` 初始化已完成列表、清空活动轨道与等待队列，并同步最高事件版本。
- [x] 快照更新时筛选版本高于上次入队版本的历史事件，按版本顺序从轮换指针开始填满空闲轨道，余下事件进入等待队列；独立保留当前 `lastRingEvent` 对飞牌、声音和已有 feedback 的处理。
- [x] 在 `play-mat` 中为每条活动轨道渲染一个弹幕；消息由 `formatRingActivity(event, localPlayerId, language, opponentName)` 生成。单条动画完成后按事件版本排序并保留最近 12 条已完成记录，释放轨道并将最早等待事件送入该轨道。
- [x] 将 `completedRingEvents` 传给 `RingActivityLog`。详情关闭期间仍更新记录；再次展开可见。事件不能因弹幕正在播放而提前进入列表。

```tsx
{danmakuState.active.map(({ event, lane }) => (
  <RingDanmaku
    key={event.version}
      event={event}
    message={formatRingActivity(event, localPlayerId, language, opponentName)}
    lane={lane}
    laneCount={4}
      onComplete={completeDanmaku}
  />
))}
```

### Task 3: 调整操作区强调与牌桌位置

**Files:**
- Modify: `src/components/GameScreen.tsx`
- Modify: `src/components/GameCard.tsx`
- Modify: `src/components/BellButton.tsx`

- [x] 将牌桌和 `turnStrip` 包进 `playStage`；给 `scrollContent` 设置 `flexGrow: 1`，并让 `playStage` 使用 `flexGrow: 1` 与 `justifyContent: 'center'`，短屏和展开详情仍可滚动。
- [x] 将 `tablePanel` 下边距调到约 10 点，使提示卡片与牌桌分开但保持同属一个舞台。
- [x] 我的牌库数字使用更大的字体、亮色圆角块和更高对比度；对手牌数保留并排位置并采用较弱色彩和较小字号。
- [x] 增大 `GameCard` 高度到 214 点、紧凑模式增到 180 点，适度放大牌面符号，让牌桌更突出。
- [x] 删除翻牌按钮内的 `match.leftHand` 提示和 `BellButton` 内的 `match.rightHand` 提示及对应样式，保留“翻牌”和“敲铃”按钮标题及无障碍标签。

### Task 4: 做静态检查并审阅差异

**Files:**
- Verify: `src/components/RingDanmaku.tsx`
- Verify: `src/components/GameScreen.tsx`
- Verify: `src/components/BellButton.tsx`

- [x] 运行 `npm run typecheck`，确认 TypeScript 检查退出码为 0。
- [x] 用 `git diff --check` 和新增文件空白检查，并审阅差异确认最多四条弹幕并行、轨道起始位置轮换、同一轨道不重叠、每条仅在动画结束后写入详情，初始历史不重播，左右手提示不再渲染，操作和详情仍可滚动访问。
