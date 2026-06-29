// AliyunASRProvider — 阿里云百炼 Fun-ASR Realtime (WebSocket)
// Protocol: run-task → task-started → binary PCM → result-generated → finish-task → task-finished
// Docs: https://help.aliyun.com/zh/model-studio/fun-asr-client-events

import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import { parseWAV, splitWavChunks, joinChunkResults } from './audio-chunker';
import WebSocket from 'ws';

// Fun-ASR WebSocket endpoint (NOT /api-ws/v1/realtime — that's Qwen-ASR)
const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';

type StreamState = {
  ws: WebSocket;
  taskId: string;
  text: string;
  resolve: ((text: string) => void) | null;
  reject: ((err: Error) => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
  started: boolean; // task-started received
};

export class AliyunASRProvider implements IRecognitionProvider {
  get name() { return `Aliyun (${this.model})`; }
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  private _stream: StreamState | null = null;

  constructor(private apiKey: string, private model: string = 'fun-asr-realtime') {}

  async initialize(): Promise<boolean> {
    if (!this.apiKey) { this.isReady = false; return false; }
    this.isReady = true;
    console.log('[Aliyun] Ready, model:', this.model);
    return true;
  }

  // ── Streaming mode ──────────────────────────────────────

  async startStream(sampleRate: number, lang: string): Promise<void> {
    const self = this;
    const taskId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { self._stream?.ws.close(); } catch { /* ignore */ }
        reject(new Error('Aliyun stream start timeout (15s)'));
      }, 15000);

      const ws = new WebSocket(WS_URL, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      const st: StreamState = {
        ws, taskId, text: '', resolve: null, reject: null, timer: null, started: false,
      };
      self._stream = st;

      ws.on('open', () => {
        console.log('[Aliyun] WS open, sending run-task, taskId:', taskId);
        ws.send(JSON.stringify({
          header: {
            action: 'run-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'asr',
            function: 'recognition',
            model: self.model,
            parameters: {
              format: 'pcm',
              sample_rate: sampleRate || 16000,
              language_hints: lang && lang !== 'auto' ? [lang] : ['zh'],
              semantic_punctuation_enabled: true,
            },
            input: {},
          },
        }));
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString('utf-8'));
          const event = msg.header?.event || '';

          // Task started — can now send audio
          if (event === 'task-started' && !st.started) {
            st.started = true;
            clearTimeout(timeout);
            console.log('[Aliyun] task-started, ready for audio');
            resolve();
            return;
          }

          // Recognition result
          if (event === 'result-generated') {
            const sentence = msg.payload?.output?.sentence;
            if (sentence && !sentence.heartbeat) {
              if (sentence.sentence_end) {
                // Final result for this sentence — accumulate
                if (sentence.text) {
                  st.text += (st.text ? ' ' : '') + sentence.text;
                  console.log('[Aliyun] Result (final):', sentence.text.slice(0, 80));
                }
              }
            }
            return;
          }

          // Task finished
          if (event === 'task-finished') {
            console.log('[Aliyun] task-finished, total text:', st.text.length, 'chars');
            if (st.resolve) {
              st.resolve(st.text.trim());
              self._cleanupStream();
            }
            return;
          }

          // Task failed
          if (event === 'task-failed') {
            const errMsg = msg.payload?.output?.message || msg.payload?.output?.code || 'unknown';
            console.error('[Aliyun] task-failed:', errMsg);
            if (st.reject) {
              st.reject(new Error('Aliyun task failed: ' + errMsg));
            }
            self._cleanupStream();
            return;
          }
        } catch { /* ignore parse errors */ }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        if (st.reject) st.reject(err);
        else reject(err);
        self._cleanupStream();
      });

      ws.on('close', (code: number) => {
        console.log('[Aliyun] WS closed, code:', code, 'text:', st.text.slice(0, 80));
        clearTimeout(timeout);
        if (st.resolve) {
          st.resolve(st.text.trim());
        } else if (!st.started) {
          reject(new Error(`Aliyun WS closed before task-started (code ${code})`));
        }
        self._cleanupStream();
      });
    });
  }

  sendStreamChunk(pcm: Buffer): void {
    const st = this._stream;
    if (!st || !st.started || st.ws.readyState !== WebSocket.OPEN) return;

    // Strip WAV header → raw PCM → send as binary
    const rawPcm = pcm.length > 44 ? pcm.subarray(44) : pcm;
    st.ws.send(rawPcm);
  }

  endStream(): Promise<string> {
    const st = this._stream;
    if (!st || st.ws.readyState !== WebSocket.OPEN) {
      this._cleanupStream();
      return Promise.resolve(st?.text?.trim() || '');
    }

    return new Promise((resolve, reject) => {
      st.resolve = resolve;
      st.reject = reject;

      console.log('[Aliyun] Sending finish-task');
      st.ws.send(JSON.stringify({
        header: {
          action: 'finish-task',
          task_id: st.taskId,
          streaming: 'duplex',
        },
        payload: { input: {} },
      }));

      st.timer = setTimeout(() => {
        console.log('[Aliyun] Timeout waiting for task-finished, using accumulated text');
        if (st.resolve) {
          st.resolve(st.text.trim());
        }
        this._cleanupStream();
      }, 15000);
    });
  }

  private _cleanupStream(): void {
    const st = this._stream;
    if (!st) return;
    if (st.timer) { clearTimeout(st.timer); st.timer = null; }
    try { st.ws.close(); } catch { /* ignore */ }
    st.resolve = null;
    st.reject = null;
    this._stream = null;
  }

  // ── Batch HTTP (fallback) ─────────────────────────────────

  async transcribe(audioBuffer: Buffer, _sampleRate?: number, _lang?: string): Promise<RecognitionResult> {
    const t0 = performance.now();
    console.log('[Aliyun HTTP] transcribe called, audio size:', audioBuffer.length, 'bytes');

    try {
      const base64 = audioBuffer.toString('base64');
      const dataUrl = `data:audio/wav;base64,${base64}`;
      const httpModel = this.model.includes('realtime') ? 'fun-asr' : this.model;

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);

      const submitRes = await fetch(
        'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'X-DashScope-Async': 'enable',
          },
          body: JSON.stringify({
            model: httpModel,
            input: { file_urls: [dataUrl] },
            parameters: { channel_id: [0], language_hints: ['zh'] },
          }),
          signal: ctrl.signal,
        },
      );

      if (!submitRes.ok) {
        const errText = await submitRes.text().catch(() => '');
        throw new Error(`Aliyun submit ${submitRes.status}: ${errText.slice(0, 200)}`);
      }

      const submitJson: any = await submitRes.json();
      const taskId = submitJson?.output?.task_id;
      if (!taskId) throw new Error('Aliyun did not return task_id');

      let text = '';
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        const pollRes = await fetch(
          `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
          { headers: { 'Authorization': `Bearer ${this.apiKey}` } },
        );
        const pollJson: any = await pollRes.json();
        const status = pollJson?.output?.task_status;
        if (status === 'SUCCEEDED') {
          const transcripts = pollJson?.output?.results?.transcripts;
          if (transcripts?.length > 0) text = transcripts.map((t: any) => t.text || '').join('\n');
          break;
        } else if (status === 'FAILED') {
          throw new Error('Aliyun task failed');
        }
      }

      clearTimeout(timer);
      console.log('[Aliyun HTTP] Final:', text.length, 'chars');
      return { text: text.trim(), durationMs: performance.now() - t0, language: 'zh' };
    } catch (err: any) {
      console.error('[Aliyun HTTP] Failed:', err.message);
      throw err;
    }
  }

  async dispose(): Promise<void> {
    this._cleanupStream();
    this.isReady = false;
  }
}
