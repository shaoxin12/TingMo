// AliyunASRProvider — 阿里云百炼 DashScope FunASR (Bearer API Key)
import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import { parseWAV, splitWavChunks, joinChunkResults } from './audio-chunker';

const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

async function callAPI(apiKey: string, model: string, wavBuf: Buffer, sampleRate: number, index: number): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const body = JSON.stringify({
      model,
      input: {
        messages: [{
          role: 'user',
          content: [
            { text: '请转写以下音频。' },
            { audio: `data:audio/wav;base64,${wavBuf.toString('base64')}` },
          ],
        }],
      },
      parameters: { format: 'wav', sample_rate: sampleRate },
    });

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'X-DashScope-SSE': 'disable',
      },
      body,
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`DashScope ${res.status}: ${errText.slice(0, 200)}`);
    }

    const json: any = await res.json();
    const contents = json?.output?.choices?.[0]?.message?.content;
    let text = '';
    if (Array.isArray(contents)) {
      text = contents.map((c: any) => c.text || '').join('');
    }
    if (!text) text = json?.output?.text || json?.text || json?.result || '';
    console.log('[Aliyun] Chunk', index, ':', text.length, 'chars —', text.slice(0, 50));
    return text.trim();
  } finally {
    clearTimeout(timer);
  }
}

export class AliyunASRProvider implements IRecognitionProvider {
  get name() { return `Aliyun (${this.model})`; }
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  constructor(private apiKey: string, private model: string = 'fun-asr-realtime') {}

  async initialize(): Promise<boolean> {
    if (!this.apiKey) { this.isReady = false; return false; }
    this.isReady = true;
    console.log('[Aliyun] Ready, model:', this.model);
    return true;
  }

  async transcribe(audioBuffer: Buffer, _sampleRate?: number, _lang?: string): Promise<RecognitionResult> {
    const t0 = performance.now();

    try {
      const { sampleRate } = parseWAV(audioBuffer);
      const chunks = splitWavChunks(audioBuffer);

      if (chunks.length === 1) {
        const text = await callAPI(this.apiKey, this.model, audioBuffer, sampleRate, 0);
        console.log('[Aliyun] Final:', text.length, 'chars');
        return { text, durationMs: performance.now() - t0, language: 'zh' };
      }

      console.log('[Aliyun] Split into', chunks.length, 'chunks, sending parallel');
      const apiKey = this.apiKey;
      const model = this.model;
      const results = await Promise.all(
        chunks.map((wav, i) => callAPI(apiKey, model, wav, sampleRate, i + 1)),
      );

      const text = joinChunkResults(results);
      console.log('[Aliyun] Final:', text.length, 'chars —', text.slice(0, 200));
      return { text, durationMs: performance.now() - t0, language: 'zh' };
    } catch (err: any) {
      console.error('[Aliyun] Failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> { this.isReady = false; }
}
