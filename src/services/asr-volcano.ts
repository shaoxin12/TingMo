import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';

const SUBMIT_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit';
const QUERY_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/query';
const RESOURCE_ID = 'volc.seedasr.auc';

export class VolcanoASRProvider implements IRecognitionProvider {
  readonly name = 'Volcano ASR';
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  constructor(private apiKey: string, private model: string = 'bigmodel') {}

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
          model_name: this.model,
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
