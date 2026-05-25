// AliyunASRProvider — 阿里云百炼 DashScope FunASR (Bearer API Key)
import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';

const ENDPOINT = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

export class AliyunASRProvider implements IRecognitionProvider {
  readonly name = 'Aliyun FunASR';
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  constructor(private apiKey: string, private model: string = 'fun-asr-realtime') {}

  async initialize(): Promise<boolean> {
    if (!this.apiKey) {
      this.isReady = false;
      return false;
    }
    this.isReady = true;
    console.log('[Aliyun FunASR] Ready');
    return true;
  }

  async transcribe(audioBuffer: Buffer, sampleRate: number, _lang?: string): Promise<RecognitionResult> {
    const t0 = performance.now();

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);

      const body = JSON.stringify({
        model: this.model,
        input: {
          messages: [{
            role: 'user',
            content: [{ audio: `data:audio/wav;base64,${audioBuffer.toString('base64')}` }],
          }],
        },
        parameters: {
          format: 'wav',
          sample_rate: sampleRate || 16000,
        },
      });

      console.log('[Aliyun FunASR] Sending request, body size:', body.length);

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'X-DashScope-SSE': 'disable',
        },
        body,
        signal: ctrl.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('[Aliyun FunASR] API error response:', errText.slice(0, 500));
        throw new Error(`DashScope ASR ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await res.json();
      console.log('[Aliyun FunASR] Full response:', JSON.stringify(json).slice(0, 500));

      let text = '';
      // Try multiple response formats
      if (json?.output?.choices?.[0]?.message?.content?.[0]?.text) {
        text = json.output.choices[0].message.content[0].text.trim();
      } else if (json?.output?.text) {
        text = json.output.text.trim();
      } else if (json?.text) {
        text = json.text.trim();
      } else if (json?.result) {
        text = json.result.trim();
      }

      console.log('[Aliyun FunASR] Result text:', text.slice(0, 120));

      return {
        text,
        durationMs: performance.now() - t0,
        language: 'zh',
      };
    } catch (err: any) {
      console.error('[Aliyun FunASR] Transcription failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    this.isReady = false;
  }
}
