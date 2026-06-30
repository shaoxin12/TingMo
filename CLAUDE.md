# TingMo — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Shift + 右 Alt 触发翻译模式。

**当前版本 V0.4.2**: SenseVoiceSmall 本地 ASR（sherpa-onnx）+ 3 家云端 ASR + 8 家 LLM 润色/翻译，流式注入，原生托盘菜单。

> 🎙️ Vibe Coding 项目 — 代码主要由 Claude Code 生成，人工做方向决策和审核。

## 核心开发法则

### 🔴 首要原则：不破坏已有功能

1. **理解再动手**：修改前必须先理解代码作用
2. **保留安全守卫**：`if (app)`、`?.` 可选链等防御性写法必须保留
3. **逐项验证**：改完后逐一验证已有功能
4. **最小改动**：能改一行不改十行
5. **回滚准备**：发现改错立即回退

### 架构约束

- **透明窗口禁 box-shadow**：产生灰色光晕，用 border 替代
- **托盘菜单是原生 Menu**（`tray.popUpContextMenu`），不是 BrowserWindow 弹窗
- **两个 BrowserWindow 有独立 Zustand store**，跨窗口同步靠 main 进程广播 `settings:changed`
- **sherpa-onnx 非线程安全**：`isBusy` 互斥锁防止并发调用
- **浮窗 `hasShadow: false` + `stripDwmFrame`** 消除透明窗口 DWM 阴影

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron + React + TypeScript | 33 / 18 / 5.6 |
| 构建（主进程） | esbuild | 0.28 |
| 构建（渲染进程） | Vite | 6.0 |
| 本地 ASR | sherpa-onnx + onnxruntime-node | 1.13 / 1.26 |
| FFI | koffi | 2.16 |
| 状态管理 | Zustand | 5.0 |
| 拼音匹配 | pinyin | 4.0 |
| 自动更新 | electron-updater | 6.3 |
| 打包 | electron-builder（NSIS） | 25.1 |
| 测试 | tsx 内置 test runner | 4.22 |

## 运行

```bash
npm run dev            # Vite + esbuild + Electron（主进程热更新）
npm run build:main     # 仅构建主进程和 preload
npm run build          # 完整构建
npm run electron:build # 完整构建 + electron-builder 打包
npm run release:patch  # npm version patch + electron:build
npm run release:minor  # npm version minor + electron:build
npm run test:unit      # hotkey-events 单元测试
```

**开发环境**：Vite dev server `localhost:5173`，Electron 加载 `localhost:5173/#/`（浮窗）/ `#/settings` / `#/onboarding`。`scripts/dev.mjs` 用 chokidar 监听 `electron/**/*.ts`，自动 esbuild + 重启 Electron。

## 架构

### 进程模型

| 进程 | 入口 | 职责 |
|------|------|------|
| Main | `electron/main.ts` (1613行) | 生命周期、键盘钩子、文字注入、托盘、ASR/LLM 调度、词典纠错、统计、自动更新、设置持久化 |
| Renderer | `src/App.tsx` | React UI：浮窗胶囊、设置窗口、音频采集、引导向导 |
| Preload | `electron/preload.ts` (160行) | `contextBridge` 暴露 `window.tingmo` API（50+ 方法） |

### 窗口

- **浮窗** (`FloatingWindow`): 160×44px，透明无框，alwaysOnTop，非 focusable，DWM shadow 已剥离。显示胶囊 UI
- **设置窗口** (`SettingsWindow`): 900×660px，无框自定义标题栏，hash 路由 `#/settings` / `#/onboarding`。4 个侧边栏 Tab：首页、词典、模型、设置
- **两个窗口独立 Zustand store** → main 进程 `save-app-settings` 后广播 `settings:changed` 同步

### 状态机

```
IDLE →(热键)→ RECORDING →(热键/松键)→ RECOGNIZING →(LLM refine)→ REFINING → SUCCESS →(800ms)→ IDLE
                           ↘(失败)→ IDLE
```

- **Toggle 模式**（默认）：按一下开始，再按停止
- **Hold 模式**：按住录音，松键停止
- **翻译模式**：独立组合键或修饰键 + 录音热键触发
- **看门狗**：RECOGNIZING 态 15 秒超时强制重置
- **强制重置**：任意非 IDLE 态按下热键 → 重置到 IDLE
- **无音频回退**：hold 模式快速按松无 PCM → `cancelRecording()` 重置

### 数据流（完整 pipeline）

```
1. 热键 → SetWindowsHookExW → Main 拦截 key-down + injectKeyUp（注入虚假 key-up）
2. Renderer Web Audio API 采集 48kHz PCM → 抗混叠重采样 16kHz → 编码 WAV
3. 流式 ASR（录音期间）:
   - 本地: 每 2s 发增量 PCM（0.5s 重叠），静音段跳过（hasAudioSignal 能量检测）
   - 云端(火山/阿里): WebSocket 每 500ms 发增量 PCM
4. 松键 → voice:transcribe:
   - 流式结果可用 (>20s 音频 或 ≥4 字) → 直接复用 preAsrText
   - 否则 → 完整 ASR
5. 幻听过滤: 精确匹配 + 比例检测（≥85% 且 ≥3 段）+ 标点清理
6. 词典纠错: 拼音匹配 → Levenshtein 距离（applyDictionary）
7. LLM 润色（如启用且 >5 字且非翻译）:
   - streamRefine 逐 chunk → injectText 逐字注入（打字机效果）
   - 失败 → 注入原始 ASR 文本
8. 翻译模式: LLM translate → 成功注入译文 / 失败显示错误面板
9. 注入: SendInput + KEYEVENTF_UNICODE，\n → Shift+Enter
10. 统计/历史持久化
```

## ASR 引擎

### 本地 — SenseVoiceSmall

| 字段 | 值 |
|------|-----|
| 文件 | `src/services/funasr-sherpa.ts` |
| 模型 | `%APPDATA%/TingMo/models/funasr/model.int8.onnx` (~230MB) |
| tokens | `tokens.txt`（支持子目录搜索） |
| 语言 | zh / en / ja / ko / yue（ITN 开启） |
| 流式 | 每 2s 增量 chunk，0.5s 重叠 |
| 并发 | `isBusy` 互斥锁 |
| 长音频 | >12s 分段 10s 重叠 chunk + 文本去重 |

### 云端 — OpenAI Whisper

| 字段 | 值 |
|------|-----|
| 文件 | `src/services/funasr-cloud.ts` |
| 端点 | 自定义 baseUrl + `/audio/transcriptions` |
| 模型 | whisper-1 / large-v3 / large-v3-turbo |
| 协议 | HTTP POST multipart/form-data |
| 鉴权 | Bearer token |
| 分段 | 重叠 chunk 并行 `Promise.all` |

### 云端 — 火山引擎

| 字段 | 值 |
|------|-----|
| 文件 | `src/services/asr-volcano.ts` |
| 端点 | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream` |
| 模型 | doubao-seed-asr-2.0 / bigmodel |
| 协议 | 自定义二进制帧（header + PCM payload） |
| 鉴权 | X-Api-Key header + Resource ID |
| 流式 | 全程 WebSocket，录音时增量发送 |
| 连接测试 | 真实 WebSocket（非 HTTP `/submit`） |

### 云端 — 阿里云 Fun-ASR

| 字段 | 值 |
|------|-----|
| 文件 | `src/services/asr-aliyun.ts` |
| 端点 | `wss://dashscope.aliyuncs.com/api-ws/v1/inference` |
| 模型 | fun-asr-realtime / qwen3-asr-flash-realtime / qwen3.5-omni-plus-realtime / fun-asr-flash |
| 协议 | Fun-ASR: `run-task` → `task-started` → binary PCM → `result-generated` → `finish-task` → `task-finished` |
| 注意 | 这是 Fun-ASR，不是 Qwen-ASR-Realtime（`/api-ws/v1/realtime`） |
| 鉴权 | Bearer token |
| 回退 | HTTP 异步批处理模式 + 轮询 |

## LLM 润色

### 三档润色模式

| 模式 | 值 | 行为 |
|------|------|------|
| 轻量 | `light` | 只补标点 + 修正明显错字，不改措辞 |
| 均衡 | `balanced` | 去口癖 + 纠错 + 补标点 + 保留原意（默认） |
| 结构化 | `deep` | 口语转书面 + 分行分点 + 结构化整理 |

- Prompt 在 `src/services/llm-refine.ts`（3 个独立 Prompt + `buildRefinePrompt`）
- 流式注入：`for await (chunk of streamRefine) injectText(chunk)`（逐 chunk 直接注入）
- ≤5 字短路：跳过 LLM 直接注入

### 8 家 LLM 服务商

| Key | 名称 | 默认模型 | 鉴权 | 实现 |
|-----|------|---------|------|------|
| `openai` | OpenAI | gpt-4o-mini | Bearer | llm-openai.ts |
| `deepseek` | DeepSeek | deepseek-v4-flash | Bearer | llm-openai.ts |
| `kimi` | Kimi (Moonshot) | moonshot-v1-8k | Bearer | llm-openai.ts |
| `minimax` | MiniMax | MiniMax-M2.5 | Bearer | llm-openai.ts |
| `zhipu` | 智谱 AI | glm-4-flash | Bearer | llm-openai.ts |
| `gemini` | Google Gemini | gemini-2.5-flash | API Key (Query) | llm-gemini.ts |
| `ollama` | Ollama | llama3.2 | None | llm-openai.ts |
| `volcano` | 火山引擎 | doubao-seed-2.1-turbo | Bearer | llm-openai.ts |

- `llm-openai.ts`: OpenAI 兼容 SSE `/chat/completions`（`stream: true`），温度 0.1，max_tokens 256/1024，30s 超时
- `llm-gemini.ts`: Google `streamGenerateContent` SSE 端点
- Provider 注册表：`src/services/llm-providers.ts`（`LLM_PROVIDERS` + `getLLMModels`）

## 热键系统

### 默认热键

- 语音输入：**右 Alt**（VK_RMENU = 0xA5）
- 翻译输入：**右 Shift + 右 Alt**（可通过设置自定义）

### 两种模式

1. **修饰键模式**（含录音热键 VK）：按住其余键 + 录音热键触发翻译
2. **独立组合键**（不含录音热键 VK）：所有键同时按下触发

### 支持按键

- 录音热键：仅修饰键（左右 Shift/Ctrl/Alt）
- 翻译热键：修饰键 + Insert、Delete、F1-F12、Home、End、PageUp/Down、Space、Tab 等

### 实现

- `electron/hotkey.ts`: `SetWindowsHookExW` + `WH_KEYBOARD_LL`
- 消费 key-down/key-up 防止 Alt 激活菜单
- `keybd_event` 注入虚假 key-up 防止系统认为按键卡住
- `LLKHF_INJECTED` 标记检测注入事件并放行
- Esc 检测但不消费（取消当前录音）
- `setHookPaused(true)` 用于设置页录制热键时暂停钩子

## 托盘

### 原生菜单（右键）

用 `tray.popUpContextMenu(Menu.buildFromTemplate(...))`，每次右键重新构建以反映最新状态：

- 本地 / API（radio — 切换 ASR 引擎）
- 按下 / 按住（radio — 切换录音模式）
- 录音时静音（checkbox）
- ──
- 设置
- ──
- 退出

### 图标状态

- 默认：正常
- 红色 tint：录音中
- 蓝色 tint：识别中

### 左键

打开设置窗口

## 文本注入

`electron/text-inserter.ts`:
- `SendInput` + `KEYEVENTF_UNICODE` 逐字符注入
- 批量构建 INPUT 结构体，单次 SendInput 调用
- `\n` → Shift+Enter（4 个 INPUT 结构体），不触发聊天发送

## 设置与配置

### Zustand Store (`src/store/settings.ts`)

所有设置持久化到 `%APPDATA%/TingMo/data/settings.json`。`set*` 方法触发 300ms 防抖 `saveAppSettings`。

可配置项：asrProvider、recordMode、hotkey、translateHotkey、language、launchAtStartup、muteOnRecord、useDictionary、dictionary、refineEnabled、polishMode、llmProvider/Model/ApiKey/BaseUrl、asrCloudProvider/Model/ApiKey、translateTarget、uiLanguage、uiSoundEnabled、selectedMicDeviceId

### 设置窗口同步

两个 BrowserWindow 的 Zustand store 独立 → `settings:save-app-settings` 写盘后 broadcast `settings:changed` 到 settingsWindow 同步状态。

## 关键 IPC

```
# 语音
voice:transcribe                           # 主转写入口
voice:asr-chunk                            # 本地流式 ASR chunk
voice:asr-stream-start / -chunk / -end     # 云端流式 ASR 生命周期
voice:state-change                         # Main → Renderer 状态变更
voice:translate-mode                       # Main → Renderer 翻译模式
voice:refine-failed                        # 润色失败通知
voice:recognition-done                     # 识别完成
voice:finish-recording / cancel-recording  # 录制控制
voice:play-sound                           # Win32 MessageBeep 音效
voice:copy-text                            # 剪贴板复制

# 设置
settings:load-app-settings                 # 读取全量设置
settings:save-app-settings                 # 保存设置（广播到 settingsWindow）
settings:changed                           # Main → Renderer 设置变更通知
settings:set-hotkey / set-translate-hotkey # 热键更新
settings:set-record-mode / set-mute-on-record
settings:set-api-key / get-api-key         # LLM API Key
settings:set-asr-cloud-api-key / get-asr-cloud-api-key
settings:init-refinement / refinement-status
settings:reinit-recognition                # 重新初始化 ASR
settings:set-ui-language

# 模型
model:check                                # 检查模型是否存在
model:ensure                               # 下载模型
model:progress                             # 下载进度推送

# 窗口
floating:resize                            # 浮窗缩放
window:minimize / maximize / close         # 设置窗口控制
window:maximize-change                     # 最大化状态通知

# 其他
shell:open-folder                          # 资源管理器打开文件夹
hotkey:pause                               # 暂停钩子（录制热键时）
asr:test-connection / llm:test-connection  # 连接测试
stats:get / stats:overview                 # 统计数据
history:get / history:clear                # 历史记录
update:check / update:download / update:install  # 自动更新
app:quit                                   # 退出应用
```

## 模型下载

`src/services/model-downloader.ts` + `electron/main.ts` `downloadModel`:
- 3 源：hf-mirror.com raw → HuggingFace raw → GitHub archive
- HTTP Range 断点续传
- 下载进度回调 → settingsWindow + floatingWindow
- tar.bz2 解压提取
- `model:check` 检查 `model.int8.onnx` + `tokens.txt`（支持子目录搜索）

## 统计与历史

`electron/stats-history.ts`:
- `stats.json`：累计时长、字数、会话数
- `daily_stats.json`：每日统计（全量保留）
- `history.json`：语音历史记录（全量保留，含文本、字数、时间戳）
- 原子写入（写临时文件 + rename）

## 打包

`electron-builder.yml`:
- appId: `com.TingMo.app`，productName: `TingMo`
- NSIS 安装包，x64 only
- asar 打包，onnxruntime-node / koffi / sherpa-onnx 解包
- GitHub Releases 发布（owner: shaoxin12, repo: tingmo）
- 桌面快捷方式 + 开始菜单

## 核心文件

```
electron/
├── main.ts              # 核心调度：生命周期、IPC、ASR/LLM、词典、统计、自动更新
├── preload.ts           # contextBridge API（window.tingmo）
├── hotkey.ts            # WH_KEYBOARD_LL 键盘钩子 + injectKeyUp
├── hotkey-events.ts     # 按键去重、状态跟踪
├── hotkey-events.test.ts# 单元测试
├── text-inserter.ts     # SendInput 批量注入（\n→Shift+Enter）
├── tray.ts              # 托盘图标 + 原生右键菜单
├── tray-i18n.ts         # 托盘菜单 5 语言翻译（主进程用）
├── stats-history.ts     # 统计/历史 JSON 持久化
├── audio-ducking.ts     # 录音时系统静音
└── logger.ts            # 日志工具

src/
├── App.tsx                      # 根组件 + hash 路由
├── env.d.ts                     # window.tingmo 类型声明
├── components/
│   ├── FloatingWindow.tsx       # 浮窗胶囊：音频采集调度 + 流式 ASR + 波形 + 翻译
│   ├── ErrorBoundary.tsx        # 错误边界
│   └── Settings/
│       ├── SettingsWindow.tsx   # 设置窗口：4 Tab 侧边栏
│       ├── HomePanel.tsx        # 首页：统计概览 + 历史列表
│       ├── DictionaryPanel.tsx  # 词典：自定义纠错词对
│       ├── ModelPanel.tsx       # 模型：下载状态 + 路径（可点击打开文件夹）
│       ├── UpdatePanel.tsx      # 更新：检查/下载/安装
│       ├── HotkeyRecorder.tsx   # 热键录制器：支持多键组合
│       ├── MicDevicePicker.tsx  # 麦克风设备选择
│       ├── NbSelect.tsx         # 自定义下拉选择器
│       └── OnboardingWizard.tsx # 首次启动引导：欢迎→热键→引擎→配置
├── hooks/
│   ├── useAudioCapture.ts      # Web Audio API：采集、48→16kHz 重采样、VAD、WAV 编码
│   └── useVoiceInput.ts        # 语音状态 Hook：IPC 事件订阅
├── services/
│   ├── speech-recognition.ts   # IRecognitionProvider 接口
│   ├── funasr-sherpa.ts        # 本地 ASR：SenseVoiceSmall
│   ├── funasr-cloud.ts         # 云端 ASR：OpenAI Whisper
│   ├── asr-volcano.ts          # 云端 ASR：火山引擎 WebSocket
│   ├── asr-aliyun.ts           # 云端 ASR：阿里云 Fun-ASR WebSocket + HTTP fallback
│   ├── audio-chunker.ts        # WAV 解析/编码，分段去重
│   ├── llm-refine.ts           # 3 润色模式 Prompt + 翻译 Prompt
│   ├── llm-openai.ts           # OpenAI 兼容 SSE streamRefine
│   ├── llm-gemini.ts           # Gemini streamRefine
│   ├── llm-providers.ts        # 8 LLM + 3 ASR Provider 注册表
│   ├── connection-test.ts      # ASR/LLM 连接测试
│   ├── text-corrector.ts       # 确定性文本纠错（150+ 规则）
│   └── model-downloader.ts     # 多源模型下载（断点续传 + 解压）
├── store/
│   ├── settings.ts             # Zustand：所有用户设置（自动持久化）
│   └── model.ts                # 模型下载状态
├── i18n/
│   ├── translations.ts         # 5 语言翻译字典（~100 键）
│   └── context.tsx             # React i18n Context + Provider
└── styles/
    └── global.css              # 所有样式（浮窗胶囊 + 设置窗口）

scripts/
├── dev.mjs                     # 开发环境编排（Vite + esbuild + Electron + chokidar）
└── rebuild.mjs                 # TCP 触发手动重构建
```

## 已知限制

- **仅 Win x64**
- **SenseVoiceSmall 精度有限**：推荐配合 LLM 润色或云端 ASR
- **API Key 明文存储**于 `%APPDATA%/TingMo/data/settings.json`
- **透明窗口禁 box-shadow**：产生灰色光晕，用 border 替代
- **翻译热键独立键**：该键被全局拦截（如 Insert 不再触发系统功能）
- **录音热键仅修饰键**：Shift / Ctrl / Alt
- **sherpa-onnx 非线程安全**：isBusy 互斥
- **GainNode 300ms fade-in**：消除麦克风启动尖峰
- **托盘菜单是原生风格**：不支持自定义 UI 样式

## 近期变更（2026-06-30）

### V0.4.1
- **原生托盘菜单**：用 `Menu.buildFromTemplate` + `popUpContextMenu` 替代自定义 BrowserWindow 弹窗，解决定位不准、DWM 阴影、与 Windows 溢出面板冲突等问题
- **按住模式修复**：快速按松不卡 recognizing（无音频时 cancelRecording）
- **模型路径可点击**：设置页模型地址点击在资源管理器中打开文件夹
- **新用户引导支持 API Key 填写**：云端引擎选择后可直接配置
- **双击桌面图标打开设置**：每次启动均显示设置窗口
- **设置窗口实时同步**：托盘菜单更改设置后广播 `settings:changed` 到设置窗口
- **按键模式设置**：设置 → 语音 新增按下/按住分段控件
- **文档全面重写**：README / CLAUDE.md / AGENTS.md
