# 听墨 TingMo

<p align="center">
  <img src="public/icon.png" alt="TingMo" width="96" />
</p>

<p align="center">
  <strong>在任意应用中，按下快捷键说话，语音自动转为文字注入光标。</strong>
</p>

<p align="center">
  <img src="docs/screenshot-v2.png" alt="TingMo 截图" width="600" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-V0.4.0-orange" />
  <img src="https://img.shields.io/badge/platform-Windows%20x64-blue" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

支持本地离线与云端双引擎识别，内置 AI 润色、词典纠错和翻译功能。

## 特性

- **双引擎识别** — 本地 SenseVoiceSmall（完全离线，230MB） + 云端 ASR（火山引擎 / 阿里云 / OpenAI Whisper）
- **AI 润色** — 口语去冗余 + 自动标点分段 + 三档可选，支持 8 家 LLM
- **独立翻译** — 专用快捷键触发，说话直接出译文
- **词典纠错** — 专有名词、术语自动修正，拼音模糊匹配
- **5 语言界面** — 简体中文 / 繁體中文 / English / 日本語 / 한국어

## 安装

从 [Releases](https://github.com/shaoxin12/tingmo/releases) 下载 `TingMo-Setup-0.4.0.exe`。

首次启动时选择语音引擎，选择本地引擎会自动下载模型（~230MB）。

## 使用

| 操作 | 快捷键 |
|------|--------|
| 语音输入 | 右 Alt（可自定义） |
| 翻译输入 | 右 Alt + 右 Shift（可自定义） |

> 默认切换模式：按一下开始录音，再按一下停止。可在设置中切换为按住模式。

## LLM 润色

1. 设置 → 模型 → LLM 大模型
2. 填入 API Key（支持 OpenAI / Claude / DeepSeek / 通义千问 / Gemini 等）
3. 开启「启用润色」，选择润色风格（轻量 / 均衡 / 结构化）

不启用 LLM 时，ASR 识别结果直接注入，纯离线可用。

## 技术栈

Electron 33 · React 18 · TypeScript · SenseVoiceSmall (sherpa-onnx) · Web Audio API · Win32 SendInput (koffi FFI) · Zustand

## 开发

```bash
npm install
npm run dev
```

## License

MIT
