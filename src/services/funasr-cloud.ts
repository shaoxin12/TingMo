import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';

export interface FunASRCloudConfig {
  endpoint: string;        // e.g. http://localhost:10095
  apiKey?: string;         // optional auth token
  timeoutMs?: number;
}

export class FunASRCloudProvider implements IRecognitionProvider {
  readonly name = 'FunASR-Cloud';
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  constructor(private apiKey: string, private baseUrl: string, private model: string = 'whisper-1') {}

  async initialize(): Promise<boolean> {
    if (!this.apiKey || !this.baseUrl) {
      console.log('[FunASR-Cloud] No API key or endpoint configured');
      this.isReady = false;
      return false;
    }
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`${this.baseUrl}/api/status`, {
        method: 'GET',
        signal: ctrl.signal,
      });
      if (res.ok) {
        this.isReady = true;
        console.log('[FunASR-Cloud] Server reachable at', this.baseUrl);
        return true;
      }
    } catch {
      console.log('[FunASR-Cloud] Server unreachable, will try on transcribe');
    }
    this.isReady = true;
    console.log('[FunASR-Cloud] Ready, model:', this.model);
    return true;
  }

  async transcribe(
    audioBuffer: Buffer,
    _sampleRate: number,
    lang?: string,
  ): Promise<RecognitionResult> {
    const t0 = performance.now();

    const baseUrl = this.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/audio/transcriptions`;

    // Build FormData with WAV
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.model);
    formData.append('response_format', 'json');
    // Only set language for known codes; omit for 'auto' to let Whisper auto-detect
    if (lang && lang !== 'auto') {
      formData.append('language', lang);
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Whisper API ${res.status}: ${errText.slice(0, 200)}`);
      }

      const json: any = await res.json();
      const text = json.text?.trim() || '';

      console.log('[FunASR-Cloud] Result:', text.slice(0, 60));

      return {
        text,
        durationMs: performance.now() - t0,
        language: lang || 'zh',
        confidence: undefined,
      };
    } catch (err: any) {
      console.error('[FunASR-Cloud] Transcription failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    this.isReady = false;
  }
}
