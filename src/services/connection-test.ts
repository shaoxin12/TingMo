// Minimal API calls to verify provider connectivity

export interface TestResult {
  ok: boolean;
  error?: string;
  status?: number;
}

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

  // ── OpenAI Whisper ─────────────────────────────────
  if (provider === 'openai') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const formData = new FormData();
      formData.append('file', new Blob([wav], { type: 'audio/wav' }), 'test.wav');
      formData.append('model', 'whisper-1');
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: formData, signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) return { ok: false, error: `密钥无效 (HTTP ${res.status})` };
      return { ok: res.ok };
    } catch (err: any) {
      if (err.name === 'AbortError') return { ok: false, error: '连接超时' };
      return { ok: false, error: err.message?.slice(0, 100) };
    }
  }

  // ── Volcano Engine (豆包语音) ──────────────────────
  if (provider === 'volcano') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(`${endpoint}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Api-Resource-Id': 'volc.seedasr.auc',
          'X-Api-Request-Id': crypto.randomUUID(),
        },
        body: JSON.stringify({
          audio_format: 'wav',
          audio_data: wav.toString('base64'),
          model_name: 'bigmodel',
          language: 'auto',
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) return { ok: false, error: `密钥无效 (HTTP ${res.status})` };
      return { ok: res.ok };
    } catch (err: any) {
      if (err.name === 'AbortError') return { ok: false, error: '连接超时' };
      return { ok: false, error: err.message?.slice(0, 100) };
    }
  }

  // ── Aliyun DashScope ──────────────────────────────
  if (provider === 'aliyun') {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-DashScope-SSE': 'disable',
        },
        body: JSON.stringify({
          model: 'fun-asr-realtime',
          input: { messages: [{ role: 'user', content: [{ text: 'test' }] }] },
          parameters: {},
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 401 || res.status === 403) return { ok: false, error: `密钥无效 (HTTP ${res.status})` };
      // 400 = bad params but key valid, 200 = success — both mean connected
      return { ok: true };
    } catch (err: any) {
      if (err.name === 'AbortError') return { ok: false, error: '连接超时' };
      return { ok: false, error: err.message?.slice(0, 100) };
    }
  }

  return { ok: false, error: '未知的 ASR 服务商' };
}

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
