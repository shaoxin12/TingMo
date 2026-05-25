# External API Integration — Design Spec

**Date:** 2026-05-25
**Status:** Ready for implementation

## Overview

Replace the single OpenAI-compatible backend with a multi-provider system. Users select their ASR and LLM provider from dropdowns. Each provider preset auto-fills endpoint and default model. A test button next to each API Key field verifies connectivity.

## Providers

### ASR (3 providers)

| Key | Name | Endpoint | Auth |
|-----|------|----------|------|
| `openai` | OpenAI Whisper | `https://api.openai.com/v1` | Bearer |
| `volcano` | 火山引擎 | `https://openspeech.bytedance.com/api/v3/auc/bigmodel` | X-Api-Key header + static Resource ID |
| `aliyun` | 阿里云 | `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr` | Token-based (appKey -> token) |

All three implement `IRecognitionProvider`. `local` (sherpa-onnx) remains unchanged.

### LLM (8 providers)

| Key | Name | Endpoint | Default Model | Auth |
|-----|------|----------|---------------|------|
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Bearer |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | Bearer |
| `kimi` | Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | Bearer |
| `minimax` | MiniMax | `https://api.minimax.chat/v1` | `abab6.5s-chat` | Bearer |
| `zhipu` | 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Bearer |
| `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | API Key (query param) |
| `ollama` | Ollama | `http://localhost:11434/v1` | `llama3` | None |
| `volcano` | 火山引擎 (豆包) | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-lite-32k` | Bearer |

Seven OpenAI-compatible providers share `OpenAIProvider`. Gemini gets a dedicated `GeminiProvider`.

## Settings Store Changes

```typescript
// New fields:
llmProvider: string;         // provider key
llmApiKey: string;           // LLM-specific API key
llmModel: string;            // auto-filled on provider switch
llmBaseUrl: string;          // auto-filled on provider switch

asrCloudProvider: string;    // 'openai' | 'volcano' | 'aliyun'
asrCloudApiKey: string;      // ASR API key (one field for all)
```

## UI Layout (Model tab)

```
ASR section:
  [Local] [API]
  Provider: [Volcano Engine v]  (API mode only)
  API Key:  [............] [Test]  (API mode only)

LLM section:
  [Enable refine toggle]
  Provider: [DeepSeek v]          (enabled only)
  API Key:  [............] [Test] (enabled, hidden for Ollama)
  Model:    [deepseek-chat v]     (enabled only)
  Endpoint: [https://api.deepseek.com/v1] (enabled only)
```

Provider logos (16x16) in dropdown and next to provider name.

## Test Button

1. ASR: POST minimal silent WAV; check HTTP status
2. LLM: POST `{messages:[{role:"user",content:"Hi"}],max_tokens:1}`
3. States: idle -> "Testing..." -> green "Connected" / red "Failed: {reason}"

IPC: `asr:test-connection` and `llm:test-connection`.

## New Files

```
src/services/
├── asr-volcano.ts          # VolcanoASRProvider
├── asr-aliyun.ts           # AliyunASRProvider
├── llm-providers.ts        # Provider registry (presets, models, logos)
├── llm-gemini.ts           # GeminiProvider
└── connection-test.ts      # Test helpers

src/assets/providers/       # 11 provider logo SVGs
```

## Modified Files

```
electron/main.ts            # Multi-provider selection, new IPC handlers
electron/preload.ts         # testAsrConnection / testLlmConnection
src/store/settings.ts       # New fields
src/components/Settings/SettingsWindow.tsx  # Provider dropdowns, test buttons
src/i18n/translations.ts    # New i18n keys
```

## Error Handling

- Invalid API key: test button shows `401 Unauthorized`
- Network timeout: test button shows `Connection timeout`
- Ollama unreachable: treated as network error

## Technical Notes

- Volcano ASR uses HTTP submit+query (async), matching existing record-then-transcribe flow
- Aliyun ASR uses one-shot HTTP endpoint
- Gemini uses `generateContent` API with `x-goog-api-key` header
- Ollama API key field hidden in UI
