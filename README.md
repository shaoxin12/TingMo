# 听墨 TingMo

<p align="center">
  <img src="public/icon.png" alt="TingMo" width="96" />
</p>

<p align="center">
  <strong>说出来，它就帮你写上去。</strong>
</p>

<p align="center">
  <img src="docs/screenshot-v2.png" alt="TingMo 截图" width="600" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows%20x64-blue" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
  <img src="https://img.shields.io/badge/vibe%20coding-🤖-purple" />
</p>

---

## 这是什么

听墨是 Windows 上一个**自由、安静的 AI 语音输入工具**。按右 Alt 说话，松手，文字直接出现在光标位置——写文档、回消息、敲代码注释，嘴巴比手指快。

不绑任何 AI 厂商。**本地引擎离线跑**，数据不出电脑；云端接 OpenAI、火山、阿里云随你换。8 家大模型可选，翻译热键一键出译文。

轻量开源，托盘常住。没有皮肤弹窗、没有会员订阅。只有一粒胶囊浮窗，说话时浮起，说完消失。

> 🎙️ **Vibe Coding 项目** — 听墨由自然语言驱动开发，代码主要由 AI（Claude Code）生成，人工做方向决策和审核。

## 核心功能

### 🎤 语音输入
- 按热键说话，再按停止，语音实时转文字注入光标
- 支持**流式注入**：LLM 润色结果逐字输出（打字机效果），边说边出
- 两种按键模式：**按下说话**（Toggle，按一下开始/再按停止）和**按住说话**（Hold，按住录音松手停止）

### 🌐 翻译模式
- 独立翻译热键（默认 右 Shift + 右 Alt）
- 说话直接出译文，支持 **7 种目标语言**：英文、中文、日文、韩文、法语、德语、西班牙语
- 翻译失败时胶囊显示错误面板，不会注入错误文字

### 🧠 双引擎语音识别（ASR）

| 引擎 | 技术 | 说明 |
|------|------|------|
| **本地** | SenseVoiceSmall（sherpa-onnx） | 完全离线，~230MB，5 语言（中/英/日/韩/粤），ITN 开启 |
| **云端 · OpenAI** | Whisper（whisper-1 / large-v3 / large-v3-turbo） | HTTP multipart 上传，支持分段并行识别 |
| **云端 · 火山引擎** | 豆包 SeedASR（bigmodel / doubao-seed-asr-2.0） | WebSocket 流式，录音期间实时出结果 |
| **云端 · 阿里云** | Fun-ASR / Qwen-ASR | WebSocket 流式 + HTTP 异步回退，DashScope 百炼平台 |

### ✨ AI 润色
- 可选 LLM 对识别结果进行智能优化
- **三档风格**：
  - **轻量**：只补标点 + 修正明显错字，不改措辞
  - **均衡**（默认）：去口癖 + 纠错 + 补标点 + 保留原意
  - **结构化**：口语转书面 + 分行分点 + 结构化整理
- 短文本（≤5 字）自动跳过，直接注入原文

### 📖 词典纠错
- 自定义词对（错误 → 正确），三层次模糊匹配：
  1. 精确跳过（正确词已存在则忽略）
  2. 拼音匹配（同音异字，如"跟目录" → "根目录"）
  3. Levenshtein 距离（英文拼写变体）
- 内置 150+ 常见术语自动修正（技术专有名词、中文数字转阿拉伯、字母合并、日期标准化等）

### 📊 统计与历史
- 累计录音时长、字数、会话次数（**无上限**，一直累加）
- 最近 200 条语音记录，支持搜索、复制、重新注入（超出自动清理旧记录）
- 每日统计保留近 90 天，首页展示 7 天趋势图 + 今日统计

### 🔄 自动更新
- 基于 GitHub Releases，启动后自动检查
- 用户控制下载 + 安装并重启

### 🌍 5 语言界面
- 简体中文 / 繁體中文 / English / 日本語 / 한국어
- 首次启动自动检测系统语言
- 托盘菜单和工具提示同步切换

### 🔇 录音静音
- 录音时自动降低系统音频音量，避免麦克风录入扬声器声音

### 🎛️ 热键自定义
- 语音热键支持修饰键（左右 Shift/Ctrl/Alt）
- 翻译热键支持独立组合键（Insert、F1-F12、Space 等非修饰键）
- 设置页可视化录制热键

---

## LLM 支持（8 家服务商）

| 服务商 | 模型示例 | 鉴权 |
|--------|---------|------|
| **OpenAI** | gpt-4o-mini, gpt-4.1-nano | Bearer |
| **DeepSeek** | deepseek-v4-flash | Bearer |
| **Kimi (Moonshot)** | moonshot-v1-8k | Bearer |
| **MiniMax** | MiniMax-M2.5 | Bearer |
| **智谱 AI** | glm-4-flash | Bearer |
| **Google Gemini** | gemini-2.5-flash | API Key (Query) |
| **火山引擎** | doubao-seed-2.1-turbo | Bearer |
| **Ollama** | llama3.2（可换） | 无需鉴权 |

---

## 安装

从 [Releases](https://github.com/shaoxin12/tingmo/releases) 下载最新安装包。

**系统要求**：Windows x64

首次启动弹出引导向导：
1. **本地引擎**：自动下载模型（~230MB，HuggingFace 镜像），下载完即用，完全离线
2. **云端引擎**：需在设置中配置 ASR / LLM API Key，识别更精准

**数据存储**：
- 配置和统计：`%APPDATA%/TingMo/data/`
- 本地模型：`%APPDATA%/TingMo/models/funasr/`
- ⚠️ API Key 明文存储于 `settings.json`，请注意本地安全

---

## 使用方式

| 操作 | 默认快捷键 | 说明 |
|------|------------|------|
| 语音输入 | **右 Alt** | 按下开始录音，再按停止（按下模式）/ 按住录音松手停止（按住模式） |
| 翻译输入 | **右 Shift + 右 Alt** | 录音后自动翻译 |
| 取消录音 | Esc | 放弃当前录音 |
| 打开设置 | 左键托盘图标 | 配置语音引擎、API Key、热键、语言等 |

### 托盘图标

| 颜色 | 状态 |
|------|------|
| 默认 | 空闲 |
| 🔴 红色 | 录音中 |
| 🔵 蓝色 | 识别中 |

右键托盘图标弹出菜单：切换本地/API、按下/按住、录音静音、设置、退出。

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron + React + TypeScript | 33 / 18 / 5.6 |
| 构建（主进程） | esbuild | 0.28 |
| 构建（渲染进程） | Vite | 6.0 |
| 本地 ASR | sherpa-onnx（SenseVoiceSmall） | 1.13 |
| ONNX 运行时 | onnxruntime-node | 1.26 |
| 云端 ASR | 火山引擎 WS / 阿里云 Fun-ASR WS / OpenAI HTTP | — |
| LLM | OpenAI 兼容 SSE 流式 + Gemini | — |
| 音频 | Web Audio API → 48→16kHz 抗混叠重采样 → WAV | — |
| 文字注入 | Win32 `SendInput` + `KEYEVENTF_UNICODE`（koffi FFI） | 2.16 |
| 全局热键 | `SetWindowsHookExW`（koffi FFI） | — |
| 拼音匹配 | pinyin | 4.0 |
| 状态管理 | Zustand | 5.0 |
| 自动更新 | electron-updater | 6.3 |
| 打包 | electron-builder（NSIS 安装包） | 25.1 |
| 测试 | tsx（内置 test runner） | 4.22 |

### 架构

```
┌──────────────────────────────────────┐
│           Main Process              │
│  hotkey.ts     main.ts     tray.ts  │
│  (键盘钩子)    (核心调度)   (托盘)   │
│  text-inserter.ts  stats-history.ts │
│  (文字注入)         (统计持久化)      │
└──────────┬──────────────────────────┘
           │  IPC (contextBridge)
┌──────────┴──────────────────────────┐
│         Renderer Process            │
│  FloatingWindow.tsx  (浮窗胶囊)      │
│  Settings/           (设置窗口)      │
│  useAudioCapture.ts  (音频采集)      │
│  services/           (ASR/LLM 接口)  │
└─────────────────────────────────────┘
```

**状态机**：`IDLE → RECORDING → RECOGNIZING → REFINING → SUCCESS → IDLE`

- 15 秒看门狗：卡在 RECOGNIZING 时自动重置
- 任意非 IDLE 状态按热键强制重置到 IDLE

---

## 开发

```bash
# 安装依赖
npm install

# 启动开发环境（Vite + esbuild + Electron，主进程热更新）
npm run dev

# 仅构建主进程
npm run build:main

# 完整构建
npm run build

# 打包安装包
npm run electron:build

# 发布补丁版本
npm run release:patch

# 运行测试
npm run test:unit
```

### 调试
- 每次录音自动保存 WAV 到 `%APPDATA%/TingMo/debug_recordings/`
- 主进程日志带 `[Main]` 前缀，可通过 DevTools 或终端查看

### 已知限制
- 仅支持 Windows x64
- SenseVoiceSmall 精度有限，建议配合 LLM 润色或使用云端 ASR
- API Key 明文存储于本地 JSON 文件
- 翻译热键设为独立键时该键被全局拦截（如 Insert 不再触发系统功能）
- 录音热键仅支持修饰键（左/右 Shift、Ctrl、Alt）

---

## License

MIT

## 致谢

听墨由 [@shaoxin12](https://github.com/shaoxin12) 使用 Vibe Coding 方式开发，代码主要由 Claude Code 生成。感谢以下开源项目：

- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) — 本地语音识别引擎
- [koffi](https://github.com/Koromix/koffi) — Node.js 高性能 FFI
- [Zustand](https://github.com/pmndrs/zustand) — 轻量状态管理
- [electron-builder](https://github.com/electron-userland/electron-builder) — 打包分发
