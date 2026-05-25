# 听墨 (TingMo) v0.3.0 — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式。

**v0.3.0**: SenseVoiceSmall 本地 ASR（sherpa-onnx）+ 3 家云端 ASR（阿里云百炼/火山引擎/OpenAI Whisper）+ 8 家 LLM 润色/翻译。

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | sherpa-onnx WASM | Zustand | ws (WebSocket) | 5 语言 i18n

## 运行

```bash
npm run dev            # Vite dev server (端口 5173) → esbuild → Electron
npm run build:main     # 仅构建主进程和 preload
npm run build          # 完整构建
npm run electron:build # 完整构建 + electron-builder 打包
```

## 架构

| 进程 | 职责 |
|------|------|
| Main (`electron/main.ts`) | App 生命周期、键盘钩子、文字注入、托盘、多 Provider ASR/LLM、词典纠错、统计、自动更新 |
| Renderer (`src/`) | React UI：浮窗胶囊、设置窗口、音频采集 |
| Preload (`electron/preload.ts`) | contextBridge 暴露 `window.tingmo` API |

### 状态机

```
IDLE →(右Alt)→ RECORDING →(右Alt)→ RECOGNIZING →(refining)→ SUCCESS →(800ms dismiss)→ IDLE
```

### 数据流

1. 右 Alt → `SetWindowsHookExW` → Main 拦截 key-down + 注入虚假 key-up
2. 渲染进程 Web Audio API 采集 PCM → 16kHz WAV → IPC `voice:transcribe`
3. Main 进程：**优先云 Provider**（`recognitionReady` 时），否则回退本地 sherpa-onnx
   - 幻听过滤 → 词典纠错 → LLM 润色/翻译 → 录音静音
4. `SendInput + KEYEVENTF_UNICODE` 逐字符注入
5. 统计/历史持久化到 `userData/data/settings.json`
6. 800ms dismiss 动画

### worker 上下文保护

sherpa-onnx Web Worker 会加载主进程打包文件。所有 `app.*` 调用必须用 `if (app)` 守卫。

## 核心文件

```
electron/
├── main.ts              # App 生命周期、IPC、多 Provider ASR/LLM、词典纠错、统计、自动更新
├── preload.ts           # window.tingmo API (IPC bridge)
├── hotkey.ts            # SetWindowsHookExW 键盘钩子
├── hotkey-events.ts     # 按键去重、状态跟踪、Esc 检测
├── text-inserter.ts     # SendInput Unicode 注入
├── tray.ts              # 系统托盘（ASR Provider 切换回调）
├── audio-ducking.ts     # 录音时静音（IAudioEndpointVolume COM）
└── stats-history.ts     # 统计/历史持久化

src/
├── App.tsx              # I18nProvider + hash 路由
├── env.d.ts             # window.tingmo 类型
├── i18n/
│   ├── translations.ts  # 5 语言字典
│   └── context.tsx      # React i18n Context
├── components/
│   ├── FloatingWindow.tsx    # 黑色胶囊 118×38px
│   └── Settings/
│       ├── SettingsWindow.tsx  # NB 风格设置（侧边栏 4 Tab，Model 页有 Provider/Model/Key/Test 控件）
│       ├── NbSelect.tsx        # NB 下拉（支持 icon 属性）
│       ├── ModelPanel.tsx      # 本地模型下载
│       └── ...
├── services/
│   ├── speech-recognition.ts  # IRecognitionProvider 接口
│   ├── funasr-sherpa.ts       # SherpaASRProvider — 本地
│   ├── funasr-cloud.ts        # FunASRCloudProvider — OpenAI Whisper
│   ├── asr-aliyun.ts          # AliyunASRProvider — 阿里云百炼 DashScope (multimodal)
│   ├── asr-volcano.ts         # VolcanoASRProvider — 火山引擎 WebSocket (bigmodel_nostream)
│   ├── llm-refine.ts          # IRefinementProvider + 5 种润色/1 种翻译 System Prompt
│   ├── llm-openai.ts          # OpenAIProvider — 7 家 OpenAI 兼容 LLM 共用
│   ├── llm-gemini.ts          # GeminiProvider — Google AI Studio (非 OpenAI 格式)
│   ├── llm-providers.ts       # Provider 注册表 (8 LLM + 3 ASR 云厂商预设，模型列表)
│   ├── connection-test.ts     # 连接测试工具 (testAsrConnection / testLlmConnection)
│   └── model-downloader.ts    # SenseVoiceSmall 多源下载
├── store/settings.ts      # Zustand (hydrate + schedulePersist 500ms debounce)
└── styles/global.css      # 全局样式

public/providers/          # 厂商 logo SVG (LobeHub 下载)
```

## ASR Provider 体系

| Provider | 类型 | 端点 | 协议 | 模型参数 |
|----------|------|------|------|---------|
| SherpaASRProvider | 本地 | — | sherpa-onnx ONNX | — |
| FunASRCloudProvider | OpenAI | `/audio/transcriptions` | HTTP multipart | `whisper-1` |
| AliyunASRProvider | 阿里云百炼 | `dashscope.aliyuncs.com` | HTTP JSON + Bearer | `fun-asr-realtime` / `qwen3-asr-flash-realtime` |
| VolcanoASRProvider | 火山引擎 | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream` | WebSocket 二进制协议 | `bigmodel` |

### 火山引擎 WebSocket 协议要点

- **Resource ID**: `volc.seedasr.sauc.duration`（豆包流式2.0 小时版）
- **Header**: 4 字节按位打包 — `[version(4)|header_size(4)] [msg_type(4)|flags(4)] [serialization(4)|compression(4)] [reserved]`
- **FullClientRequest**: msg_type=0x1, serialization=JSON, compression=none → 4B header + 4B size + JSON payload
- **AudioOnly**: msg_type=0x2, serialization=none → 4B header + 4B size + PCM payload（去掉 WAV 头的裸 PCM 16kHz 16bit mono）
- **最后一包**: flags=0x2（负包标记），空 payload
- **ServerResponse**: msg_type=0x9 → 4B header + 4B sequence + 4B size + JSON payload
- 音频分块 ~6400 字节/包（~200ms @16kHz）
- 依赖 `ws` npm 包 + `@types/ws`

### 阿里云百炼 DashScope 协议

- 端点: `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation`
- Header: `Authorization: Bearer {key}`, `X-DashScope-SSE: disable`
- Body: `{model, input: {messages: [{role, content: [{audio: "data:audio/wav;base64,..."}]}]}, parameters: {format: "wav", sample_rate}}`
- 返回值: `output.choices[0].message.content[0].text`

### ASR Provider 名称

`AliyunASRProvider` 和 `VolcanoASRProvider` 的 `name` 是动态 getter，格式 `厂商(模型名)`，如 `Aliyun (qwen3-asr-flash-realtime)`。

## LLM Provider 体系

| 厂商 | 类 | 端点 | 默认模型 |
|------|-----|------|---------|
| OpenAI | OpenAIProvider | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | OpenAIProvider | `https://api.deepseek.com/v1` | `deepseek-v4-flash` |
| Kimi | OpenAIProvider | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| MiniMax | OpenAIProvider | `https://api.minimax.chat/v1` | `abab6.5s-chat` |
| 智谱 AI | OpenAIProvider | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| 火山引擎 | OpenAIProvider | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-1.6-flash` |
| Ollama | OpenAIProvider | `http://localhost:11434/v1` | `llama3`（无 API Key）|
| Gemini | GeminiProvider | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` |

7 家 OpenAI 兼容厂商共用 `OpenAIProvider`（`/chat/completions` + Bearer）。Gemini 独立 `GeminiProvider`（`/models/{model}:generateContent?key=`）。

## 设置持久化

**所有配置统一存一个文件**: `%APPDATA%/TingMo/data/settings.json`

- 保存: `schedulePersist`（500ms debounce）+ SettingsWindow immediate `saveAppSettings`
- 恢复: `hydrate()` 调 `loadAppSettings()` IPC → 读 `settings.json` → Zustand set
- API Key: `llmApiKey` / `asrCloudApiKey` 在 `settings.json` 里当普通字段（明文），不再用 safeStorage 加密
- 没有 llm-settings.json 了——所有 LLM/ASR/Key 配置都在 settings.json

### 设置重复保存问题

`setAsrCloudProvider` 会触发 `schedulePersist`（500ms debounce）。用户切模型时 `setAsrCloudModel` 也要调 `schedulePersist`，否则旧 debounce 500ms 后用默认模型覆盖用户选择。`setLlmModel` / `setLlmApiKey` / `setAsrCloudApiKey` 同理。

### SettingsWindow save effect

- 用 `useRef` 跳过首次渲染（避免 mount 时用默认值覆盖已保存配置）
- 后续变化时 `await saveAppSettings → await initRefinement → await reinitRecognition` **顺序执行**（不能并发）

## ASR Provider 初始化

`initRecognition()` 读取 `settings.json` 中 `asrProvider`（`'local'`/'`cloud'`）、`asrCloudProvider`、`asrCloudModel`、`asrCloudApiKey`。**所有 Provider 都是从 `settings.json` 读取**。

- 启动时: `app.whenReady()` → `initRecognition()` 
- 设置变更时: SettingsWindow → `saveAppSettings` → `reinitRecognition` → `initRecognition()`
- 托盘切换时: tray callback → `initRecognition()`

## Transcribe 流程

```typescript
// voice:transcribe handler — 优先云 Provider，回退本地
if (recognitionReady && recognitionProvider) {
    const result = await recognitionProvider.transcribe(buf, 16000, lang);
    text = result.text;
} else {
    // 本地 sherpa-onnx（每次独立创建 recognizer）
}
```

## 连接测试

`src/services/connection-test.ts`：
- **ASR**: 每厂商独立测试路径，匹配各自 API 格式
  - OpenAI: multipart WAV → `/audio/transcriptions`
  - Volcano: JSON → `/submit`（resource_id: `volc.seedasr.sauc.duration`），400=通/401=密钥错
  - Aliyun: text-only JSON → multimodal-generation（400/200=通）
- **LLM**: `max_tokens=1` 最小请求 → `/chat/completions`（Gemini 走 `generateContent`）

## 关键 IPC

```
asr:test-connection / llm:test-connection     # 连接测试（在 whenReady 之前注册）
settings:reinit-recognition                   # 重新初始化 ASR Provider
settings:set-asr-cloud-api-key / get-asr-cloud-api-key  # ASR Key 存取
settings:save-llm-settings / load-app-settings          # 配置持久化
```

## 已知限制

- **仅 Win x64**
- **透明窗口 + box-shadow = 灰色光晕**：胶囊永不使用外阴影
- **CSS @keyframes animationend 不可靠**：统一用 Web Animations API
- **API Key 明文存储**：在 `settings.json` 中当普通字段
- **火山引擎 WebSocket**: 需 `ws` npm 依赖，协议 bit-packed header 格式严格
- **阿里云百炼**: audio 必须带 `data:audio/wav;base64,` 前缀
- **位置漂移**: 禁止恢复 `win.on('moved')` 和 `floatingPosition` 缓存
- **键盘卡键**: 右 Alt key-up 不放行，用虚假 key-up 注入
- **sherpa-onnx worker 上下文**: 模块顶层 `require("fs")` 出问题，函数内部用 `const fs = require('fs')`
- **COM vtable 偏移要精确**：静音接口偏移不能差
- **`currentVk` 必须声明**: `let currentVk: number = VK_RMENU`

## TODO

- [ ] Kimi/智谱/MiniMax 模型列表更新为最新版本
- [ ] LLM 测试按钮在实际调用时验证（目前只发 text-only 请求）
- [ ] 火山引擎 HTTP 录音文件 API 不支持 base64 audio，暂用 WebSocket；如有 base64 支持可简化
- [ ] Provider 切换后 UI 反馈（当前只靠 console 日志确认）
