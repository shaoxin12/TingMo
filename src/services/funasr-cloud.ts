import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import { splitWavChunks, joinChunkResults } from './audio-chunker';

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
    // Ready immediately — actual connection is tested via connection-test.ts
    this.isReady = true;
    console.log('[FunASR-Cloud] Ready, model:', this.model);
    return true;
  }

  async transcribe(
    audioBuffer: Buffer,
    _sampleRate: number,
    lang?: string,
    signal?: AbortSignal,
  ): Promise<RecognitionResult> {
    const t0 = performance.now();
    const baseUrl = this.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}/audio/transcriptions`;

    const apiKey = this.apiKey;
    const model = this.model;
    const langParam = (lang && lang !== 'auto') ? lang : undefined;

    async function callWhisper(wav: Buffer, index: number): Promise<string> {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(wav)], { type: 'audio/wav' });
      formData.append('file', blob, 'audio.wav');
      formData.append('model', model);
      formData.append('response_format', 'json');
      if (langParam) formData.append('language', langParam);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}` },
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
        console.log('[Whisper] Chunk', index, ':', text.length, 'chars');
        return text;
      } finally {
        clearTimeout(timer);
      }
    }

    try {
      const chunks = splitWavChunks(audioBuffer);

      if (chunks.length === 1) {
        const text = await callWhisper(audioBuffer, 0);
        console.log('[Whisper] Final:', text.length, 'chars');
        return { text, durationMs: performance.now() - t0, language: lang || 'zh' };
      }

      console.log('[Whisper] Split into', chunks.length, 'chunks, sending parallel');
      const settled = await Promise.allSettled(
        chunks.map((wav, i) => callWhisper(wav, i + 1)),
      );
      const results = settled
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value);

      if (results.length === 0) {
        const firstErr = settled.find((r): r is PromiseRejectedResult => r.status === 'rejected');
        throw firstErr?.reason || new Error('All Whisper chunks failed');
      }

      const text = joinChunkResults(results);
      console.log('[Whisper] Final:', text.length, 'chars —', text.slice(0, 120));
      return { text, durationMs: performance.now() - t0, language: lang || 'zh' };
    } catch (err: any) {
      console.error('[Whisper] Transcription failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    this.isReady = false;
  }
}
