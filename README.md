# 听墨 TingMo

> AI 赋能的 Windows 桌面语音输入法 | 🎤 Vibe Coding 项目

*[English](#english) is available below.*

![version](https://img.shields.io/badge/version-0.2-orange)
![platform](https://img.shields.io/badge/platform-Windows%20x64-blue)
![license](https://img.shields.io/badge/license-MIT-green)
![vibe](https://img.shields.io/badge/vibe%20coding-yes-ff69b4)

按下快捷键开始说话，松开后语音自动转文字注入光标位置。支持纯离线运行，也可接入 LLM 进行口语润色。

## 特性

- **本地 ASR** — Paraformer-large INT8 ONNX，228MB，完全离线
- **智能标点** — CT-Transformer 模型自动恢复 `，。？！、`
- **LLM 润色**（可选）— 去口语填充词 + 自动结构化 + 保留专属词汇
- **翻译模式** — 识别后自动翻译为目标语言
- **个性词典** — 添加专属词汇，模糊纠错 + LLM 上下文保留
- **5 语言界面** — 简体中文 / 繁體中文 / English / 日本語 / 한국어
- **极简交互** — 浮窗胶囊仅在录音时出现，无按钮

## 安装

从 [Releases](https://github.com/shaoxin12/tingmo/releases) 下载 `TingMo-Setup-0.2.exe`。

首次启动自动下载 ASR 模型（~230MB）。标点模型（~280MB）为可选，单独下载放入 `%APPDATA%/tingmo/models/funasr/`。

## 使用

| 操作 | 方式 |
|------|------|
| 语音输入 | 按下快捷键 → 说话 → 再次按下 |
| 翻译 | 按住翻译修饰键 + 按下快捷键 |
| 设置 | 右键系统托盘图标 → 设置 |

> 快捷键可在设置中自定义，默认语音键为右 Alt。

## LLM 润色（可选）

1. 设置 → AI 润色区域
2. 填入 OpenAI 兼容 API Key（支持 GPT-4o-mini / Claude / DeepSeek / 通义千问）
3. 开启"启用润色"

无需 LLM 时，ASR + CT-Transformer 标点结果直接注入，离线可用。

## 技术栈

| 层 | 技术 |
|----|------|
| 框架 | Electron 33 + React 18 + TypeScript |
| ASR | Paraformer-large INT8 ONNX (FunASR) |
| 标点 | CT-Transformer ONNX (sherpa-onnx) |
| LLM | OpenAI 兼容 API |
| 音频 | Web Audio API → 16kHz 重采样 → WAV |
| 注入 | Win32 `SendInput` + `KEYEVENTF_UNICODE` (koffi FFI) |
| 状态 | Zustand |
| i18n | React Context，5 语言 |

## 模型文件

存放于 `%APPDATA%/tingmo/models/funasr/`：

| 文件 | 大小 | 必需 |
|------|------|------|
| `paraformer-large-int8.onnx` | 228 MB | ✅ |
| `tokens.json` | 60 KB | ✅ |
| `am.mvn` | 11 KB | ✅ |
| `ct-transformer.onnx` | 281 MB | 可选 |
| `punct-tokens.json` | 4 MB | 可选 |

## 开发

```bash
npm install
npm run dev            # 终端 1: Vite
npm run electron:dev   # 终端 2: 构建 + Electron
```

## 关于

本项目为 Vibe Coding 作品——在 AI 辅助下快速迭代开发。欢迎提 Issue 和 PR。

## License

MIT

---

## English {#english}

TingMo is an AI-powered voice input app for Windows. Press a hotkey, speak, and your words appear at the cursor. Works fully offline with optional LLM refinement.

### Features

- **Local ASR** — Paraformer-large INT8 ONNX, runs offline
- **Punctuation** — CT-Transformer model adds `，。？！、`
- **LLM Refine** (optional) — Removes filler words, auto-structures, preserves custom terms
- **Translation** — ASR → translate to target language
- **Dictionary** — Add custom terms for fuzzy correction and LLM context
- **5-language UI** — 简体/繁體/English/日本語/한국어
- **Minimal UI** — Floating capsule, no buttons

### Install

Download `TingMo-Setup-0.2.exe` from [Releases](https://github.com/shaoxin12/tingmo/releases).

### Use

Press hotkey → speak → press again. Right-click tray for settings. Hotkeys are customizable.

### Vibe Coding

This project was built through vibe coding — rapid AI-assisted development. Issues and PRs welcome.
