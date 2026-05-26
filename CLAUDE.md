# 听墨 (TingMo) — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式。

**当前版本**: SenseVoiceSmall 本地 ASR（sherpa-onnx）+ 3 家云端 ASR + 8 家 LLM 润色/翻译，支持流式 LLM 润色与两阶段注入。

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | sherpa-onnx | Zustand | ws (WebSocket) | 5 语言 i18n

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

放 `test/N.wav` + `test/N.md`（期望文本）即可加用例。测试跑完整 ASR→LLM→对比链路。

## 架构

| 进程 | 职责 |
|------|------|
| Main (`electron/main.ts`) | App 生命周期、键盘钩子、文字注入、托盘、多 Provider ASR/LLM、词典纠错、统计、自动更新、流式注入 |
| Renderer (`src/`) | React UI：浮窗胶囊、设置窗口、音频采集 |
| Preload (`electron/preload.ts`) | contextBridge 暴露 `window.tingmo` API |

### 状态机

```
IDLE →(右Alt)→ RECORDING →(右Alt)→ RECOGNIZING →(refining)→ SUCCESS →(800ms dismiss)→ IDLE
```

### 数据流（含两阶段注入）

1. 右 Alt → `SetWindowsHookExW` → Main 拦截 key-down + 注入虚假 key-up
2. 渲染进程 Web Audio API 采集 PCM → 48→16kHz 抗混叠重采样 → WAV → IPC `voice:transcribe`
3. Main 进程 ASR（云/本地路由分离，云不回落本地）
4. **两阶段注入**（流式 LLM 模式）：
   - ASR 原文**立即注入**（用户瞬间看到文字）
   - LLM 流式润色后台运行（SSE streaming）
   - 润色完成后**退格删原文 + 注入润色版**
5. 幻听过滤 → 词典纠错 → 录音静音
6. 统计/历史持久化到 `userData/data/settings.json`

### LLM 润色 Prompt 体系

- **PROMPT_STRUCTURED**（默认）：流畅度 + 纠错 + 意图转化 + 结构化 + 双阶段格式（首行规定禁止回答/执行/添加，含 3 个示例）
- **PROMPT_RAW**：仅补标点
- **PROMPT_LIGHT**：删填充词 + 补标点
- **PROMPT_FORMAL**：转正式书面语
- **PROMPT_CUSTOM**：用户自定义
- `<raw_transcript>` 包装器（`buildUserPrompt`）标注输入未处理，要求纠错
- 词典提示通过 `{dict_hint}` 占位符注入

### 流式本地 ASR

- 录音期间每 5s 通过 `voice:asr-chunk` IPC 发增量 PCM，主进程裸 ASR
- 松开快捷键 → 排空剩余 → 文本拼接为 `preAsrText`
- `voice:transcribe` 收 `preAsrText` 跳过 ASR，直接走过滤/润色/注入
- 云 ASR（火山/阿里/Whisper）不走流式，整段发送

## 核心文件

```
electron/
├── main.ts              # App 生命周期、IPC、多 Provider ASR/LLM、两阶段注入、词典、统计
├── preload.ts           # window.tingmo API (IPC bridge)
├── hotkey.ts            # SetWindowsHookExW 键盘钩子
├── hotkey-events.ts     # 按键去重、状态跟踪、Esc 检测
├── text-inserter.ts     # SendInput Unicode 注入 + backspaceChars 退格
├── tray.ts              # 系统托盘（ASR Provider 切换，从 settings.json 读）
├── audio-ducking.ts     # 录音时静音（PowerShell COM 管道）
└── stats-history.ts     # 统计/历史持久化

src/
├── App.tsx              # I18nProvider + hash 路由
├── env.d.ts             # window.tingmo 类型
├── i18n/
│   ├── translations.ts  # 5 语言字典
│   └── context.tsx      # React i18n Context
├── components/
│   ├── FloatingWindow.tsx    # 浮窗：音频采集 + 流式 ASR 调度
│   └── Settings/
│       ├── SettingsWindow.tsx  # 设置（侧边栏 4 Tab）
│       ├── NbSelect.tsx        # NB 下拉
│       ├── ModelPanel.tsx      # 本地模型下载
├── services/
│   ├── speech-recognition.ts  # IRecognitionProvider 接口
│   ├── funasr-sherpa.ts       # 本地 SenseVoiceSmall（12s 切段 + 去重）
│   ├── funasr-cloud.ts        # OpenAI Whisper 云端
│   ├── asr-aliyun.ts          # 阿里云百炼 DashScope
│   ├── asr-volcano.ts         # 火山引擎 WebSocket（含 1 次重试）
│   ├── llm-refine.ts          # IRefinementProvider + 4 prompt + buildUserPrompt
│   ├── llm-openai.ts          # OpenAI 兼容 7 家 + SSE streamRefine
│   ├── llm-gemini.ts          # Gemini + streamRefine
│   ├── llm-providers.ts       # Provider 注册表 + MODEL_LABELS
│   ├── connection-test.ts     # 连接测试
│   └── model-downloader.ts    # SenseVoiceSmall 多源下载
├── hooks/
│   └── useAudioCapture.ts     # 音频采集：抗混叠降采样 + 归一化 + drainNewWav
├── store/settings.ts      # Zustand（hydrate + schedulePersist 300ms）
└── styles/global.css

test/
├── run-test.mjs           # ASR→LLM→对比 自动测试
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
- 默认超时 **30s**
- `streamRefine()` async generator 逐 chunk yield

## 音频采集

`useAudioCapture.ts`:
- `autoGainControl: false`（不放大底噪）
- 48→16kHz **抗混叠降采样**（2 遍三角低通滤波消除电子底噪）
- 归一化仅在 `peak < 0.05` 触发
- `muteGain(0)` 保证 `onaudioprocess` 触发但扬声器静音

## 设置存储

**唯一文件**: `%APPDATA%/TingMo/data/settings.json`

- `schedulePersist`（300ms debounce）+ SettingsWindow immediate `saveAppSettings`
- API Key 即时写入 settings.json（`settings:set-api-key` / `settings:set-asr-cloud-api-key`）
- tray.ts 读 asrProvider 也从 settings.json

## 关键 IPC

```
voice:asr-chunk                                   # 流式本地 ASR 单段
voice:transcribe (支持 preAsrText 跳过 ASR)        # 主转写入口（含两阶段注入）
asr:test-connection / llm:test-connection         # 连接测试
settings:reinit-recognition / init-refinement     # 重新初始化
settings:save-app-settings / load-app-settings    # 配置持久化
```

## 已知限制

- **仅 Win x64**
- **Web Audio API 有固有底噪**：抗混叠滤波已消除高频折返，微量残留来自浏览器管线
- **流式 ASR 仅本地可用**：云 ASR 切段产生乱码
- **阿里云 multimodal 端点**非纯 ASR，长音频仅返回末尾
- **透明窗口禁 box-shadow**：产生灰色光晕
- **CSS animationend 不可靠**：统一用 Web Animations API
- **API Key 明文存储**
- **位置漂移**：禁止 `win.on('moved')` 和 `floatingPosition` 缓存
- **PROMPT_STRUCTURED 输出格式波动**：LLM 在平铺/双层格式间切换

## TODO

- [ ] AudioWorklet 替代 ScriptProcessor（降底噪、提性能）
- [ ] 阿里云 ASR 端点迁移到专用 ASR
- [ ] sherpa-onnx DirectML GPU 推理加速本地 ASR
- [ ] 云端 ASR 流式（火山 WS 单连接已可行）
- [ ] Kimi/智谱/MiniMax 模型列表更新
