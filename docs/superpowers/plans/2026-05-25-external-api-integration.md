# 外部 API 接入 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将单一的 OpenAI 兼容后端替换为 3 家 ASR + 8 家 LLM 厂商的多 Provider 系统，每个 API Key 旁带测试按钮。

**Architecture:** 新增 Provider 注册表 `llm-providers.ts` 统一管理厂商预设（端点、模型、logo）；火山引擎和阿里云 ASR 各自实现 `IRecognitionProvider`；Gemini 实现 `IRefinementProvider`；其余 7 家 LLM 共用现有 `OpenAIProvider`，仅 endpoint/model 不同。

**Tech Stack:** TypeScript + Electron (main process fetch) + React 18 + Zustand + i18n (5 languages)

---

### Task 1: Provider 注册表 `src/services/llm-providers.ts`

**Files:**
- Create: `src/services/llm-providers.ts`

- [ ] **Step 1: 创建 Provider 注册表和类型定义**

```typescript
// src/services/llm-providers.ts
// Provider registry — presets for all LLM and ASR cloud providers

export type LLMProviderKey = 'openai' | 'deepseek' | 'kimi' | 'minimax' | 'zhipu' | 'gemini' | 'ollama' | 'volcano';
export type ASRCloudProviderKey = 'openai' | 'volcano' | 'aliyun';

export interface LLMProviderPreset {
  key: LLMProviderKey;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  authType: 'bearer' | 'apiKey' | 'none';
  color: string;
  initial: string;
}

export interface ASRCloudProviderPreset {
  key: ASRCloudProviderKey;
  name: string;
  endpoint: string;
  authType: 'bearer' | 'apiKey';
  color: string;
  initial: string;
}

export const LLM_PROVIDERS: LLMProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4.1', 'o4-mini'],
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    authType: 'bearer', color: '#4D6BFE', initial: 'DS',
  },
  {
    key: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    authType: 'bearer', color: '#6B5CE7', initial: 'KI',
  },
  {
    key: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1',
    defaultModel: 'abab6.5s-chat',
    models: ['abab6.5s-chat', 'abab7-chat-preview', 'MiniMax-Text-01'],
    authType: 'bearer', color: '#6C5DD3', initial: 'MM',
  },
  {
    key: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-flash',
    models: ['glm-4-flash', 'glm-4-plus', 'glm-4', 'glm-4-air'],
    authType: 'bearer', color: '#3B82F6', initial: 'ZP',
  },
  {
    key: 'gemini', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    authType: 'apiKey', color: '#4285F4', initial: 'GE',
  },
  {
    key: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3',
    models: ['llama3', 'llama3.1', 'mistral', 'qwen2.5', 'deepseek-r1'],
    authType: 'none', color: '#000000', initial: 'OL',
  },
  {
    key: 'volcano', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    defaultModel: 'doubao-lite-32k',
    models: ['doubao-lite-32k', 'doubao-pro-32k', 'doubao-pro-128k', 'deepseek-r1-0528', 'deepseek-v3-0324'],
    authType: 'bearer', color: '#3370FF', initial: 'VH',
  },
];

export const ASR_CLOUD_PROVIDERS: ASRCloudProviderPreset[] = [
  {
    key: 'openai', name: 'OpenAI Whisper', endpoint: 'https://api.openai.com/v1',
    authType: 'bearer', color: '#10A37F', initial: 'OA',
  },
  {
    key: 'volcano', name: '火山引擎', endpoint: 'https://openspeech.bytedance.com/api/v3/auc/bigmodel',
    authType: 'apiKey', color: '#3370FF', initial: 'VH',
  },
  {
    key: 'aliyun', name: '阿里云', endpoint: 'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr',
    authType: 'apiKey', color: '#FF6A00', initial: 'AL',
  },
];

export function getLLMProvider(key: string): LLMProviderPreset | undefined {
  return LLM_PROVIDERS.find((p) => p.key === key);
}

export function getASRCloudProvider(key: string): ASRCloudProviderPreset | undefined {
  return ASR_CLOUD_PROVIDERS.find((p) => p.key === key);
}

export function getLLMModels(key: string): string[] {
  return getLLMProvider(key)?.models || [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/llm-providers.ts
git commit -m "feat: add provider registry with 8 LLM + 3 ASR cloud presets"
```

---

### Task 2: 连接测试工具 `src/services/connection-test.ts`

**Files:**
- Create: `src/services/connection-test.ts`

- [ ] **Step 1: 创建连接测试函数**

```typescript
// src/services/connection-test.ts
// Minimal API calls to verify provider connectivity

export interface TestResult {
  ok: boolean;
  error?: string;
  status?: number;
}

/**
 * Test ASR cloud connectivity by sending a minimal silent WAV.
 */
export async function testAsrConnection(
  provider: string,
  apiKey: string,
  endpoint: string,
): Promise<TestResult> {
  const sampleRate = 16000;
  const numSamples = 160;
  const dataSize = numSamples * 2;
  const header = buildWavHeader(dataSize, sampleRate);
  const silence = Buffer.alloc(dataSize, 0);
  const wav = Buffer.concat([header, silence]);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);

    let res: Response;
    if (provider === 'openai') {
      const formData = new FormData();
      formData.append('file', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
      formData.append('model', 'whisper-1');
      res = await fetch(`${endpoint.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
        signal: ctrl.signal,
      });
    } else {
      const headers: Record<string, string> = { 'Content-Type': 'audio/wav' };
      if (provider === 'volcano') {
        headers['X-Api-Key'] = apiKey;
        headers['X-Api-Resource-Id'] = 'volc.seedasr.auc';
        headers['X-Api-Request-Id'] = crypto.randomUUID();
      } else if (provider === 'aliyun') {
        const token = await getAliyunToken(apiKey);
        if (!token) {
          clearTimeout(timer);
          return { ok: false, error: 'Failed to get Aliyun token from appKey' };
        }
        headers['X-NLS-Token'] = token;
      }
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: wav,
        signal: ctrl.signal,
      });
    }

    clearTimeout(timer);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `密钥无效 (HTTP ${res.status})`, status: res.status };
    }
    if (res.ok || res.status >= 400) {
      return { ok: true };
    }
    return { ok: false, error: `服务器错误 (HTTP ${res.status})`, status: res.status };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, error: '连接超时，请检查网络或端点地址' };
    }
    return { ok: false, error: `网络错误: ${err.message?.slice(0, 100)}` };
  }
}

/**
 * Test LLM connectivity by sending a minimal chat completion.
 */
export async function testLlmConnection(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl: string,
): Promise<TestResult> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);

    let res: Response;
    if (provider === 'gemini') {
      const url = `${baseUrl.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Hi' }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
        signal: ctrl.signal,
      });
    } else {
      const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 1,
        }),
        signal: ctrl.signal,
      });
    }

    clearTimeout(timer);

    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: `密钥无效 (HTTP ${res.status})`, status: res.status };
    }
    if (res.ok) {
      return { ok: true };
    }
    const errText = await res.text().catch(() => '');
    return { ok: false, error: `请求失败 (HTTP ${res.status}): ${errText.slice(0, 100)}`, status: res.status };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, error: '连接超时，请检查网络或端点地址' };
    }
    return { ok: false, error: `网络错误: ${err.message?.slice(0, 100)}` };
  }
}

function buildWavHeader(dataSize: number, sampleRate: number): Buffer {
  const buf = Buffer.alloc(44);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}

async function getAliyunToken(appKey: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nls-meta.cn-shanghai.aliyuncs.com/pop/2018-05-18/tokens?appKey=${appKey}`,
      { method: 'POST', signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const json: any = await res.json();
    return json?.Token || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/connection-test.ts
git commit -m "feat: add connection test helpers for ASR and LLM"
```

---

### Task 3: 火山引擎 ASR Provider `src/services/asr-volcano.ts`

**Files:**
- Create: `src/services/asr-volcano.ts`

- [ ] **Step 1: 实现 VolcanoASRProvider（HTTP 提交 + 轮询）**

```typescript
// src/services/asr-volcano.ts
import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';

const SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
const QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
const RESOURCE_ID = 'volc.seedasr.auc';

export class VolcanoASRProvider implements IRecognitionProvider {
  readonly name = 'Volcano ASR';
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  constructor(private apiKey: string) {}

  async initialize(): Promise<boolean> {
    if (!this.apiKey) {
      this.isReady = false;
      return false;
    }
    this.isReady = true;
    console.log('[Volcano ASR] Ready');
    return true;
  }

  async transcribe(audioBuffer: Buffer, _sampleRate: number, _lang?: string): Promise<RecognitionResult> {
    const t0 = performance.now();
    const wavBase64 = audioBuffer.toString('base64');
    const taskId = crypto.randomUUID();

    try {
      const submitCtrl = new AbortController();
      const submitTimer = setTimeout(() => submitCtrl.abort(), 15000);

      const submitRes = await fetch(SUBMIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Request-Id': taskId,
        },
        body: JSON.stringify({
          audio_format: 'wav',
          audio_data: wavBase64,
          model_name: 'bigmodel',
          enable_itn: true,
          enable_punctuation: true,
          language: 'auto',
        }),
        signal: submitCtrl.signal,
      });

      clearTimeout(submitTimer);

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => '');
        throw new Error(`Volcano ASR submit ${submitRes.status}: ${errText.slice(0, 200)}`);
      }

      const submitJson: any = await submitRes.json();
      const pollTaskId = submitJson.task_id || taskId;

      for (let i = 0; i < 30; i++) {
        await sleep(1000);

        const pollRes = await fetch(QUERY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
            'X-Api-Resource-Id': RESOURCE_ID,
            'X-Api-Request-Id': crypto.randomUUID(),
          },
          body: JSON.stringify({ task_id: pollTaskId }),
        });

        if (!pollRes.ok) continue;

        const pollJson: any = await pollRes.json();
        if (pollJson.status === 'completed') {
          const text = pollJson.result?.text || pollJson.text || '';
          console.log('[Volcano ASR] Result:', text.slice(0, 60));
          return {
            text: text.trim(),
            durationMs: performance.now() - t0,
            language: pollJson.result?.language || 'zh',
          };
        }
        if (pollJson.status === 'failed') {
          throw new Error(`Volcano ASR recognition failed: ${pollJson.message || 'unknown'}`);
        }
      }

      throw new Error('Volcano ASR polling timeout (30s)');
    } catch (err: any) {
      console.error('[Volcano ASR] Transcription failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    this.isReady = false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/asr-volcano.ts
git commit -m "feat: add Volcano ASR provider (HTTP submit + poll)"
```

---

### Task 4: 阿里云 ASR Provider `src/services/asr-aliyun.ts`

**Files:**
- Create: `src/services/asr-aliyun.ts`

- [ ] **Step 1: 实现 AliyunASRProvider（HTTP 一句话识别）**

```typescript
// src/services/asr-aliyun.ts
import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';

const ASR_ENDPOINT = 'https://nls-gateway.cn-shanghai.aliyuncs.com/stream/v1/asr';

export class AliyunASRProvider implements IRecognitionProvider {
  readonly name = 'Aliyun ASR';
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;
  private token: string | null = null;
  private tokenExpiry = 0;

  constructor(private appKey: string) {}

  async initialize(): Promise<boolean> {
    if (!this.appKey) {
      this.isReady = false;
      return false;
    }
    try {
      await this.ensureToken();
      this.isReady = true;
      console.log('[Aliyun ASR] Ready');
      return true;
    } catch {
      this.isReady = false;
      return false;
    }
  }

  async transcribe(audioBuffer: Buffer, sampleRate: number, _lang?: string): Promise<RecognitionResult> {
    const t0 = performance.now();
    await this.ensureToken();

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);

      const url = `${ASR_ENDPOINT}?appkey=${this.appKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          'X-NLS-Token': this.token!,
        },
        body: new Uint8Array(audioBuffer),
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Aliyun ASR ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await res.json();
      const text = json.result || json.Result || '';
      console.log('[Aliyun ASR] Result:', text.slice(0, 60));

      return {
        text: text.trim(),
        durationMs: performance.now() - t0,
        language: 'zh',
      };
    } catch (err: any) {
      console.error('[Aliyun ASR] Transcription failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    this.isReady = false;
    this.token = null;
  }

  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiry) return;

    const res = await fetch(
      `https://nls-meta.cn-shanghai.aliyuncs.com/pop/2018-05-18/tokens?appKey=${this.appKey}`,
      { method: 'POST', signal: AbortSignal.timeout(5000) },
    );

    if (!res.ok) {
      throw new Error(`Aliyun token request failed: ${res.status}`);
    }

    const json: any = await res.json();
    if (!json.Token) {
      throw new Error('Aliyun token response missing Token field');
    }

    this.token = json.Token;
    this.tokenExpiry = Date.now() + (json.ExpireTime || 3600) * 1000 * 0.9;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/asr-aliyun.ts
git commit -m "feat: add Aliyun ASR provider (HTTP one-shot)"
```

---

### Task 5: Gemini LLM Provider `src/services/llm-gemini.ts`

**Files:**
- Create: `src/services/llm-gemini.ts`

- [ ] **Step 1: 实现 GeminiProvider（Google AI Studio API）**

```typescript
// src/services/llm-gemini.ts
import type { IRefinementProvider, RefineContext, RefinementResult } from './llm-refine';
import { buildRefinePrompt, buildTranslatePrompt } from './llm-refine';

export interface GeminiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class GeminiProvider implements IRefinementProvider {
  readonly name = 'Gemini';

  constructor(private config: GeminiConfig) {}

  async refine(rawText: string, context?: RefineContext): Promise<RefinementResult> {
    const t0 = performance.now();
    const systemPrompt = buildRefinePrompt(context);
    return this.callAPI(systemPrompt, rawText, t0);
  }

  async translate(text: string, targetLang: string, context?: RefineContext): Promise<RefinementResult> {
    const t0 = performance.now();
    const systemPrompt = buildTranslatePrompt(targetLang, context?.dictionary);
    return this.callAPI(systemPrompt, text, t0);
  }

  private async callAPI(systemPrompt: string, userText: string, t0: number): Promise<RefinementResult> {
    const baseUrl = (this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = this.config.model || 'gemini-2.0-flash';
    const url = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`;
    const timeout = this.config.timeoutMs || 8000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const body: any = {
        contents: [{ parts: [{ text: userText }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.1 },
      };

      if (systemPrompt) {
        body.systemInstruction = { parts: [{ text: systemPrompt }] };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await res.json();
      const refinedText = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || userText;

      return {
        refinedText,
        originalText: userText,
        provider: `gemini/${model}`,
        durationMs: performance.now() - t0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/llm-gemini.ts
git commit -m "feat: add Gemini LLM provider (Google AI Studio API)"
```

---

### Task 6: Zustand Store 扩展 `src/store/settings.ts`

**Files:**
- Modify: `src/store/settings.ts`

- [ ] **Step 1: 新增 LLM/ASR Provider 字段**

在文件顶部新增 import：
```typescript
import { getLLMProvider } from '../services/llm-providers';
```

在 `SettingsState` 接口中新增字段：
```typescript
// LLM — provider-aware
llmProvider: string;
// (llmApiKey, llmModel, llmBaseUrl 保留不变，含义变为 LLM 专用)

// ASR cloud — independent from LLM
asrCloudProvider: string;
asrCloudApiKey: string;

// + 对应的 setter:
setLlmProvider: (p: string) => void;
setAsrCloudProvider: (p: string) => void;
setAsrCloudApiKey: (key: string) => void;
```

在 `create<SettingsState>` 中新增默认值：
```typescript
llmProvider: 'openai',

asrCloudProvider: 'openai',
asrCloudApiKey: '',
```

新增 setter 实现（替换原 `setLlmApiKey` 等如果有冲突）：
```typescript
setLlmProvider: (p) => {
  const preset = getLLMProvider(p);
  set({
    llmProvider: p,
    llmModel: preset?.defaultModel || 'gpt-4o-mini',
    llmBaseUrl: preset?.baseUrl || 'https://api.openai.com/v1',
  });
},
setAsrCloudProvider: (p) => set({ asrCloudProvider: p }),
setAsrCloudApiKey: (key) => set({ asrCloudApiKey: key }),
```

在 `schedulePersist` 中新增持久化字段：
```typescript
// 在 saveAppSettings 调用的对象中追加:
llmProvider: state.llmProvider,
asrCloudProvider: state.asrCloudProvider,
```

在 `hydrate` 中恢复新字段：
```typescript
// 在 set() 调用中追加:
llmProvider: saved.llmProvider || 'openai',
asrCloudProvider: saved.asrCloudProvider || 'openai',
```

- [ ] **Step 2: Verify compilation**

```bash
npx tsc --noEmit src/store/settings.ts 2>&1
```

- [ ] **Step 3: Commit**

```bash
git add src/store/settings.ts
git commit -m "feat: add provider selection fields to settings store"
```

---

### Task 7: i18n 翻译键 `src/i18n/translations.ts`

**Files:**
- Modify: `src/i18n/translations.ts`

- [ ] **Step 1: 新增测试按钮和厂商名翻译键**

在 `D` 对象末尾（最后一个 entry 之后）追加：

```typescript
  // ── Provider test button ────────────────────────────────
  'test.button':          { 'zh-CN': '测试',       'zh-TW': '測試',       en: 'Test',          ja: 'テスト',       ko: '테스트' },
  'test.testing':         { 'zh-CN': '测试中...',  'zh-TW': '測試中...',  en: 'Testing...',    ja: 'テスト中...',  ko: '테스트 중...' },
  'test.success':         { 'zh-CN': '连接成功',   'zh-TW': '連接成功',   en: 'Connected',     ja: '接続成功',     ko: '연결 성공' },
  'test.failed':          { 'zh-CN': '连接失败',   'zh-TW': '連接失敗',   en: 'Failed',        ja: '接続失敗',     ko: '연결 실패' },

  // ── Provider labels ─────────────────────────────────────
  'provider.asrService':  { 'zh-CN': '服务商',     'zh-TW': '服務商',     en: 'Provider',      ja: 'プロバイダ',   ko: '제공업체' },
  'provider.llmService':  { 'zh-CN': '服务商',     'zh-TW': '服務商',     en: 'Provider',      ja: 'プロバイダ',   ko: '제공업체' },

  // ── ASR cloud section ───────────────────────────────────
  'model.asrCloudApiKey':     { 'zh-CN': 'API Key',  'zh-TW': 'API Key',  en: 'API Key',       ja: 'APIキー',       ko: 'API 키' },
  'model.asrCloudApiKeyPlaceholder': { 'zh-CN': '请输入 API Key', 'zh-TW': '請輸入 API Key', en: 'Enter API Key', ja: 'APIキーを入力', ko: 'API 키 입력' },
```

- [ ] **Step 2: Verify tsc**

```bash
npx tsc --noEmit --skipLibCheck 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "feat: add i18n keys for provider test button and labels"
```

---

### Task 8: TypeScript 类型声明 `src/env.d.ts`

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: 新增 test connection 和 ASR key 的类型声明**

在 `TingMoAPI` 接口中追加：

```typescript
  // Provider connection testing
  testAsrConnection: (provider: string, apiKey: string, endpoint: string) => Promise<{ ok: boolean; error?: string }>;
  testLlmConnection: (provider: string, apiKey: string, model: string, baseUrl: string) => Promise<{ ok: boolean; error?: string }>;
  // ASR cloud API key (separate from LLM)
  setAsrCloudApiKey: (key: string) => Promise<void>;
  getAsrCloudApiKey: () => Promise<string>;
```

同时更新 `saveLlmSettings` 签名：
```typescript
  saveLlmSettings: (settings: {
    refineEnabled?: boolean; llmProvider?: string; llmModel?: string;
    llmBaseUrl?: string; llmApiKey?: string; asrProvider?: string;
    asrCloudProvider?: string; asrCloudApiKey?: string;
  }) => Promise<void>;
```

- [ ] **Step 2: Commit**

```bash
git add src/env.d.ts
git commit -m "feat: add IPC type declarations for provider testing"
```

---

### Task 9: Preload IPC 桥接 `electron/preload.ts`

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: 新增测试连接和 ASR Key 的 IPC 方法**

在 `api` 对象末尾（`installUpdate` 之后）追加：

```typescript
  // Provider connection testing
  testAsrConnection: (provider: string, apiKey: string, endpoint: string) =>
    ipcRenderer.invoke('asr:test-connection', provider, apiKey, endpoint) as Promise<{ ok: boolean; error?: string }>,
  testLlmConnection: (provider: string, apiKey: string, model: string, baseUrl: string) =>
    ipcRenderer.invoke('llm:test-connection', provider, apiKey, model, baseUrl) as Promise<{ ok: boolean; error?: string }>,

  // ASR cloud API key (separate from LLM key)
  setAsrCloudApiKey: (key: string) => ipcRenderer.invoke('settings:set-asr-cloud-api-key', key),
  getAsrCloudApiKey: () => ipcRenderer.invoke('settings:get-asr-cloud-api-key') as Promise<string>,
```

同时更新 `saveLlmSettings` 的类型签名以支持新字段：

```typescript
  saveLlmSettings: (settings: {
    refineEnabled?: boolean; llmProvider?: string; llmModel?: string;
    llmBaseUrl?: string; llmApiKey?: string; asrProvider?: string;
    asrCloudProvider?: string; asrCloudApiKey?: string;
  }) => ipcRenderer.invoke('settings:save-llm-settings', settings),
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "feat: add provider test and ASR key IPC methods to preload"
```

---

### Task 10: Main Process 改造 `electron/main.ts`

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 在文件顶部新增 import**

在 `import { SherpaASRProvider } from '../src/services/funasr-sherpa';` 之后追加：

```typescript
import { getLLMProvider, getASRCloudProvider } from '../src/services/llm-providers';
```

- [ ] **Step 2: 重写 `initRecognition()` cloud 分支（约 line 131-163）**

将原 cloud 分支（约 20 行）替换为多 Provider 选择逻辑：

```typescript
if (provider === 'cloud') {
  let asrCloudProviderKey = 'openai';
  try {
    const settingsPath = join(app.getPath('userData'), 'data', 'llm-settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      asrCloudProviderKey = settings.asrCloudProvider || 'openai';
    }
  } catch { /* use default */ }

  let asrApiKey = '';
  try {
    const asrKeyPath = join(app.getPath('userData'), 'data', 'asr-apikey.enc');
    if (fs.existsSync(asrKeyPath)) {
      try {
        const encrypted = fs.readFileSync(asrKeyPath);
        asrApiKey = safeStorage.decryptString(encrypted);
      } catch { /* not decryptable */ }
    }
  } catch { /* ignore */ }

  const preset = getASRCloudProvider(asrCloudProviderKey);
  const asrEndpoint = preset?.endpoint || 'https://api.openai.com/v1';

  if (!asrApiKey) {
    console.log('[Main] Cloud ASR selected but no ASR API key configured');
    recognitionReady = false;
    sendToRenderer('voice:refine-failed', {
      error: 'Cloud ASR: please configure an API key for ASR in Settings -> Model.',
    });
  } else if (asrCloudProviderKey === 'openai') {
    const { FunASRCloudProvider } = require('../src/services/funasr-cloud');
    recognitionProvider = new FunASRCloudProvider(asrApiKey, asrEndpoint, 'whisper-1');
    recognitionReady = await recognitionProvider.initialize();
    console.log('[Main] Recognition ready (cloud:openai):', recognitionReady);
  } else if (asrCloudProviderKey === 'volcano') {
    const { VolcanoASRProvider } = require('../src/services/asr-volcano');
    recognitionProvider = new VolcanoASRProvider(asrApiKey);
    recognitionReady = await recognitionProvider.initialize();
    console.log('[Main] Recognition ready (cloud:volcano):', recognitionReady);
  } else if (asrCloudProviderKey === 'aliyun') {
    const { AliyunASRProvider } = require('../src/services/asr-aliyun');
    recognitionProvider = new AliyunASRProvider(asrApiKey);
    recognitionReady = await recognitionProvider.initialize();
    console.log('[Main] Recognition ready (cloud:aliyun):', recognitionReady);
  }
}
```

- [ ] **Step 3: 重写 `initRefinement()` 支持多 LLM Provider（约 line 200-241）**

```typescript
async function initRefinement(): Promise<void> {
  try {
    const { safeStorage } = require('electron');
    const fs = require('fs');
    const apiKeyPath = join(app.getPath('userData'), 'data', 'apikey.enc');

    let apiKey = '';
    if (fs.existsSync(apiKeyPath)) {
      try {
        const encrypted = fs.readFileSync(apiKeyPath);
        apiKey = safeStorage.decryptString(encrypted);
      } catch { /* key not decryptable */ }
    }

    const settingsPath = join(app.getPath('userData'), 'data', 'llm-settings.json');
    let llmProviderKey = 'openai';
    let model = 'gpt-4o-mini';
    let baseUrl = 'https://api.openai.com/v1';
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        llmProviderKey = settings.llmProvider || 'openai';
        model = settings.llmModel || model;
        baseUrl = settings.llmBaseUrl || baseUrl;
      } catch { /* ignore */ }
    }

    const preset = getLLMProvider(llmProviderKey);
    if (preset && !model) model = preset.defaultModel;
    if (preset && !baseUrl) baseUrl = preset.baseUrl;

    const needsKey = !preset || preset.authType !== 'none';
    if (needsKey && !apiKey) {
      refinementProvider = null;
      refinementReady = false;
      return;
    }

    if (llmProviderKey === 'gemini') {
      const { GeminiProvider } = require('../src/services/llm-gemini');
      refinementProvider = new GeminiProvider({ apiKey, model, baseUrl });
    } else {
      const { OpenAIProvider } = require('../src/services/llm-openai');
      refinementProvider = new OpenAIProvider({ apiKey, model, baseUrl });
    }

    refinementReady = true;
    console.log('[Main] LLM ready:', llmProviderKey, model);
  } catch (err: any) {
    console.error('[Main] Failed to init LLM:', err.message);
    refinementProvider = null;
    refinementReady = false;
  }
}
```

- [ ] **Step 4: 新增 3 个 IPC handler（在 `ipcMain.handle` 注册区域末尾追加）**

```typescript
// --- Provider connection testing ---

ipcMain.handle('asr:test-connection', async (_event, provider: string, apiKey: string, endpoint: string) => {
  const { testAsrConnection } = require('../src/services/connection-test');
  return testAsrConnection(provider, apiKey, endpoint);
});

ipcMain.handle('llm:test-connection', async (_event, provider: string, apiKey: string, model: string, baseUrl: string) => {
  const { testLlmConnection } = require('../src/services/connection-test');
  return testLlmConnection(provider, apiKey, model, baseUrl);
});

// --- ASR cloud API key (separate from LLM key) ---

ipcMain.handle('settings:set-asr-cloud-api-key', async (_event, key: string) => {
  try {
    const fs = require('fs');
    const { safeStorage } = require('electron');
    const dir = join(app.getPath('userData'), 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const encrypted = safeStorage.encryptString(key);
    fs.writeFileSync(join(dir, 'asr-apikey.enc'), encrypted);
    return true;
  } catch (err: any) {
    console.error('[Main] Failed to save ASR cloud API key:', err.message);
    return false;
  }
});

ipcMain.handle('settings:get-asr-cloud-api-key', async () => {
  try {
    const fs = require('fs');
    const { safeStorage } = require('electron');
    const keyPath = join(app.getPath('userData'), 'data', 'asr-apikey.enc');
    if (fs.existsSync(keyPath)) {
      const encrypted = fs.readFileSync(keyPath);
      return safeStorage.decryptString(encrypted);
    }
    return '';
  } catch {
    return '';
  }
});
```

- [ ] **Step 5: 修改 `settings:save-llm-settings` handler 支持新字段**

找到现有的 `ipcMain.handle('settings:save-llm-settings', ...)` handler，在 `settingsJson` 对象中增加新字段的读写：
```typescript
// 从 settings 参数中读取:
llmProvider: settings.llmProvider,
asrCloudProvider: settings.asrCloudProvider,
```

- [ ] **Step 6: Verify esbuild**

```bash
npm run build:main 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add electron/main.ts
git commit -m "feat: multi-provider ASR/LLM selection in main process with test IPC handlers"
```

---

### Task 11: Settings UI 改造 `src/components/Settings/SettingsWindow.tsx`

**Files:**
- Modify: `src/components/Settings/SettingsWindow.tsx`

- [ ] **Step 1: 新增 import**

```typescript
import { useState, useCallback } from 'react';
import { LLM_PROVIDERS, ASR_CLOUD_PROVIDERS, getLLMModels } from '../../services/llm-providers';
```

- [ ] **Step 2: 新增测试状态和回调**

组件内新增：
```typescript
const [asrTesting, setAsrTesting] = useState(false);
const [asrTestResult, setAsrTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
const [asrTestError, setAsrTestError] = useState('');
const [llmTesting, setLlmTesting] = useState(false);
const [llmTestResult, setLlmTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
const [llmTestError, setLlmTestError] = useState('');
```

从 store 解构新字段：
```typescript
const {
  // ... existing ...
  asrCloudProvider, setAsrCloudProvider,
  asrCloudApiKey, setAsrCloudApiKey,
  llmProvider, setLlmProvider,
} = useSettingsStore();
```

新增 useEffect 持久化 ASR key：
```typescript
useEffect(() => {
  window.tingmo?.setAsrCloudApiKey(asrCloudApiKey);
}, [asrCloudApiKey]);
```

更新 saveLlmSettings useEffect，加入新字段：
```typescript
useEffect(() => {
  window.tingmo?.saveLlmSettings({
    refineEnabled, llmProvider, llmModel, llmBaseUrl, asrProvider, asrCloudProvider,
  });
  window.tingmo?.initRefinement();
}, [refineEnabled, llmProvider, llmModel, llmBaseUrl, asrProvider, asrCloudProvider]);
```

测试回调：
```typescript
const handleTestAsr = useCallback(async () => {
  setAsrTesting(true);
  setAsrTestResult('idle');
  await window.tingmo?.setAsrCloudApiKey(asrCloudApiKey);
  const preset = ASR_CLOUD_PROVIDERS.find((p) => p.key === asrCloudProvider);
  const result = await window.tingmo?.testAsrConnection(asrCloudProvider, asrCloudApiKey, preset?.endpoint || '');
  setAsrTesting(false);
  if (result?.ok) { setAsrTestResult('ok'); }
  else { setAsrTestResult('fail'); setAsrTestError(result?.error || t('test.failed')); }
}, [asrCloudProvider, asrCloudApiKey, t]);

const handleTestLlm = useCallback(async () => {
  setLlmTesting(true);
  setLlmTestResult('idle');
  await window.tingmo?.setApiKey(llmApiKey);
  const result = await window.tingmo?.testLlmConnection(llmProvider, llmApiKey, llmModel, llmBaseUrl);
  setLlmTesting(false);
  if (result?.ok) { setLlmTestResult('ok'); }
  else { setLlmTestResult('fail'); setLlmTestError(result?.error || t('test.failed')); }
}, [llmProvider, llmApiKey, llmModel, llmBaseUrl, t]);
```

- [ ] **Step 3: 重写 Model 标签页 JSX**

ASR 部分（替换现有的 `{activeTab === 'model' &&` 块中的 ASR section）：
```tsx
{asrProvider === 'cloud' && (
  <>
    <div className="nb-hr" />
    <div className="nb-row">
      <span className="nb-label">{t('provider.asrService')}</span>
      <NbSelect
        value={asrCloudProvider}
        options={ASR_CLOUD_PROVIDERS.map((p) => ({
          value: p.key, label: p.name,
          icon: <span className="nb-provider-icon" style={{ background: p.color }}>{p.initial}</span>,
        }))}
        onChange={(v) => { setAsrCloudProvider(v); setAsrTestResult('idle'); }}
      />
    </div>
    <div className="nb-hr" />
    <div className="nb-row">
      <span className="nb-label">{t('model.asrCloudApiKey')}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <input className="nb-input" type="password" value={asrCloudApiKey}
          onChange={(e) => { setAsrCloudApiKey(e.target.value); setAsrTestResult('idle'); }}
          placeholder={t('model.asrCloudApiKeyPlaceholder')} style={{ flex: 1 }} />
        <button
          className={`nb-btn nb-btn-test ${asrTesting ? 'nb-btn-test-loading' : ''} ${asrTestResult === 'ok' ? 'nb-btn-test-ok' : ''} ${asrTestResult === 'fail' ? 'nb-btn-test-fail' : ''}`}
          onClick={handleTestAsr} disabled={asrTesting || !asrCloudApiKey}
        >
          {asrTesting ? t('test.testing') : asrTestResult === 'ok' ? '✓' : asrTestResult === 'fail' ? '✗' : t('test.button')}
        </button>
      </div>
    </div>
    {asrTestResult === 'fail' && (
      <>
        <div className="nb-hr" />
        <div className="nb-row"><span className="nb-label" /><span className="nb-value" style={{ color: '#e00', fontSize: 12 }}>{asrTestError}</span></div>
      </>
    )}
  </>
)}
```

LLM 部分（替换现有的 `{refineEnabled &&` 块）：
```tsx
{refineEnabled && (
  <>
    <div className="nb-hr" />
    <div className="nb-row">
      <span className="nb-label">{t('provider.llmService')}</span>
      <NbSelect
        value={llmProvider}
        options={LLM_PROVIDERS.map((p) => ({
          value: p.key, label: p.name,
          icon: <span className="nb-provider-icon" style={{ background: p.color }}>{p.initial}</span>,
        }))}
        onChange={(v) => { setLlmProvider(v); setLlmTestResult('idle'); }}
      />
    </div>
    <div className="nb-hr" />
    {LLM_PROVIDERS.find((p) => p.key === llmProvider)?.authType !== 'none' && (
      <>
        <div className="nb-row">
          <span className="nb-label">{t('settings.apiKey')}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <input className="nb-input" type="password" value={llmApiKey}
              onChange={(e) => { setLlmApiKey(e.target.value); setLlmTestResult('idle'); }}
              placeholder={t('settings.apiKeyPlaceholder')} style={{ flex: 1 }} />
            <button
              className={`nb-btn nb-btn-test ${llmTesting ? 'nb-btn-test-loading' : ''} ${llmTestResult === 'ok' ? 'nb-btn-test-ok' : ''} ${llmTestResult === 'fail' ? 'nb-btn-test-fail' : ''}`}
              onClick={handleTestLlm} disabled={llmTesting || !llmApiKey}
            >
              {llmTesting ? t('test.testing') : llmTestResult === 'ok' ? '✓' : llmTestResult === 'fail' ? '✗' : t('test.button')}
            </button>
          </div>
        </div>
        {llmTestResult === 'fail' && (
          <>
            <div className="nb-hr" />
            <div className="nb-row"><span className="nb-label" /><span className="nb-value" style={{ color: '#e00', fontSize: 12 }}>{llmTestError}</span></div>
          </>
        )}
        <div className="nb-hr" />
      </>
    )}
    <div className="nb-row">
      <span className="nb-label">{t('settings.model')}</span>
      <NbSelect value={llmModel}
        options={getLLMModels(llmProvider).map((m) => ({ value: m, label: m }))}
        onChange={(v) => setLlmModel(v)} />
    </div>
    <div className="nb-hr" />
    <div className="nb-row">
      <span className="nb-label">{t('settings.apiEndpoint')}</span>
      <input className="nb-input" type="text" value={llmBaseUrl}
        onChange={(e) => setLlmBaseUrl(e.target.value)}
        placeholder={t('settings.apiEndpointPlaceholder')} />
    </div>
  </>
)}
```

同时删除文件顶部已不再需要的 `LLM_MODELS` 和 `LLM_LABELS` 常量。

- [ ] **Step 2: Commit**

```bash
git add src/components/Settings/SettingsWindow.tsx
git commit -m "feat: add provider dropdowns and test buttons to Settings UI"
```

---

### Task 12: 测试按钮样式 `src/styles/global.css`

**Files:**
- Modify: `src/styles/global.css`

- [ ] **Step 1: 追加测试按钮和 Provider icon 样式**

```css
/* Provider icon in dropdown */
.nb-provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  color: #fff;
  font-size: 7px;
  font-weight: 700;
  font-family: system-ui, sans-serif;
  line-height: 1;
  flex-shrink: 0;
}

/* Test button base */
.nb-btn-test {
  min-width: 48px;
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
  border-radius: 4px;
  border: 1.5px solid #d0d0d0;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.nb-btn-test:hover { border-color: #FF5A1F; color: #FF5A1F; }
.nb-btn-test:disabled { opacity: 0.5; cursor: not-allowed; }

/* Test button states */
.nb-btn-test-loading { border-color: #FF5A1F; color: #FF5A1F; }
.nb-btn-test-ok { border-color: #16a34a; color: #16a34a; background: #f0fdf4; }
.nb-btn-test-fail { border-color: #e00; color: #e00; background: #fef2f2; }
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat: add test button and provider icon styles"
```

---

### Task 13: 最终验证 & 构建

- [ ] **Step 1: TypeScript 编译检查**

```bash
npx tsc --noEmit --skipLibCheck 2>&1
```

修复所有类型错误。

- [ ] **Step 2: 主进程构建**

```bash
npm run build:main 2>&1
```

确保 esbuild 通过。

- [ ] **Step 3: 最终提交**

```bash
git add -A && git commit -m "feat: complete external API integration with 3 ASR + 8 LLM providers"
```

---

## 实施顺序

```
Task 1 (llm-providers.ts)       ← 先建注册表
Task 2 (connection-test.ts)     } 可
Task 3 (asr-volcano.ts)         } 并
Task 4 (asr-aliyun.ts)          } 行
Task 5 (llm-gemini.ts)          }
Task 6 (settings.ts)            ← 依赖 Task 1
Task 7 (translations.ts)        ← 独立
Task 8 (env.d.ts)               ← 独立
Task 9 (preload.ts)             ← 依赖 Task 8
Task 10 (main.ts)               ← 依赖 Task 1-5
Task 11 (SettingsWindow.tsx)    ← 依赖 Task 1,6,7
Task 12 (global.css)            ← 独立
Task 13 (verify)                ← 最后
```
