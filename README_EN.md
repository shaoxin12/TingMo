# TingMo 听墨

<p align="center">
  <img src="public/icon.png" alt="TingMo" width="96" />
</p>

<p align="center">
  <strong>A Windows desktop voice input app. Press a hotkey, speak, and your words are typed directly at the cursor.</strong>
</p>

<p align="center">
  <img src="docs/screenshot-v2.png" alt="TingMo Screenshot" width="600" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-V0.4.0-orange" />
  <img src="https://img.shields.io/badge/platform-Windows%20x64-blue" />
  <img src="https://img.shields.io/badge/license-MIT-green" />
</p>

---

## What is this

TingMo is a Windows desktop voice input tool. Press a hotkey in any app — chat, documents, email, browser — speak, and your words are transcribed and typed at the cursor. No window switching, no manual pasting.

Unlike mainstream AI input methods, TingMo doesn't lock you into a single vendor. ASR and LLM providers are freely selectable. It runs fully offline if you choose the local engine, keeping your data on-device. Lightweight tray app — no skins, no pop-ups.

## Features

- **Dual-Engine ASR**: Local SenseVoiceSmall (fully offline, 230MB, 5 languages: zh/en/ja/ko/yue) and cloud ASR (Volcano Engine / Alibaba Cloud Fun-ASR / OpenAI Whisper) — switch anytime
- **AI Polish**: Optional LLM refinement — removes filler words, adds punctuation, structures text. 3 modes (Light / Balanced / Structured) supporting 8 providers including OpenAI, Claude, DeepSeek, Qwen, and Gemini
- **Translation**: Dedicated hotkey triggers translation mode. 7 target languages: EN, ZH, JA, KO, FR, DE, ES
- **Dictionary**: Custom terminology with fuzzy pinyin matching and Levenshtein distance correction for ASR homophone errors
- **5-Language UI**: 简体中文 / 繁體中文 / English / 日本語 / 한국어
- **Auto-Mute**: Automatically mutes system audio while recording to prevent microphone feedback

## Installation

Download `TingMo-Setup-0.4.0.exe` from [Releases](https://github.com/shaoxin12/tingmo/releases).

On first launch you'll be guided through engine selection:
- **Local engine**: Auto-downloads the model (~230MB), then works entirely offline
- **Cloud engine**: Requires an API key in Settings, offers higher accuracy

## Usage

| Action | Default Hotkey |
|--------|---------------|
| Voice Input | Right Alt (toggle: press to start, press again to stop) |
| Translate | Right Alt + Right Shift |

> Hotkeys and recording mode (toggle/hold) are customizable in Settings.

Right-click the tray icon for Settings, where you can configure ASR engine, LLM polish, dictionary, hotkeys, and more.

## Development

```bash
npm install
npm run dev
```

Tech Stack: Electron 33 · React 18 · TypeScript · SenseVoiceSmall (sherpa-onnx) · Web Audio API · Win32 SendInput (koffi FFI) · Zustand

## License

MIT
