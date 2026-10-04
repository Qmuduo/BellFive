# BellFive 真实翻牌音效与中英界面实施计划

> **执行说明：**按本计划在当前独立 worktree 内逐项实现，先写会失败的回归测试，再实现到测试通过。每项完成后运行对应 Jest 用例；最终运行完整 Jest、应用 TypeScript 和服务器 TypeScript 检查。已有工作区改动来自前一轮按铃与音效修复，全部保留。

**目标：**将现有合成翻牌音替换为真实纸牌处理录音；让首次进入默认显示简体中文，并能在房间入口、等待室和牌桌即时切换中英文，且将选择保存在本机；覆盖所有玩家可见文案、无障碍标签、错误、日志、分享文案和调试信息。

**架构：**新增 `src/i18n/` 双语强类型文案与纯函数；新增独立的 Zustand/AsyncStorage 语言设置 store；新增可复用设置按钮和语言选择弹窗；在现有屏幕与展示组件内使用当前语言。服务端协议继续传稳定错误/状态码，客户端根据码显示翻译。翻牌 WAV 继续通过既有 `playCardFlipSound` API 播放，仅替换资源并记录来源许可。

## 任务 1：提供真实单张纸牌翻面音效

**文件：** `assets/audio/card-flip.wav`、`assets/audio/SOURCES.md`，需要时更新 `src/services/__tests__/gameFeedback.test.ts`。

1. 查验已确认的 Pixabay 纸牌拟音素材页面和许可，取得对应的单张纸牌处理录音。裁剪为“抽出/翻面/轻落”的清晰短段；用 FFmpeg 输出与 Expo Audio 兼容的单声道 PCM WAV。保留素材标题、作者（页面可查时）、原始链接、许可链接、裁剪说明及输出格式在 `SOURCES.md`。
2. 先添加资源回归测试：文件存在且可读；RIFF/WAVE 有效；音频长度在适合一次翻牌的短时范围；采样数据含有非静音内容。测试需对实际 WAV 字节作判断，不只断言路径字符串。
3. 运行 `npm test -- --runInBand src/services/__tests__/gameFeedback.test.ts`，确认新资源约束在实现前失败；随后裁剪/替换资源并使测试通过。
4. 确认 `playCardFlipSound` 的播放语义仍为本机翻牌即时一次、对手翻牌事件一次、本机服务端回声不重复；保留已存在的立即播放回归测试和前轮修复。

## 任务 2：建立强类型双语文案与本地语言设置

**文件：** 新增 `src/i18n/types.ts`、`src/i18n/translations.ts`、`src/i18n/index.ts`、`src/i18n/__tests__/translations.test.ts`、`src/store/settingsStore.ts`、`src/store/__tests__/settingsStore.test.ts`。

1. 先为文案 API 写测试：默认语言为 `zh-CN`；`translate(language, key, params)` 能获取中英文并插入房间码/昵称/牌数等参数；错误码和加入申请状态有本地化映射；未知错误码返回当前语言通用提示；玩家座位标签按语言显示“玩家 1 / 玩家 2”和“Player A / Player B”。测试枚举所有文案键并断言两种语言键集合一致、无空字符串。
2. 运行 `npm test -- --runInBand src/i18n/__tests__/translations.test.ts`，确认缺失模块或缺失映射导致失败；实现由 `as const` 或等效方式推导的键类型、插值函数和错误/状态码 formatter，不引入新依赖。
3. 为 `createSettingsStore(storage)` 写独立持久化测试：新安装默认中文；选择英文/中文立即更新；重启后异步恢复选择；损坏/未知持久值安全回退中文；存储失败后仍可使用且 hydration 完成。只持久化语言，不把 hydration 标志持久化，不动现有昵称/头像 store。
4. 运行 `npm test -- --runInBand src/store/__tests__/settingsStore.test.ts`，先确认失败，再实现 Zustand + AsyncStorage store。store key 使用独立、稳定名称，如 `bellfive-settings`。

## 任务 3：添加三个屏幕共用的语言设置入口

**文件：** 新增 `src/components/LanguageSettings.tsx` 与对应测试；入口、等待室及牌桌挂载该组件。

1. 先写交互测试：设置按钮可访问；点开显示简体中文与 English 选项；选择一种语言调用 store 并关闭弹窗；当前选项有可访问的选中状态；再次打开显示当前语言。覆盖入口/等待室/牌桌至少各一处设置入口。
2. 运行 `npm test -- --runInBand src/components/__tests__/LanguageSettings.test.tsx` 确认失败后实现复用的 `LanguageSettings` 轻量弹窗，使用 RN 原生 `Modal`/`Pressable`，不增加依赖。按钮与弹窗自身的标签根据当前语言显示，切换后父屏即时重渲染。

## 任务 4：翻译房间入口、等待室、资料和分享文案

**文件：** `RoomEntry.tsx`、`WaitingRoom.tsx`、`AvatarPicker.tsx`、相关测试，以及需要时更新 `profile.ts` 显示名称辅助函数。

1. 先在 RoomEntry/WaitingRoom/AvatarPicker 测试内加入中文默认和英文切换断言；增加错误码/申请状态展示断言、分享文本断言、头像无障碍中文/英文断言。确保不把服务端英文 `message` 原文直接渲染到界面。
2. 分别运行受影响 Jest 测试，确认新增断言先失败。
3. 将房间创建、开放房间、加入申请、房间码校验、审批/拒绝、连接/准备状态、邀请分享、离开房间、昵称头像标签等玩家可见文案接入翻译 API。将本地校验错误改为翻译键而非硬编码句子；申请状态依据稳定 `status` 值翻译；网络/服务器错误通过 `code` 映射，未知码使用本地通用提示。
4. 玩家自定义昵称和房间码保持原样；无昵称时座位名随语言显示“玩家 1/2”或“Player A/B”。

## 任务 5：翻译牌桌、活动日志、卡牌标签和调试面板

**文件：** `GameScreen.tsx`、`BellButton.tsx`、`PlayerDeck.tsx`、`GameCard.tsx`、`RingActivityLog.tsx`、`DebugPanel.tsx` 和对应测试。

1. 先为这些测试补充中英文断言，覆盖轮次/等待/断线/回合结束、翻牌/抢铃、胜负/再战、双方抢铃日志、卡牌/牌堆无障碍标签、调试标签。日志须保留最近 12 条行为和内容，仅将各条随语言切换，不改变协议或记录数量。
2. 运行相应组件 Jest 用例确认新增测试先失败。
3. 使用翻译 API 替换所有硬编码玩家可见英文；错误信息统一按错误码显示。`DebugPanel` 项目标签、值标签都双语化。保证双端活动日志分别按各自手机语言显示。
4. 在 `GameScreen` 顶部加入语言入口，不遮挡离房和倒计时控件。检查屏幕组件与子组件没有重复使用同一翻译导致内容重复。

## 任务 6：全量检查和变更复核

1. 执行 `npm test -- --runInBand`、`npm run typecheck` 和 `npm run server:typecheck`；若服务器 Jest 测试受本轮 UI 变化之外的既存失败影响，记录并与已有基线区分。
2. 检查 `git diff`，确认玩法规则、房间协议、服务器裁定、铃声/胜负音源未被改动；确认前轮未提交的错误铃声冷却和本地音效修复仍存在。
3. 搜索所有面向玩家的硬编码英文，逐条审阅；品牌名 BellFive、用户自定义昵称、房间码、协议字段、emoji 除外。检查中英文翻译键齐全、分享与辅助技术文本均可理解。
4. 本地单测无法验证实体手机扬声器音色与音量；最终说明需要在 Expo 开发环境翻牌试听一次，并交代素材来源。

## 自审

- 覆盖了设计稿中的默认中文、本地持久化、三个屏幕设置入口、完整玩家可见文案范围、稳定错误码映射、实体纸牌短拟音与单次播放要求。
- 保持了服务端协议和两端语言隔离；没有扩展到第三语言、登录、在线偏好或 UI 改版。
- 每项均先增加针对行为的失败测试，再实现并运行；最终采用完整测试和 TypeScript 检查。
- 当前工作树含上一轮未提交改动；执行时只追加本计划需要的修改，不回滚或覆盖它们。
