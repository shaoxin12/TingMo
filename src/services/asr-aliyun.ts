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

  async transcribe(audioBuffer: Buffer, _sampleRate: number, _lang?: string): Promise<RecognitionResult> {
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
    if (!json.Token?.Id) {
      throw new Error('Aliyun token response missing Token.Id field');
    }

    this.token = json.Token.Id;
    this.tokenExpiry = Date.now() + (json.Token.ExpireTime || 3600) * 1000 * 0.9;
  }
}
