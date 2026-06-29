# 听墨 TingMo

<p align="center">
  <img src="public/icon.png" alt="TingMo" width="96" />
</p>

<p align="center">
  <strong>一款 Windows 桌面语音输入法，按下快捷键说话，语音自动转为文字注入光标。</strong>
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

## 这是什么

听墨是一款 Windows 桌面语音输入工具。在任意应用（聊天、文档、邮件、浏览器）中，按下快捷键开始说话，松开后语音自动识别并注入光标位置——不需要切换窗口，不需要手动粘贴。

和市面上主流 AI 输入法不同：听墨不绑厂商，ASR 和 LLM 都可以自由选择服务商；支持完全离线运行，数据不上传；轻量托盘常驻，没有输入法皮肤和弹窗。

## 核心功能

- **双引擎语音识别**：本地 SenseVoiceSmall（完全离线，230MB，中英日韩粤 5 语言）和云端 ASR（火山引擎 / 阿里云 Fun-ASR / OpenAI Whisper），可随时切换
- **AI 润色**：可选 LLM 对识别结果去口语词、补标点、结构化排版，三档可选（轻量 / 均衡 / 结构化），支持 OpenAI / Claude / DeepSeek / 通义千问 / Gemini 等 8 家服务商
- **翻译模式**：独立快捷键触发，说话直接出译文，支持中英日韩法德西 7 种目标语言
- **词典纠错**：内置专有名词和术语自动修正，拼音模糊匹配 + Levenshtein 距离，避免 ASR 同音误识别
- **5 语言界面**：简体中文 / 繁體中文 / English / 日本語 / 한국어
- **录音静音**：录音时自动静音系统音频，避免麦克风录入正在播放的声音

## 安装

从 [Releases](https://github.com/shaoxin12/tingmo/releases) 下载最新安装包 `TingMo-Setup-0.4.0.exe`。

首次启动会弹出引导向导，选择语音引擎：
- **本地引擎**：自动下载模型（~230MB），下载完即可使用，完全离线
- **云端引擎**：需在设置中配置 API Key，识别更精准

## 使用方式

| 操作 | 默认快捷键 |
|------|------------|
| 语音输入 | 右 Alt（按一下开始，再按一下停止） |
| 翻译输入 | 右 Shift + 右 Alt |

## 开发

```bash
npm install
npm run dev
```

技术栈：Electron 33 · React 18 · TypeScript · SenseVoiceSmall (sherpa-onnx) · Web Audio API · Win32 SendInput (koffi FFI) · Zustand

## License

MIT
