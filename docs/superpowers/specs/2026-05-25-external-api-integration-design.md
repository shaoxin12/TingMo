# 外部 API 接入 — 设计文档

**日期：** 2026-05-25
**状态：** 待实现

## 概述

将单一的 OpenAI 兼容后端替换为多厂商 Provider 系统。用户通过下拉菜单选择 ASR 和 LLM 厂商，切换时自动填充端点 URL 和默认模型。每个 API Key 输入框旁边提供测试按钮，验证连通性。

## Provider 清单

### ASR（3 家云厂商 + 本地）

| Key | 名称 | 端点 | 认证方式 |
|-----|------|----------|------|
| `openai` | OpenAI Whisper | `https://api.openai.com/v1` | Bearer Token |
| `volcano` | 火山引擎 | `https://openspeech.bytedance.com/api/v3/auc/bigmodel` | X-Api-Key 头 + 内置 Resource ID |
| `aliyun` | 阿里云 | `https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr` | Token 鉴权（AppKey 换 Token） |

三家均实现 `IRecognitionProvider` 接口。本地（sherpa-onnx）保持不变。

### LLM（8 家厂商）

| Key | 名称 | 端点 | 默认模型 | 认证 |
|-----|------|----------|------|------|
| `openai` | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Bearer |
| `deepseek` | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | Bearer |
| `kimi` | Kimi（月之暗面） | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` | Bearer |
| `minimax` | MiniMax | `https://api.minimax.chat/v1` | `abab6.5s-chat` | Bearer |
| `zhipu` | 智谱 AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | Bearer |
| `gemini` | Google Gemini | `https://generativelanguage.googleapis.com/v1beta` | `gemini-2.0-flash` | API Key（查询参数） |
| `ollama` | Ollama | `http://localhost:11434/v1` | `llama3` | 无 |
| `volcano` | 火山引擎（豆包） | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-lite-32k` | Bearer |

7 家 OpenAI 兼容厂商共用 `OpenAIProvider` 类。Gemini 因 API 格式不同，单独实现 `GeminiProvider`。

## 设置存储变更

```typescript
// LLM 配置（原有字段拆分，独立于 ASR）
llmProvider: string;         // 厂商 key
llmApiKey: string;           // LLM 专用 API Key
llmModel: string;            // 切换厂商自动更新默认值
llmBaseUrl: string;          // 切换厂商自动更新默认值

// ASR 云端配置（新增，与 LLM 独立）
asrCloudProvider: string;    // 'openai' | 'volcano' | 'aliyun'
asrCloudApiKey: string;      // ASR API Key（三家统一，就一个字段）
```

切换厂商时，模型下拉列表和端点自动填充。用户仍可手动覆盖。

## UI 布局（模型标签页）

```
┌─ ASR 语音识别 ─────────────────────────────┐
│ 语音模式   [本地] [API]                      │
│ 服务商     [火山引擎 ▼]       （API 模式显示） │
│ API Key    [············] [测试]             │
└─────────────────────────────────────────────┘

┌─ LLM 大模型 ───────────────────────────────┐
│ 启用润色   [========○]                      │
│ 服务商     [DeepSeek ▼]      （启用后显示）   │
│ API Key    [············] [测试]（Ollama 隐藏）│
│ 模型       [deepseek-chat ▼] （启用后显示）   │
│ API 端点   [https://api.deepseek.com/v1]    │
└─────────────────────────────────────────────┘
```

厂商 logo（16×16）显示在下拉选项和厂商名旁边。

## 测试按钮

1. ASR：发送最小静音 WAV，检查 HTTP 状态码（200=通，401/403=密钥错，超时=网络不通）
2. LLM：发送 `{messages:[{role:"user",content:"Hi"}],max_tokens:1}`，同上逻辑
3. 状态反馈：空闲 → "测试中..." → 绿色 "✓ 连接成功" / 红色 "✗ 失败：原因"

新增 IPC：`asr:test-connection` 和 `llm:test-connection`。

## 新增文件

```
src/services/
├── asr-volcano.ts          # VolcanoASRProvider — HTTP 提交 + 轮询
├── asr-aliyun.ts           # AliyunASRProvider — HTTP 一句话识别
├── llm-providers.ts        # Provider 注册表（预设、默认模型、logo）
├── llm-gemini.ts           # GeminiProvider — Google AI Studio API
└── connection-test.ts      # 通用连接测试工具

src/assets/providers/       # 11 个厂商 logo SVG（16×16）
```

## 修改文件

```
electron/main.ts            # 多 Provider 动态选择、新增 IPC 处理
electron/preload.ts         # testAsrConnection / testLlmConnection IPC 桥接
src/store/settings.ts       # 新增 llmProvider / asrCloudProvider / asrCloudApiKey
src/components/Settings/SettingsWindow.tsx  # 厂商下拉菜单、测试按钮、ASR/LLM 独立 Key
src/i18n/translations.ts    # 新增翻译键（厂商名、测试状态）
```

## 数据流（顶层不变）

```
用户配置 → Zustand → IPC saveLlmSettings → llm-settings.json 持久化
右 Alt 录音 → Web Audio 采集 → IPC voice:transcribe
  → main 根据 asrCloudProvider 选 ASR Provider → 识别
  → main 根据 llmProvider 选 LLM Provider → 润色/翻译
  → SendInput 注入文字
```

## 错误处理

- API Key 无效：测试按钮显示 "401 密钥错误"
- 网络超时：测试按钮显示 "连接超时"
- 厂商特有错误：在测试结果和转写错误中展示具体信息
- Ollama 不可达：视为网络错误

## 技术要点

- 火山引擎 ASR 使用 HTTP 异步提交+轮询，匹配现有"录完再识别"架构
- 阿里云 ASR 使用 HTTP 一句话识别接口
- Gemini 使用 `generateContent` API + `x-goog-api-key` 头，不走 Bearer
- Ollama 选中时隐藏 API Key 输入框
