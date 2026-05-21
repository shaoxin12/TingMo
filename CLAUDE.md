# 听墨 (TingMo) v0.2 — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式。

**v0.2**: Paraformer-large INT8 本地 ASR + CT-Transformer 标点 + LLM 润色（OpenAI 兼容 API）

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | onnxruntime-node | Zustand | 5 语言 i18n

## 运行

```bash
npm run dev            # Vite dev server (端口 5173)
npm run electron:dev   # 构建主进程 + 启动 Electron
npm run build          # 完整构建: tsc + vite build + esbuild main/preload
npm run build:main     # 仅构建主进程和 preload
```

开发需两个终端：`npm run dev` + `npm run electron:dev`。

## 架构

| 进程 | 职责 |
|------|------|
| Main (`electron/main.ts`) | App 生命周期、键盘钩子、文字注入、托盘、ASR+标点 ONNX 推理、LLM 润色、词典纠错、统计/历史 |
| Renderer (`src/`) | React UI：浮窗胶囊、设置窗口、音频采集 |
| Preload (`electron/preload.ts`) | contextBridge 暴露 `window.tingmo` API |

### 状态机

```
IDLE →(右Alt)→ RECORDING →(右Alt)→ RECOGNIZING →(refining)→ SUCCESS/ERROR →(1.5s)→ IDLE
```

`refining` 仅在 LLM 润色/翻译时出现，离线时跳过。

### 数据流

1. 右 Alt → `SetWindowsHookExW` → Main 发 `voice:state-change` → 浮窗显示
2. 渲染进程 Web Audio API 采集 PCM → 线性插值重采样到 16kHz → 编码 WAV → IPC `voice:transcribe`
3. Main 进程：
   - **Fbank 特征提取**（Hamming窗→FFT→Mel→LFR→CMVN）→ Paraformer-large ONNX → 原始文字
   - **CT-Transformer 标点**（可选，模型在 `%APPDATA%/tingmo/models/funasr/ct-transformer.onnx`）→ `，。？、`
   - **词典模糊纠错**（Levenshtein 编辑距离 ≤1~2）→ 修正同音误判
   - **LLM 润色**（可选，需 API Key）：去口语 + 结构化 + 保留专属词汇
   - **LLM 翻译**（可选）：复用润色 provider，切换 System Prompt
4. `SendInput + KEYEVENTF_UNICODE` 逐字符注入
5. 统计/历史持久化到 `userData/data/`
6. 成功 1.5s 后隐藏；失败显示重试/复制

## 核心文件

```
electron/
├── main.ts              # App 生命周期、IPC、ASR 推理管线、LLM 润色、词典纠错、统计/历史
├── preload.ts           # window.tingmo API (IPC bridge)
├── hotkey.ts            # SetWindowsHookExW 低层键盘钩子 (koffi)
├── hotkey-events.ts     # 按键去重、右 Alt 状态跟踪
├── text-inserter.ts     # SendInput Unicode 逐字符注入 (koffi)
├── tray.ts              # 系统托盘（状态叠加色点）
├── tray-i18n.ts         # 托盘菜单翻译
├── audio-ducking.ts     # 录音时静音系统音频
└── stats-history.ts     # 统计/历史持久化

src/
├── App.tsx              # I18nProvider + hash 路由: / → 浮窗, /#/settings → 设置
├── env.d.ts             # window.tingmo 类型声明
├── main.tsx             # React entry
├── i18n/
│   ├── translations.ts  # 5 语言翻译字典 (zh-CN/zh-TW/en/ja/ko)
│   └── context.tsx      # React i18n Context + Provider + useI18n() hook
├── components/
│   ├── FloatingWindow.tsx  # 胶囊 140×48px (呼吸灯+波形/状态/错误面板)
│   ├── BreathingLight.tsx  # 呼吸灯动画
│   ├── Waveform.tsx        # Canvas 波形
│   ├── ErrorPanel.tsx      # 重试/复制按钮
│   ├── StatusOverlay.tsx   # 状态文字
│   └── Settings/
│       ├── SettingsWindow.tsx  # NB 风格设置窗口 (侧边栏+卡片+5语言切换)
│       ├── HotkeyRecorder.tsx  # 快捷键录制 (i18n 修饰键名)
│       ├── NbSelect.tsx       # 自定义 NB 下拉菜单
│       ├── HistoryPanel.tsx   # 历史记录 + 统计
│       └── DictionaryPanel.tsx # 单输入词典 (标签展示)
├── hooks/
│   ├── useVoiceInput.ts   # 状态机 hook
│   └── useAudioCapture.ts # Web Audio 采集 + 16kHz 重采样 + WAV + RMS 停顿检测
├── services/
│   ├── speech-recognition.ts  # IRecognitionProvider 接口
│   ├── funasr-ort.ts         # Paraformer + CT-Transformer ONNX (Fbank/LFR/CMVN/CTC)
│   ├── funasr-cloud.ts       # 云端 ASR 骨架 (待实现)
│   ├── llm-refine.ts         # IRefinementProvider 接口 + System Prompt (词典感知)
│   ├── llm-openai.ts         # OpenAI 兼容 API 实现
│   ├── model-downloader.ts   # 首次启动下载模型 (GitHub Releases)
│   └── mock-recognition.ts   # 开发用 mock 识别
├── store/settings.ts      # Zustand store
└── styles/global.css      # 全局样式 (胶囊/NB设置/波形/历史/词典/开关/输入框)
```

## 模型文件

存放于 `%APPDATA%/tingmo/models/funasr/`：

| 文件 | 大小 | 用途 | 必需 |
|------|------|------|------|
| `paraformer-large-int8.onnx` | 228MB | ASR 引擎 | ✅ |
| `tokens.json` | 60KB | ASR 词表 (8404 tokens) | ✅ |
| `am.mvn` | 11KB | CMVN 归一化参数 | ✅ |
| `config.json` | 1KB | 模型配置 | ✅ |
| `ct-transformer.onnx` | 73MB | CT-Transformer 标点 (INT8) | ✅ |
| `punct-tokens.json` | 4MB | 标点词表 (272727 tokens) | ✅ |

## 设置窗口

NB 风格：纯白底 `#FFF`、黑边框、橙色 `#FF5A1F` 点缀。左侧 175px 导航栏（5 个单标签按钮，激活黑底白字）。右侧卡片式内容区。

| 标签 | 内容 |
|------|------|
| **历史** | 累计时长、累计字数、最近记录、清空按钮 |
| **词典** | 单输入添加词汇、标签展示、× 删除、模糊纠错 |
| **模型** | Paraformer-large INT8 / CT-Transformer / FSMN-VAD / ONNX Runtime |
| **设置** | 语音模式(本地/API)、识别语言、快捷键录制、翻译目标语言、开机自启/录音静音/启用词典/界面语言 |
| **关于** | 简介 + 技术栈标签 |

### 界面语言

侧边栏单标签 + 5 语言下拉切换（简体中文 / 繁體中文 / English / 日本語 / 한국어）。首启根据 `app.getLocale()` 自动检测。

## 词典

两层生效：
- **始终**：ASR 输出后模糊纠错（Levenshtein 编辑距离，短词容错 ≤1，长词 ≤2）
- **LLM 启用时**：System Prompt 中声明专属词汇保持不修改

词典面板：输入一个词 → 添加 → 以 NB 标签展示 → × 删除。

## IPC API (`window.tingmo`)

| 方法 | 方向 | 用途 |
|------|------|------|
| `onVoiceStateChange(cb)` | Main→Renderer | 状态变化 |
| `onRecognitionDone(cb)` | Main→Renderer | 识别完成 |
| `onInjectFailed(cb)` | Main→Renderer | 注入失败 |
| `onModelProgress(cb)` | Main→Renderer | 模型下载进度 |
| `onTranslateMode(cb)` | Main→Renderer | 翻译模式激活 |
| `openSettings()` | Renderer→Main | 打开设置窗口 |
| `transcribe(buf, lang?, opts?)` | Renderer→Main | 发送音频，opts: {translate, translateTarget, dictionary} |
| `retryInject(text)` | Renderer→Main | 重试注入 |
| `copyText(text)` | Renderer→Main | 复制到剪贴板 |
| `reportCaptureError(msg)` | Renderer→Main | 报告采集错误 |
| `getStats()` | Renderer→Main | 获取统计数据 |
| `getHistory()` | Renderer→Main | 获取历史记录 |
| `clearHistory()` | Renderer→Main | 清空历史 |
| `setTranslateModifier(key)` | Renderer→Main | 设置翻译修饰键 VK |
| `getSystemLocale()` | Renderer→Main | 获取系统语言 |
| `setUiLanguage(lang)` | Renderer→Main | 设置界面语言（更新托盘） |
| `getApiKey()` | Renderer→Main | 读取加密 API Key |
| `setApiKey(key)` | Renderer→Main | 加密存储 API Key |
| `saveLlmSettings(settings)` | Renderer→Main | 持久化 LLM 配置 |
| `initRefinement()` | Renderer→Main | 初始化润色引擎 |
| `getRefinementStatus()` | Renderer→Main | 查询润色状态 |

## 已知限制

- **仅 Win x64**: 不支持其他平台
- **云端 ASR**: 骨架已建 (`funasr-cloud.ts`)，待实现
- **FSMN-VAD**: 模型未包含，离线 VAD 不可用
- **开机自启**: 开关已加，实际自启逻辑待实现
- **API Key 加密**: 使用 Electron safeStorage (DPAPI)，仅本机可解密
- **模型下载**: Windows tar 解压可能失败，需 `tar` 命令在 PATH
