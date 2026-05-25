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
    if (!this.apiKey) { this.isReady = false; return false; }
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
          'X-Api-Sequence': '-1',
        },
        body: JSON.stringify({
          audio_format: 'wav',
          file_urls: [`data:audio/wav;base64,${wavBase64}`],
          model_name: this.model,
          enable_itn: true,
          enable_punctuation: true,
          language: 'auto',
        }),
        signal: submitCtrl.signal,
      });

      clearTimeout(submitTimer);

      console.log('[Volcano ASR] Submit status:', submitRes.status);
      // Log all response headers
      const headers: Record<string, string> = {};
      submitRes.headers.forEach((v, k) => { headers[k] = v; });
      console.log('[Volcano ASR] Submit headers:', JSON.stringify(headers));

      const bodyText = await submitRes.text();
      console.log('[Volcano ASR] Submit body:', bodyText.slice(0, 500));

      if (!submitRes.ok) {
        throw new Error(`Volcano ASR submit ${submitRes.status}: ${bodyText.slice(0, 200)}`);
      }

      let pollTaskId = '';
      try {
        const submitJson = JSON.parse(bodyText);
        pollTaskId = submitJson.task_id || submitJson.TaskId || submitJson.id || '';
      } catch { /* empty body */ }

      // Fallback: use request ID as task ID
      if (!pollTaskId) pollTaskId = taskId;
      console.log('[Volcano ASR] Submit OK, pollTaskId:', pollTaskId);

      // Check if result already returned synchronously
      if (bodyText.includes('"text"') || bodyText.includes('"result"')) {
        try {
          const json = JSON.parse(bodyText);
          const text = json.result?.text || json.text || '';
          if (text) {
            console.log('[Volcano ASR] Sync result:', text.slice(0, 80));
            return { text: text.trim(), durationMs: performance.now() - t0, language: 'zh' };
          }
        } catch { /* ignore */ }
      }

      // Poll for async result
      for (let i = 0; i < 30; i++) {
        await sleep(1000);

        const pollRes = await fetch(QUERY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': this.apiKey,
            'X-Api-Resource-Id': RESOURCE_ID,
            'X-Api-Request-Id': crypto.randomUUID(),
            'X-Api-Sequence': '-1',
          },
          body: JSON.stringify({ task_id: pollTaskId }),
        });

        if (!pollRes.ok) {
          console.log('[Volcano ASR] Query failed', pollRes.status, (await pollRes.text().catch(() => '')).slice(0, 200));
          continue;
        }

        const pollText = await pollRes.text();
        console.log('[Volcano ASR] Query response:', pollText.slice(0, 300));

        let pollJson: any = {};
        try { pollJson = JSON.parse(pollText); } catch { continue; }

        const status = pollJson.status || pollJson.Status || '';
        if (status === 'completed' || status.toUpperCase() === 'COMPLETED') {
          const text = pollJson.result?.text || pollJson.text || pollJson.Result?.Text || '';
          if (text) {
            console.log('[Volcano ASR] Result:', text.slice(0, 80));
            return { text: text.trim(), durationMs: performance.now() - t0, language: 'zh' };
          }
        }
        if (status === 'failed') {
          throw new Error('Volcano ASR failed: ' + JSON.stringify(pollJson).slice(0, 200));
        }
      }

      throw new Error('Volcano ASR polling timeout (30s)');
    } catch (err: any) {
      console.error('[Volcano ASR] Transcription failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> { this.isReady = false; }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
