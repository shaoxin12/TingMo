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
        // DashScope FunASR: verify the API key via a minimal request
        clearTimeout(timer);
        try {
          const testCtrl = new AbortController();
          const testTimer = setTimeout(() => testCtrl.abort(), 8000);
          const testRes = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
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
            signal: testCtrl.signal,
          });
          clearTimeout(testTimer);
          if (testRes.status === 401 || testRes.status === 403) {
            return { ok: false, error: `密钥无效 (HTTP ${testRes.status})`, status: testRes.status };
          }
          // 400 = bad request params but key is valid; 200 = success
          return { ok: true };
        } catch (err2: any) {
          if (err2.name === 'AbortError') return { ok: false, error: '连接超时，请检查网络' };
          return { ok: false, error: `网络错误: ${err2.message?.slice(0, 100)}` };
        }
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
