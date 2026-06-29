# TingMo — Windows 桌面 AI 语音输入法

按右 Alt 开始录音，说话，再按右 Alt 停止，语音自动转文字注入光标。右 Alt + 右 Shift 触发翻译模式（翻译快捷键可自定义）。

**当前版本**: SenseVoiceSmall 本地 ASR（sherpa-onnx）+ 3 家云端 ASR + 8 家 LLM 润色/翻译，流式注入。

## 核心开发法则

### 🔴 首要原则：不破坏已有功能
> 修改代码时，必须确保已有功能不受影响。这是最高优先级。

1. **理解再动手**：任何代码在修改前，必须先理解它的作用
2. **保留安全守卫**：如 `if (app)`、`?.` 可选链等防御性写法，即使看起来多余也要保留
3. **逐项验证**：改完代码后，逐一验证之前能用的功能是否仍然正常
4. **最小改动**：能改一行不改十行，能加逻辑不改结构
5. **回滚准备**：如果发现改错了，立即回退

## 技术栈

Electron 33 + React 18 + TypeScript + Vite | esbuild 编译主进程 | koffi FFI 调 Win32 API | sherpa-onnx | Zustand | 5 语言 i18n

## 运行

```bash
npm run dev            # Vite + esbuild + Electron（支持主进程热更新）
npm run build:main     # 仅构建主进程和 preload
npm run build          # 完整构建
npm run electron:build # 完整构建 + electron-builder 打包
npm run release:patch  # 发布补丁版本
npm run release:minor  # 发布次版本
```

## 架构

| 进程 | 职责 |
|------|------|
| Main (`electron/main.ts`) | App 生命周期、键盘钩子（含翻译独立热键）、文字注入、托盘、多 Provider ASR/LLM、词典纠错、统计、自动更新 |
| Renderer (`src/`) | React UI：浮窗胶囊、设置窗口、音频采集 |
| Preload (`electron/preload.ts`) | contextBridge 暴露 `window.tingmo` API |

### 状态机

```
IDLE →(热键)→ RECORDING →(热键)→ RECOGNIZING →(refining)→ SUCCESS →(800ms dismiss)→ IDLE
```

- Hold 模式：按住热键录音，松键停止
- Toggle 模式：按一下开始，再按一下停止（默认）
- 翻译模式：独立组合键或修饰键 + 录音热键触发
- 卡住恢复：15 秒 watchdog + 下次按键强制重置

### 数据流

1. 热键 → `SetWindowsHookExW` → Main 拦截 key-down + 注入虚假 key-up
2. 渲染进程 Web Audio API 采集 PCM → 48→16kHz 抗混叠重采样 → WAV
3. **本地 ASR 流式**：录音期间每 2s 发增量 PCM（chunk 间 0.5s 重叠），静音段跳过（`hasAudioSignal()` 能量检测）。累积 `preAsrText`，松键后直接复用
4. **云端 ASR 流式**（火山引擎 / 阿里云）：录音开始时开 WebSocket → 每 500ms 发送增量 → 松键后 `endStream()` 取最终结果
5. 松键 → `voice:transcribe` 收 `preAsrText`：>20s 录音信任流式结果，≤20s 且 <4 字才回退全量 ASR
6. **幻听过滤**：精确匹配 + 比例检测（≥85% 且 ≥3 段），标点清理
7. **流式注入**：LLM SSE 输出逐 chunk 直接注入光标（打字机效果），无 raw→backspace→refined 闪烁
8. **短文本短路**：≤5 字跳过 LLM，直接注入
9. **翻译模式**：ASR 后调 LLM 翻译。成功→注入译文；失败→胶囊显示错误面板
10. 词典纠错 → 统计/历史持久化

### LLM 润色体系

三个润色风格（设置 → 润色 → 润色风格），`polishMode` 存储在 Zustand + settings.json：

| 模式 | 值 | 描述 |
|------|------|------|
| 轻量 | `light` | 只补标点 + 修正明显错字，不改措辞 |
| 均衡 | `balanced` | 去口癖 + 纠错 + 补标点 + 保留原意（默认） |
| 结构化 | `deep` | 口语转书面 + 分行分点 + 结构化整理 |

- Prompt 在 `src/services/llm-refine.ts`，三个独立 Prompt + `buildRefinePrompt()`
- 流式注入在 `electron/main.ts` `doRefine` 块：`for await (chunk of streamRefine) injectText(chunk)`
- User Prompt 按模式变体

### 翻译热键

支持两种模式（`hotkey.ts` `translateCombo` + `electron/main.ts` IPC handler）：

- **独立组合键**（不含右 Alt）：所有键同时按下触发。如 `右 Ctrl` → 单按触发，`左 Ctrl + 左 Alt` → 同时按触发
- **修饰键模式**（含右 Alt）：按住其余键 + 右 Alt 触发。如默认 `右 Alt + 右 Shift`
- 支持 Insert、Delete、F1-F12、Space 等非修饰键（`VK_NAME_MAP` 扩展映射）
- `HotkeyRecorder` 支持多键录制，`keysRef` 跟踪所有按键

### 阿里云 ASR（Fun-ASR 协议）

- WebSocket 端点：`wss://dashscope.aliyuncs.com/api-ws/v1/inference`
- 协议：`run-task` → `task-started` → binary PCM → `result-generated` → `finish-task` → `task-finished`
- **注意**：这是 Fun-ASR 协议，不是 Qwen-ASR-Realtime（`/api-ws/v1/realtime`）
- 音频直接发原始 PCM（无 WAV header、无 base64）

### 火山引擎 ASR

- WebSocket 端点：`wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream`
- 流式文本保留最长（不覆盖），防止截断
- 连接测试用真实 WebSocket（非 HTTP `/submit`）

## 核心文件

```
electron/
├── main.ts              # 生命周期、IPC、ASR/LLM、流式注入、词典、统计
├── preload.ts           # window.tingmo API (IPC bridge)
├── hotkey.ts            # WH_KEYBOARD_LL 键盘钩子 + 翻译独立组合键 + injectKeyUp
├── hotkey-events.ts     # 按键去重、状态跟踪
├── text-inserter.ts     # SendInput 批量注入 + \n→Shift+Enter
├── tray.ts              # 系统托盘
└── stats-history.ts     # 统计/历史持久化

src/
├── components/
│   ├── FloatingWindow.tsx    # 浮窗胶囊：音频采集 + 流式 ASR + 波形 + 翻译界面
│   └── Settings/
│       ├── SettingsWindow.tsx  # 设置（侧边栏 5 Tab）
│       ├── HotkeyRecorder.tsx  # 热键录制（支持多键组合）
│       └── ...
├── services/
│   ├── asr-aliyun.ts          # 阿里云 Fun-ASR WebSocket + HTTP fallback
│   ├── asr-volcano.ts         # 火山引擎 WebSocket
│   ├── funasr-sherpa.ts       # 本地 SenseVoiceSmall（ITN on）
│   ├── funasr-cloud.ts        # OpenAI Whisper
│   ├── llm-refine.ts          # 3 润色模式 Prompt + buildRefinePrompt
│   ├── llm-openai.ts          # OpenAI 兼容 SSE streamRefine
│   ├── llm-gemini.ts          # Gemini streamRefine
│   ├── llm-providers.ts       # Provider 注册表
│   ├── connection-test.ts     # ASR/LLM 连接测试（火山用 WS）
│   └── text-corrector.ts      # 确定性文本纠错
├── hooks/
│   └── useAudioCapture.ts     # 音频采集 + GainNode 防尖峰
└── store/settings.ts          # Zustand（polishMode 等持久化）
```

## 关键 IPC

```
voice:asr-chunk / voice:asr-stream-*       # 流式 ASR
voice:transcribe                           # 主转写入口（流式注入）
voice:refine-failed                        # 润色失败通知
voice:finish-recording / cancel-recording  # 录制控制
floating:resize                            # 窗口缩放
settings:set-hotkey / set-translate-hotkey # 热键变更
settings:save-app-settings / load          # 配置持久化
model:check / model:ensure                 # 本地模型
```

## 已知限制

- **仅 Win x64**
- **SenseVoiceSmall 精度有限**：推荐配合 LLM 润色或使用云端 ASR
- **本地 ASR 已开启 ITN**：`useInverseTextNormalization: 1`
- **翻译依赖 LLM**：需配置 LLM
- **API Key 明文存储**于 `%APPDATA%/TingMo/data/settings.json`
- **透明窗口禁 box-shadow**：产生灰色光晕
- **音频启动瞬态**：GainNode 300ms fade-in 抑制，AudioContext.resume() 防跳过
- **翻译热键非修饰键**：设为独立键时该键被全局拦截（如 Insert 不再触发系统功能）
- **录音热键仅支持 MODIFIER_VK_MAP 中的修饰键**

## 近期变更（2026-06-29）

### V0.4.0
- **音效开关**：设置 → 选项 → 音效，可关闭胶囊出现/消失/成功音效
- **关于页面**：重写简介文案，移除技术标签
- **调试日志清理**：移除热键按下、字典匹配、设置保存等噪点日志
- **流式注入**：LLM 输出逐 chunk 直接注入，去掉了 Phase 1/Phase 2 两阶段 + backspace 替换
- **三档润色**：轻量/均衡/结构化，设置 UI 可选择，未启用润色时隐藏选择器
- **翻译热键**：独立组合键系统，支持 Insert/F-keys 等非修饰键
- **阿里云 ASR 协议修正**：从 Qwen-ASR-Realtime 切换到 Fun-ASR 协议（`/api-ws/v1/inference`）
- **状态机修复**：卡在 recognizing 时下次按键强制重置 + 15s watchdog
- **波形**：Web Audio GainNode fade-in 消除启动尖峰，线性映射
- **换行**：`\n` → `Shift+Enter` 注入，不触发聊天发送
