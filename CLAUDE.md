# TingMo — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式。

**当前版本**: SenseVoiceSmall 本地 ASR（sherpa-onnx）+ 3 家云端 ASR + 8 家 LLM 润色/翻译，两阶段注入 + 前缀缓存预热。

## 核心开发法则

### 🔴 首要原则：不破坏已有功能
> 修改代码时，必须确保已有功能不受影响。这是最高优先级。

1. **理解再动手**：任何代码在修改前，必须先理解它的作用。不要轻易认为一段代码是"死代码"或"多余的"——它很可能在特定条件下有重要作用
2. **保留安全守卫**：如 `if (app)`、`?.` 可选链等防御性写法，即使看起来多余也要保留
3. **逐项验证**：改完代码后，逐一验证之前能用的功能是否仍然正常
4. **最小改动**：能改一行不改十行，能加逻辑不改结构
5. **回滚准备**：如果发现改错了，立即回退，不要在原错误上继续叠加修复

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | sherpa-onnx | Zustand | 5 语言 i18n

## 运行

```bash
npm run dev            # Vite + esbuild + Electron（支持主进程热更新）
npm run build:main     # 仅构建主进程和 preload
npm run build          # 完整构建
npm run electron:build # 完整构建 + electron-builder 打包
```

## 测试

```bash
node --experimental-strip-types test/run-test.mjs  # 端到端 ASR→LLM→对比
npm run test:unit                                   # 单元测试（hotkey-events）
```

放 `test/N.wav` + `test/N.md`（期望文本）即可加 e2e 用例。测试跑完整 ASR→LLM→对比链路。使用 SSE streaming + max_tokens: 1024 + 精简 PROMPT_STRUCTURED。

## 架构

| 进程 | 职责 |
|------|------|
| Main (`electron/main.ts`) | App 生命周期、键盘钩子、文字注入、托盘、多 Provider ASR/LLM、词典纠错、统计、自动更新、前缀缓存预热 |
| Renderer (`src/`) | React UI：浮窗胶囊、设置窗口、音频采集 |
| Preload (`electron/preload.ts`) | contextBridge 暴露 `window.tingmo` API |

### 状态机

```
IDLE →(右Alt)→ RECORDING →(右Alt)→ RECOGNIZING →(refining)→ SUCCESS →(800ms dismiss)→ IDLE
```

### 数据流（两阶段注入 + 前缀缓存预热）

1. 右 Alt → `SetWindowsHookExW` → Main 拦截 key-down + 注入虚假 key-up + **sendWarmup()** 发前缀缓存预热请求
2. 渲染进程 Web Audio API 采集 PCM → 48→16kHz 抗混叠重采样 → WAV
3. 录音期间每 **2s** 通过 `voice:asr-chunk` IPC 发增量 PCM 做流式 ASR，累积 `preAsrText`
4. 松开快捷键 → 排空剩余 → `voice:transcribe` 收 `preAsrText` 跳过 ASR
5. **两阶段注入**：
   - **Phase 1**：ASR 原文立即注入（用户 0ms 感知延迟）→ 批量 SendInput 一次性注入，`\n` 转 Enter 键正确分行
   - **Phase 2**：cancelWarmup() → LLM SSE streaming 后台运行（前缀缓存命中）→ 退格删原文 → 批量注入润色版
   - **短文本短路**：≤5 字跳过 LLM，直接注入 raw 并结束
   - **翻译模式**：Phase 1 不注入原文（避免源语言闪现），翻译完成后直接注入译文
6. 幻听过滤 → 词典纠错（`text-corrector.ts` 快速规则 + `applyDictionary` 模糊匹配）→ 录音静音
7. 统计/历史持久化到 `userData/data/settings.json`

### 前缀缓存预热机制

按下快捷键时 `sendWarmup()` 读取 settings.json 中的 `language` 和 `polishMode` 设置，发一条匹配的 system prompt + "." 请求到 LLM，消耗首 token 后 abort。后续 Phase 2 正式请求的 system prompt 命中前缀缓存，TTFT 降低 200-400ms。warmup prompt 与正式请求同源（共用 `buildRefineCtx`，language/polishMode 均从 settings.json 读取），确保缓存命中。翻译模式不走润色，warmup 不触发。

### LLM 润色 Prompt 体系

- **PROMPT_STRUCTURED**（唯一，硬编码）：流畅度 + 纠错 + 意图转化 + 结构化，含 1 个精简示例
- 内部仍保留 PROMPT_RAW / PROMPT_LIGHT / PROMPT_FORMAL / PROMPT_CUSTOM 四套 prompt
- 润色风格固定为 `'structured'`，不再通过 UI 切换（`polishMode`/`customPrompt` 字段已从 Store 和 i18n 中移除）
- `<raw_transcript>` 包装器（`buildUserPrompt`）标注输入未处理，要求纠错
- 词典提示通过 `{dict_hint}` 占位符注入

### 流式本地 ASR

- 录音期间每 **2s** 通过 `voice:asr-chunk` IPC 发增量 PCM，主进程裸 ASR
- 流式回调含 in-flight 守卫（`streamBusyRef`）：上一段未返回时跳过本次，避免重叠导致乱序
- `streamClosedRef`：进入 `recognizing` 状态后丢弃所有迟到的流式 promise，防止污染已消费的 `streamTextRef`
- 松开快捷键 → 排空剩余 → 文本拼接为 `preAsrText`
- `voice:transcribe` 收 `preAsrText` 跳过 ASR，直接走过滤/润色/注入
- 云 ASR（火山/阿里/Whisper）不走流式，整段发送

## 核心文件

```
electron/
├── main.ts              # 生命周期、IPC、ASR/LLM、两阶段注入、词典、统计、前缀缓存预热
├── preload.ts           # window.tingmo API (IPC bridge)
├── hotkey.ts            # SetWindowsHookExW 键盘钩子 + waitForHotkeyRelease
├── hotkey-events.ts     # 按键去重、状态跟踪、Esc 检测
├── hotkey-events.test.ts# 单元测试
├── text-inserter.ts     # SendInput 批量注入（INPUT 数组 + 一次 SendInput 调用）+ \n→Enter + backspaceChars
├── tray.ts              # 系统托盘（ASR Provider 切换，从 settings.json 读）
├── tray-i18n.ts         # 托盘多语言
├── audio-ducking.ts     # 录音时静音（PowerShell COM 管道）
├── stats-history.ts     # 统计/历史持久化
└── logger.ts            # 日志轮转

scripts/
└── dev.mjs              # 开发启动脚本（Vite + esbuild + Electron）

src/
├── App.tsx              # I18nProvider + hash 路由
├── env.d.ts             # window.tingmo 类型声明
├── i18n/
│   ├── translations.ts  # 5 语言字典
│   └── context.tsx      # React i18n Context
├── components/
│   ├── FloatingWindow.tsx    # 浮窗：音频采集 + 流式 ASR 调度（2s 间隔 + 竞态守卫）
│   └── Settings/
│       ├── SettingsWindow.tsx  # 设置（侧边栏 4 Tab）
│       ├── NbSelect.tsx        # 下拉选择器
│       ├── ModelPanel.tsx      # 本地模型下载
├── services/
│   ├── speech-recognition.ts  # IRecognitionProvider 接口
│   ├── funasr-sherpa.ts       # 本地 SenseVoiceSmall（12s 切段 + 去重）
│   ├── funasr-cloud.ts        # OpenAI Whisper 云端
│   ├── asr-aliyun.ts          # 阿里云百炼 DashScope
│   ├── asr-volcano.ts         # 火山引擎 WebSocket（含 1 次重试）
│   ├── llm-refine.ts          # IRefinementProvider + 5 prompt + buildUserPrompt；接口支持 AbortSignal
│   ├── llm-openai.ts          # OpenAI 兼容 7 家 + SSE streamRefine（支持 AbortSignal）
│   ├── llm-gemini.ts          # Gemini + streamRefine（支持 AbortSignal）
│   ├── llm-providers.ts       # Provider 注册表 + MODEL_LABELS
│   ├── connection-test.ts     # ASR/LLM 连接测试
│   ├── model-downloader.ts    # SenseVoiceSmall 多源下载
│   ├── audio-chunker.ts       # WAV 分段工具（parseWAV/encodeWAV/splitWavChunks/dedupOverlap/joinChunkResults）
│   └── text-corrector.ts      # 快速文本纠错（同音词/字母合并/中文数字/金额/日期/技术大小写/词典）
├── hooks/
│   └── useAudioCapture.ts     # 音频采集：抗混叠降采样 + 归一化 + drainNewWav
├── store/settings.ts      # Zustand（hydrate + schedulePersist 300ms）
└── styles/global.css

test/
├── run-test.mjs           # ASR→LLM→对比 自动测试（SSE streaming + max_tokens:1024）
├── N.wav + N.md           # 测试用例
```

## ASR Provider

| Provider | 类型 | 关键点 |
|----------|------|--------|
| SherpaASRProvider | 本地 ONNX | SenseVoiceSmall，>14s 切 12s 段去重 |
| FunASRCloudProvider | OpenAI 格式 | `/audio/transcriptions` multipart |
| AliyunASRProvider | 阿里云百炼 | multimodal 端点，长音频 10s 并行切 |
| VolcanoASRProvider | 火山引擎 WS | 二进制协议，含 1 次重试 + server error reject |

## LLM Provider

| 厂商 | 端点 | 默认模型 |
|------|------|---------|
| OpenAI | `api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `api.deepseek.com/v1` | `deepseek-v4-flash` |
| Kimi | `api.moonshot.cn/v1` | `moonshot-v1-8k` |
| MiniMax | `api.minimax.chat/v1` | `abab6.5s-chat` |
| 智谱 AI | `open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 火山引擎 | `ark.cn-beijing.volces.com/api/v3` | `doubao-seed-1.6-flash` |
| Ollama | `localhost:11434/v1` | `llama3` |
| Gemini | `generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` |

- OpenAI 兼容厂商：`POST /chat/completions`（支持 `stream: true` SSE）
- Gemini：`POST /models/{model}:streamGenerateContent?key={key}&alt=sse`
- 默认超时 **30s**；max_tokens **1024**
- `streamRefine()` async generator 逐 chunk yield，支持 AbortSignal 取消

## 音频采集

`useAudioCapture.ts`:
- `autoGainControl: false`（不放大底噪）
- 48→16kHz **抗混叠降采样**（2 遍三角低通滤波消除电子底噪）
- 归一化仅在 `peak < 0.05` 触发
- `muteGain(0)` 保证 `onaudioprocess` 触发但扬声器静音

## 文本纠错

`text-corrector.ts`（0ms 延迟，LLM 前运行）：
- 同音词映射（中文专有名词，如 都可→Docker、多肽→多态）
- 字母合并（单个大写字母间空格，如 G P T→GPT、A I→AI）
- 中文数字 → 阿拉伯数字
- 金额识别（三百二十万 → 3,200,000）
- 日期格式统一（2024年3月15号 → 2024-03-15）
- 技术术语大小写（Api→API、Json→JSON）
- 用户词典走 `applyDictionary()` 单独处理（模糊匹配，不经过 `correctText`）

## 设置存储

**唯一文件**: `%APPDATA%/TingMo/data/settings.json`

- `schedulePersist`（300ms debounce）+ SettingsWindow immediate `saveAppSettings`
- API Key 即时写入 settings.json（`settings:set-api-key` / `settings:set-asr-cloud-api-key`）
- tray.ts 读 asrProvider 也从 settings.json
- 润色风格固定为 `'structured'`，不从 UI 切换

## 关键 IPC

```
voice:asr-chunk                                   # 流式本地 ASR 单段（2s 间隔 + 竞态守卫）
voice:transcribe (支持 preAsrText 跳过 ASR)        # 主转写入口（两阶段注入 + 预热）
asr:test-connection / llm:test-connection         # 连接测试
settings:reinit-recognition / init-refinement     # 重新初始化
settings:save-app-settings / load-app-settings    # 配置持久化
settings:set-hotkey / settings:set-translate-modifier # 快捷键变更
model:check / model:ensure                        # 本地模型检测/下载
```

## 已知限制

- **仅 Win x64**
- **Web Audio API 有固有底噪**：抗混叠滤波已消除高频折返，微量残留来自浏览器管线
- **流式 ASR 仅本地可用**：云 ASR 切段产生乱码；流式路径未复用 `audio-chunker.ts`，main.ts 内有重复 inline chunker
- **阿里云 multimodal 端点**非纯 ASR，长音频仅返回末尾
- **透明窗口禁 box-shadow**：产生灰色光晕
- **CSS animationend 不可靠**：统一用 Web Animations API
- **API Key 明文存储**
- **位置漂移**：禁止 `win.on('moved')` 和 `floatingPosition` 缓存
- **PROMPT_STRUCTURED 输出格式不稳定**：LLM 在平铺/双层格式间切换
- **润色风格不可切换**：`polishMode` 固定为 `'structured'`，UI 中无选择器
- **云端 LLM 延迟不可控**：DeepSeek V4 Flash TTFT 2-5s，用户感知延迟受 API 响应制约
- **VAD 回调未接入**：`useAudioCapture.ts` 中的 `setVadCallback` / `setVadTimeout` 无调用者，VAD 自动停止分支永不触发
- **`applyDictionary` 与 `correctText` 用户词典功能重复**：当前 `correctText` 不走词典，统一由 `applyDictionary` 处理
- **录音快捷键设置 IPC 仅支持 `MODIFIER_VK_MAP` 中的修饰键**（右 Alt 等标准 VK），不支持自定义非修饰键
- **`model:check` / `voice:asr-chunk` 此前因缺失 `fs` 声明 / 无 try/catch 而运行时报错**（已修复）
- **`VK_NAME_MAP` 未定义**导致 `settings:set-hotkey` / `settings:set-translate-modifier` IPC handler 崩溃（已修复）
- **`hotkey-events.test.ts` 导入已重命名的函数**导致单元测试无法运行（已修复）
- **`injectAltKeyUp` 始终注入右 Alt 释放**无视已配置的热键（已修复，改为 `injectKeyUp` 使用 `currentVk`）
- **`SendInput` 返回值被忽略**导致注入静默失败（已修复，添加日志告警）
- **`audio-ducking.ts` 命令无超时+竞态**：Promise 可永久挂起（已修复，添加 5s 超时 + 安全访问）
- **`clearHistory()` 同时清除统计**误导（已修复，拆分为 `clearHistory()` / `clearAllStats()`）
- **`loadRecordMode()` / `loadMuteOnRecord()` 重复解析 settings.json**（已修复，合并为 `loadAppSettings()`）
- **`settings:save-app-settings` 静默吞错误**（已修复，`throw err` 传播给渲染进程）
- **`VK_NAME_MAP` 未定义**导致 `settings:set-hotkey` / `settings:set-translate-modifier` IPC handler 崩溃（已修复）
- **`hotkey-events.test.ts` 导入已重命名的函数**导致单元测试无法运行（已修复）
- **`injectAltKeyUp` 始终注入右 Alt 释放**无视已配置的热键（已修复，改为 `injectKeyUp` 使用 `currentVk`）
- **`SendInput` 返回值被忽略**导致注入静默失败（已修复，添加日志告警）
- **`audio-ducking.ts` 命令无超时+竞态**：Promise 可永久挂起（已修复，添加 5s 超时 + 安全访问）
- **`clearHistory()` 同时清除统计**误导（已修复，拆分为 `clearHistory()` / `clearAllStats()`）
- **`loadRecordMode()` / `loadMuteOnRecord()` 重复解析 settings.json**（已修复，合并为 `loadAppSettings()`）
- **`settings:save-app-settings` 静默吞错误**（已修复，`throw err` 传播给渲染进程）
- **`model:check` 不搜索 tokens.txt 子目录**导致模型存在但提示未下载（已修复）
- **托盘图标打包后空白**：`electron-builder.yml` 添加 `assets/` 目录（已修复）
- **`tintIcon` BGRA/RGBA 通道错误**导致图标颜色异常（已修复）
- **HotkeyRecorder 闭包陷阱**：`handleKeyUp` 读到空 `display` 值，快捷键设置不生效（已修复，改用 `useRef`）
- **全局键盘钩子拦截设置页按键**：录制快捷键时钩子先消费事件，Alt 等不到渲染进程（已修复，添加暂停/恢复机制）
- **切换 ASR 卡顿**：`SherpaASRProvider` 同步 C++ 模型加载阻塞主进程；切换时不必要的 `initRefinement` 调用（已修复：缓存识别器、分离 ASR/LLM 依赖、200ms 防抖）
- **`FunASRCloudProvider.initialize()` 无意义网络请求**：超时 3s 探测不存在的 `/api/status` 端点（已修复，直接返回）

## TODO

- [ ] AudioWorklet 替代 ScriptProcessor（降底噪、提性能）
- [ ] 阿里云 ASR 端点迁移到专用 ASR
- [ ] sherpa-onnx DirectML GPU 推理加速本地 ASR
- [ ] 云端 ASR 流式（火山 WS 单连接已可行）
- [ ] 本地小模型润色
- [ ] 流式 ASR 接入 `audio-chunker.ts` 模块
- [ ] VAD 回调接入翻译/录音自动停止流程
- [ ] 提取共享 tsconfig.base.json 减少配置重复
- [ ] 配置 ESLint + Prettier + Git hooks + CI
