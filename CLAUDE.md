# 听墨 (TingMo) v0.3.0 — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式。

**v0.3.0**: SenseVoiceSmall 本地 ASR（sherpa-onnx，中英日韩粤 + 内置 ITN 标点）+ LLM 润色/翻译（OpenAI 兼容 API，同一套 Key/Model/Endpoint，不同 System Prompt）

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | sherpa-onnx WASM | Zustand | 5 语言 i18n

## 运行

```bash
npm run dev            # Vite dev server (端口 5173)
npm run electron:dev   # 构建主进程 + 启动 Electron
npm run build          # 完整构建: tsc + vite build + esbuild main/preload
npm run build:main     # 仅构建主进程和 preload
npm run electron:build # 完整构建 + electron-builder 打包
```

**只需一个终端**：`npm run dev` 自动启动 Vite → 等待端口就绪 → 编译主进程 → 启动 Electron。开发不再需要两个终端。

## 架构

| 进程 | 职责 |
|------|------|
| Main (`electron/main.ts`) | App 生命周期、键盘钩子、文字注入、托盘、sherpa-onnx ASR 推理、LLM 润色/翻译、词典纠错、统计/历史、自动更新 |
| Renderer (`src/`) | React UI：浮窗胶囊、设置窗口、音频采集 |
| Preload (`electron/preload.ts`) | contextBridge 暴露 `window.tingmo` API |

### 状态机

```
IDLE →(右Alt)→ RECORDING →(右Alt)→ RECOGNIZING →(refining)→ SUCCESS →(800ms dismiss)→ IDLE
```

`refining` 仅在 LLM 润色/翻译时出现，离线时跳过。任何错误直接回到 IDLE。

### 数据流

1. 右 Alt → `SetWindowsHookExW` → Main 拦截 key-down（`consume: true`）+ 注入虚假 key-up（`keybd_event` 防卡键）→ 发 `voice:state-change` + `voice:translate-mode` → 浮窗显示
2. 渲染进程 Web Audio API 采集 PCM（AGC 开启 + 0.8 平滑）→ 线性插值重采样到 16kHz → 编码 WAV → IPC `voice:transcribe`
3. Main 进程：
   - **直接 sherpa-onnx**（每次录音独立创建 recognizer，无状态缓存问题）
   - sherpa-onnx 加载 SenseVoiceSmall ONNX → 带标点文字（内置 ITN，语言自动检测）
   - **幻听过滤**（白名单：单字/短词幻觉）
   - **词典模糊纠错**（Levenshtein 编辑距离，短词容错 ≤1，长词 ≤2）
   - **LLM 润色**（`refineEnabled` 开启时）→ 5 种模式 + 自定义 Prompt
   - **LLM 翻译**（右 Shift 触发时）→ 复用润色的 LLM Provider（同一 API Key/Model/Endpoint）
   - **录音时静音**（`IAudioEndpointVolume::SetMute` + `Guid.Empty`，无 OSD 弹窗）
4. `SendInput + KEYEVENTF_UNICODE` 逐字符 Unicode 注入
5. 统计/历史持久化到 `userData/data/`
6. 渲染进程 800ms 后自动播放 dismiss 动画，回到 IDLE

### worker 上下文保护

sherpa-onnx 内部 Web Worker 会加载主进程打包文件。模块顶层所有 `app.*` 调用必须用 `if (app)` 守卫或 `try-catch` 包裹，否则在 worker 上下文中 `app` 为 undefined 导致崩溃弹窗。

## 核心文件

```
electron/
├── main.ts              # App 生命周期、IPC、ASR 推理管线、LLM 润色/翻译、词典纠错、统计/历史、自动更新
├── preload.ts           # window.tingmo API (IPC bridge)
├── hotkey.ts            # SetWindowsHookExW 低层键盘钩子 (koffi) + keybd_event 虚假 key-up 防卡键
├── hotkey-events.ts     # 按键去重、右 Alt 状态跟踪（key-down consume、key-up consume）、Esc 检测
├── text-inserter.ts     # SendInput Unicode 逐字符注入 (koffi)
├── tray.ts              # 系统托盘（状态叠加色点、NB 风格菜单）
├── tray-i18n.ts         # 托盘菜单翻译 (5 语言)
├── audio-ducking.ts     # 录音时静音（IAudioEndpointVolume COM，内联 PowerShell，Guid.Empty 无 OSD）
├── stats-history.ts     # 统计/历史/每日统计持久化 (JSON)
└── logger.ts            # 文件日志（未启用，直接 console）

src/
├── App.tsx              # I18nProvider + hash 路由: / → 浮窗, #/settings → 设置, #/onboarding → 引导
├── env.d.ts             # window.tingmo 类型声明
├── main.tsx             # React entry (createRoot)
├── i18n/
│   ├── translations.ts  # 5 语言翻译字典 (~100 键)
│   └── context.tsx      # React i18n Context + Provider + useI18n() hook
├── components/
│   ├── FloatingWindow.tsx    # 黑色胶囊 118×38px（15 根竖条波形，Web Animations API + flushSync 稳定性）
│   └── Settings/
│       ├── SettingsWindow.tsx  # NB 风格设置窗口 (侧边栏 4 Tab)
│       ├── HomePanel.tsx       # 主页：今日统计 + 累计统计 + 近 7 天柱状图 + 历史列表
│       ├── DictionaryPanel.tsx # 单输入词典 (标签展示)
│       ├── HotkeyRecorder.tsx  # 快捷键录制 (i18n 修饰键名)
│       ├── NbSelect.tsx        # 自定义 NB 下拉菜单
│       ├── MicDevicePicker.tsx # 麦克风设备枚举 + 选择
│       ├── UpdatePanel.tsx     # 自动更新：检查/下载/安装 + 进度条
│       └── OnboardingWizard.tsx # 首次启动 3 步引导 (i18n 快捷键名)
├── hooks/
│   ├── useVoiceInput.ts   # IPC → React 状态机 hook (idle/recording/recognizing/refining/success)
│   └── useAudioCapture.ts # Web Audio 采集 + 16kHz 重采样 + WAV 编码 + RMS 静音检测
├── services/
│   ├── speech-recognition.ts  # IRecognitionProvider 接口
│   ├── funasr-sherpa.ts       # SherpaASRProvider — sherpa-onnx 本地 ASR
│   ├── funasr-cloud.ts        # FunASRCloudProvider — OpenAI Whisper API 云端 ASR
│   ├── llm-refine.ts          # IRefinementProvider 接口 + 5 种润色模式/1 种翻译 System Prompt
│   ├── llm-openai.ts          # OpenAIProvider — OpenAI 兼容 chat/completions API（润色和翻译共用）
│   └── model-downloader.ts    # 多源镜像下载 SenseVoiceSmall 模型 (hf-mirror→HF→GitHub, Range 续传)
├── store/settings.ts      # Zustand store (精简后字段 + 持久化/水合)
└── styles/global.css      # 全局样式 (胶囊/波形条/NB设置/历史/词典/开关/输入框/柱状图)
```

## 设置窗口

**Frameless 无系统标题栏**（`frame: false`），自定义 NB 风格标题栏。

### 标题栏

38px 白色标题栏，左侧 `img.nb-titlebar-logo`（18×18）+ "TingMo" 品牌名，右侧三颗窗口控制按钮。标题栏整体 `-webkit-app-region: drag` 可拖拽，按钮区域 `no-drag`。

- 最小化/最大化/关闭 IPC：`window:minimize` / `window:maximize` / `window:close`
- 最大化状态通过 `window:maximize-change` 事件通知渲染进程切换图标
- 关闭按钮 hover 红色 `#ff5555`

### 侧边栏

NB 卡片风格：`border: 3px solid #000` + `box-shadow: 4px 4px 0 #000`，`margin: 12px`。导航按钮扁平圆角，激活态浅灰底 `#f5f5f5` + 左侧橙色竖线 `border-left: 3px solid #FF5A1F`。底部版本号 `V0.3.0`。

### 滚动条

5px 宽 `#ddd` 圆角滑块，透明轨道。

### 标签页

| 标签 | 内容 |
|------|------|
| **主页** | 今日次数/时长/字数 + 累计统计 + 近 7 天柱状图 + 搜索/清空历史列表 |
| **词典** | 单输入添加词汇、标签展示、× 删除、模糊纠错 |
| **模型** | ASR（本地/API 切换；本地模式显示引擎+框架，云模式只显示 Key）+ LLM（Key/模型/端点/润色开关，翻译复用此配置） |
| **设置** | 快捷键、音频（麦克风/录音静音）、翻译（目标语言选择器，翻译复用 LLM 配置）、选项（开机自启/词典/界面语言）、关于、更新 |

### 界面语言

侧边栏底部 5 语言下拉切换（简体中文 / 繁體中文 / English / 日本語 / 한국어）。首启根据 `app.getLocale()` 自动检测。所有 UI 文字通过 i18n 翻译，禁止硬编码中文。

### UI 样式要点

- `.nb-titlebar` 标题栏：38px，`justify-content: space-between`
- `.nb-titlebar-brand` 品牌区：logo 18×18 + 14px/700 字体
- `.nb-win-btn` 窗口按钮：36×36px，左侧 2px 黑线分隔
- `.nb-sidebar` 侧边栏卡片：3px 黑边框 + `4px 4px 0` 阴影
- `.nb-nav-item` 导航按钮：无阴影，激活态左橙色竖线
- `.nb-section:first-child` margin-top: 12px；其余 24px
- `.nb-main` 内容区 padding-top: 0

### 设置持久化

所有设置（快捷键、词典、UI 语言、LLM 配置等）自动保存到 `%APPDATA%/tingmo/data/settings.json`，500ms debounce。API Key 通过 Electron `safeStorage` (DPAPI) 单独加密存储。重启后自动恢复。

## 快捷键

**录音快捷键可配置**：支持右 Alt / 左 Alt / 右 Ctrl / 左 Ctrl / 右 Shift / 左 Shift 中任一键。设置界面录制快捷键后立即生效，主进程重新注册键盘钩子。

**翻译修饰键可配置**：默认右 Shift，录音时同时按住修饰键触发翻译模式。

## 词典系统

两层生效：
- **始终**：ASR 输出后 Levenshtein 模糊纠错（短词容错 ≤1 编辑距离，长词 ≤2）
- **LLM 启用时**：System Prompt 中声明专属词汇保持不修改

## LLM 润色/翻译

- 润色和翻译**共用同一个 LLM Provider**（API Key、Model、Base URL）
- `refineEnabled` 控制自动润色是否执行
- 翻译始终可用（只要有 LLM Provider），通过不同 System Prompt 实现
- 无独立翻译 API Key / Model / Endpoint 配置
- LLM Provider 在有 API Key 时总是创建，不受 `refineEnabled` 影响

## 位置漂移修复

浮窗定位的完整方案（`electron/main.ts`），禁止恢复为原始缓存方式：

- 使用屏幕物理边界 `display.bounds` + `display.workArea` 计算任务栏高度
- `setBounds` 原子设置位置+尺寸（非 `setPosition`）
- 不监听 `moved` 事件（DWM 微调会污染缓存）
- 不缓存 `floatingPosition`（每次呼出重新计算）
- `setImmediate` 二次定位：show 后在下一个 tick 覆盖 DWM 异步调整

## 键盘钩子防卡键

- 右 Alt key-down: `consume: true`（拦截，防止 IDE 失焦）
- 拦截后立即 `keybd_event(VK_RMENU, 0, KEYEVENTF_KEYUP, 0)` 注入虚假 key-up
- 钩子检测 `LLKHF_INJECTED` 标志，注入事件放行给系统
- 真实 key-up: `consume: true`（无应用见过 key-down，弹起无意义）

## 胶囊稳定性

- appear 动画使用 `flushSync(() => setVisible(true))`（React 18）强制同步 DOM 提交
- dismiss 延迟 800ms（渲染进程端 timer）+ 200ms 动画

## IPC API (`window.tingmo`)

| 方法 | 方向 | 用途 |
|------|------|------|
| `onVoiceStateChange(cb)` | Main→Renderer | 状态变化 |
| `onRecognitionDone(cb)` | Main→Renderer | 识别完成 (charCount, durationMs) |
| `onModelProgress(cb)` | Main→Renderer | 模型下载进度 |
| `onTranslateMode(cb)` | Main→Renderer | 翻译模式激活 |
| `onRefineFailed(cb)` | Main→Renderer | 润色失败通知 |
| `onSettingsChanged(cb)` | Main→Renderer | 设置变更通知 |
| `openSettings()` | Renderer→Main | 打开设置窗口 |
| `transcribe(buf, lang, opts?)` | Renderer→Main | 发送音频（opts: translate, translateTarget, dictionary, polishMode, customPrompt） |
| `copyText(text)` | Renderer→Main | 复制到剪贴板 |
| `cancelRecording()` | Renderer→Main | 取消录音 |
| `finishRecording()` | Renderer→Main | 结束录音 |
| `getStats()` / `getOverview()` | Renderer→Main | 统计数据 |
| `getHistory()` / `clearHistory()` | Renderer→Main | 历史记录 |
| `getSystemLocale()` / `setUiLanguage()` | Renderer→Main | 界面语言 |
| `getApiKey()` / `setApiKey()` | Renderer→Main | API Key 加解密 |
| `saveLlmSettings(s)` | Renderer→Main | LLM 配置持久化（refineEnabled, llmModel, llmBaseUrl, asrProvider） |
| `initRefinement()` | Renderer→Main | 初始化 LLM Provider（润色/翻译共用） |
| `getRefinementStatus()` | Renderer→Main | 查询 LLM 状态 |
| `loadAppSettings()` / `saveAppSettings()` | Renderer→Main | 设置持久化 |
| `checkForUpdates()` / `downloadUpdate()` / `installUpdate()` | Renderer→Main | 自动更新 |
| `onUpdateAvailable/Progress/Downloaded` | Main→Renderer | 更新事件 |
| `debugSaveWav(buf, name)` | Renderer→Main | 调试录音保存 |
| `minimizeWindow()` | Renderer→Main | 最小化设置窗口 |
| `maximizeWindow()` | Renderer→Main | 最大化/还原设置窗口 |
| `closeWindow()` | Renderer→Main | 关闭设置窗口 |
| `onMaximizeChange(cb)` | Main→Renderer | 最大化状态变化通知 |
| `setMuteOnRecord(enabled)` | Renderer→Main | 设置录音静音开关 |
| `setRecordingHotkey(key)` | Renderer→Main | 更新录音快捷键 |
| `setTranslateModifier(key)` | Renderer→Main | 更新翻译修饰键 |

## 翻译目标语言

`en` / `zh` / `ja` / `ko` / `fr` / `de` / `es`（TranslateLang 类型）

## 模型下载

`src/services/model-downloader.ts` — 多源镜像 + HTTP Range 断点续传 + 速度日志。

下载源顺序：
1. **hf-mirror.com**（国内最快，直下单文件无需解压）
2. **huggingface.co**（官方源）
3. **GitHub Releases**（原始源，tar.bz2 需解压）

HuggingFace 源（1、2）直接下载 `model.int8.onnx` + `tokens.txt`，无需 `tar` 解压。GitHub 源保持 tar.bz2 下载+解压方式。

`ensureModel()` 返回 Promise，进度通过 `DownloadProgress` 回调上报。下载失败自动切换下一源。下载速度每 2 秒打印到控制台。

## 模型文件

存放于 `%APPDATA%/TingMo/models/funasr/`：

| 文件 | 大小 | 用途 |
|------|------|------|
| `model.int8.onnx` | 229MB | SenseVoiceSmall INT8 |
| `tokens.txt` | 309KB | 词表 (25055 tokens) |

模型就绪检查只需 `model.int8.onnx` 存在即可。`tokens.txt` 缺失只打 warning，`SherpaASRProvider.initialize()` 会递归搜索子目录找 tokens。缺文件触发后台补下。

## ASR Provider 动态切换

- 托盘菜单右键 → Voice Mode → 本地/云端，切换后**立即生效、无需重启**
- `tray.ts` 导出 `setOnAsrProviderChange(cb)`，main.ts 注册回调 → 触发 `initRecognition()` 重新加载
- 设置窗口 ASR 切换通过 `saveLlmSettings` IPC 持久化，需重启生效（TODO: 应统一触发 re-init）
- **云 ASR 无 API Key 时**：不静默回退到本地，而是 `sendToRenderer('voice:refine-failed', ...)` 通知用户
- SherpaASRProvider 改为**静态 import**（`import { SherpaASRProvider } from '../src/services/funasr-sherpa'`），不再用动态 require

## 录音时静音

- **实现**：`IAudioEndpointVolume` COM 接口，通过常驻 PowerShell 进程控制
- **无 OSD 弹窗**：`SetMute(value, Guid.Empty)` — 空 GUID 告诉 Windows 这是程序操作而非物理按键
- **状态感知**：录音前记录 `wasMutedBefore`，停止后仅恢复未被用户手动静音的情况
- **开关位置**：设置窗口（音频 → 录音时静音）+ 托盘右键菜单（勾选项），通过 IPC `settings:set-mute-on-record` 双向同步
- 默认开启（`muteOnRecord: true`），通过 `loadMuteOnRecord()` 从 settings.json 读取

## 已知限制 / 重要教训

- **仅 Win x64**：不支持其他平台
- **API Key 加密**：Electron safeStorage (DPAPI)，仅本机解密
- **SendInput 无法检测注入成功/失败**：需 TSF 才能精准检测
- **透明窗口 + box-shadow = 灰色光晕**：胶囊永不使用外阴影
- **CSS @keyframes animationend 不可靠**：统一用 Web Animations API
- **esbuild CJS 中不可顶层 return**：ESM 文件使用 `if (app) { ... }` 守卫替代
- **位置漂移**：禁止恢复 `win.on('moved')` 和 `floatingPosition` 缓存，详见"位置漂移修复"章节
- **键盘卡键**：右 Alt key-up 不可放行，必须用虚假 key-up 注入机制，详见"键盘钩子防卡键"章节
- **设置文件双重存储**：`settings.json`（App 设置）+ `llm-settings.json`（LLM/ASR 设置），两者独立但 asrProvider 在两个文件中都存在
- **hotkey.ts `currentVk` 必须声明**：`let currentVk: number = VK_RMENU`，否则按键钩子每个事件都抛 `ReferenceError`
- **禁止模块顶层导入 Node built-in（如 `import fs from 'fs'`）**：sherpa-onnx worker 会加载主进程打包文件，模块顶层 `require("fs")` 在 worker 上下文中可能出问题。所有函数内部用 `const fs = require('fs')`
- **SherpaASRProvider 用静态 import 而非动态 require**：`import { SherpaASRProvider } from '../src/services/funasr-sherpa'` 放在 main.ts 顶部。动态 require 经 esbuild 打包后可能模块初始化顺序不对
- **ASR 模型检查只要求 model.int8.onnx**：tokens.txt 缺了只打 warning（funasr-sherpa.ts 会递归搜索子目录）。不要因为 tokens 缺失阻止本地 ASR 加载
- **COM 接口 vtable 偏移要精确**：`IAudioEndpointVolume` 有 14 个方法在 SetMute 前面（3 IUnknown + 11 音频方法），多一个 void 占位就会对不上。用 `Marshal.ThrowExceptionForHR` 检查 HRESULT，出问题直接报错而不是静默失败
- **`GetDefaultAudioEndpoint(0, 1, ...)`**：dataFlow=0 (eRender)，role=1 (eMultimedia)，不是 eConsole
- **`Activate(ref iid, 23, 0, ...)`**：CLSCTX_ALL=23，activationParams 是 int 不是 IntPtr
- **静音无 OSD**：`SetMute(value, Guid.Empty)` — 空 GUID 抑制 Windows 音量 OSD 弹窗。不要用 keybd_event 或 SendInput 模拟按键，会触发系统提示
