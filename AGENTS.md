# TingMo — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式。

**当前版本**: SenseVoiceSmall 本地 ASR（sherpa-onnx）+ 3 家云端 ASR + 8 家 LLM 润色/翻译，两阶段注入 + 前缀缓存预热。

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | sherpa-onnx | Zustand | 5 语言 i18n

## 运行

```bash
npm run dev            # Vite dev server → esbuild → Electron
npm run build:main     # 仅构建主进程和 preload
npm run build          # 完整构建
npm run electron:build # 完整构建 + electron-builder 打包
```

## 测试

```bash
node --experimental-strip-types test/run-test.mjs
```

放 `test/N.wav` + `test/N.md`（期望文本）即可加用例。测试跑完整 ASR→LLM→对比链路。使用 SSE streaming + max_tokens: 1024 + 精简 PROMPT_STRUCTURED。

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
├── text-inserter.ts     # SendInput 批量注入（INPUT 数组 + 一次 SendInput 调用）+ \n→Enter + backspaceChars
├── tray.ts              # 系统托盘（ASR Provider 切换，从 settings.json 读）
├── audio-ducking.ts     # 录音时静音（PowerShell COM 管道）
└── stats-history.ts     # 统计/历史持久化

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

## TODO

- [ ] AudioWorklet 替代 ScriptProcessor（降底噪、提性能）
- [ ] 阿里云 ASR 端点迁移到专用 ASR
- [ ] sherpa-onnx DirectML GPU 推理加速本地 ASR
- [ ] 云端 ASR 流式（火山 WS 单连接已可行）
- [ ] Kimi/智谱/MiniMax 模型列表更新
- [ ] 本地小模型润色（0.6B 速度好但中文质量不足，需 3B+ 或专用中文纠错模型如 CeluneNorm 中文版）
- [ ] 流式 ASR 接入 `audio-chunker.ts` 模块（消除 main.ts 中重复的 inline chunker）
- [ ] VAD 回调接入翻译/录音自动停止流程
- [ ] Volcano 三套不同端点统一（asr-volcano.ts / connection-test.ts / llm-providers.ts）
