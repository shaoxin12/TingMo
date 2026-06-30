import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import WebSocket from 'ws';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
const RESOURCE_ID = 'volc.seedasr.sauc.duration'; // 豆包流式2.0 小时版

// Header byte encoding (4 bytes packed as bit fields)
// Byte0: [version(4) | header_size(4)] → 0x11
// Byte1: [msg_type(4) | msg_flags(4)]
// Byte2: [serialization(4) | compression(4)]
// Byte3: reserved

const HDR = 0x11; // version=1, header_size=4

// Message types (4 bits)
const MT_FULL_REQUEST  = 0x1; // Full client request
const MT_AUDIO_ONLY    = 0x2; // Audio only request
const MT_SERVER_RESP   = 0x9; // Full server response
const MT_ERROR         = 0xF; // Server error

// Serialization (4 bits)
const SER_NONE = 0x0;
const SER_JSON = 0x1;

// Compression (4 bits)
const CMP_NONE = 0x0;
const CMP_GZIP = 0x1;

function header(msgType: number, flags: number, ser: number, cmp: number): Buffer {
  return Buffer.from([HDR, (msgType << 4) | flags, (ser << 4) | cmp, 0x00]);
}

function buildFrame(msgType: number, flags: number, ser: number, cmp: number, payload: Buffer): Buffer {
  const hdr = header(msgType, flags, ser, cmp);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  return Buffer.concat([hdr, size, payload]);
}

export class VolcanoASRProvider implements IRecognitionProvider {
  get name() { return `Volcano (${this.model})`; }
  readonly type = 'api' as const;
  readonly vadEnabled = false;
  isReady = false;

  // ── Streaming state ──────────────────────────────────
  private _streamWs: WebSocket | null = null;
  private _streamReady: boolean = false;
  private _streamReadyResolve: (() => void) | null = null;
  private _streamText: string = '';
  private _streamResolve: ((text: string) => void) | null = null;
  private _streamReject: ((err: Error) => void) | null = null;
  private _streamTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private apiKey: string, private model: string = 'bigmodel') {}

  async initialize(): Promise<boolean> {
    if (!this.apiKey) { this.isReady = false; return false; }
    this.isReady = true;
    console.log('[Volcano ASR] Ready');
    return true;
  }

  // ── Streaming mode ───────────────────────────────────
  async startStream(sampleRate: number, lang: string): Promise<void> {
    // Clean up any previous stream first (guard against concurrent calls)
    if (this._streamWs) {
      this._cleanupStream();
    }

    const volcLang = lang && lang !== 'auto' ? (lang === 'en' ? 'en-US' : 'zh-CN') : 'zh-CN';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        try { this._streamWs?.close(); } catch { /* ignore */ }
        reject(new Error('Volcano stream start timeout (15s)'));
      }, 15000);

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-Key': this.apiKey,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Request-Id': crypto.randomUUID(),
          'X-Api-Connect-Id': crypto.randomUUID(),
          'X-Api-Sequence': '-1',
        },
      });

      ws.on('open', () => {
        console.log('[Volcano Stream] WS connected, sending config');
        const reqJson = JSON.stringify({
          user: { uid: 'tingmo' },
          audio: {
            format: 'pcm',
            rate: sampleRate || 16000,
            bits: 16,
            channel: 1,
            language: volcLang,
          },
          request: {
            model_name: this.model,
            enable_itn: true,
            enable_punc: true,
            result_type: 'single',
          },
        });
        const frame = buildFrame(MT_FULL_REQUEST, 0, SER_JSON, CMP_NONE, Buffer.from(reqJson, 'utf-8'));
        ws.send(frame);
      });

      ws.on('message', (raw: Buffer) => {
        try {
          if (raw.length < 8) return;
          const msgType = (raw[1] >> 4) & 0xF;

          let offset = 4;
          if (msgType === MT_SERVER_RESP) {
            offset += 4;
          } else if (msgType === MT_ERROR) {
            const errCode = raw.readUInt32BE(offset + 4);
            const errSize = raw.readUInt32BE(offset + 8);
            const errMsg = raw.subarray(offset + 12, offset + 12 + errSize).toString('utf-8');
            console.error('[Volcano Stream] Server error:', errCode, errMsg);
            clearTimeout(timeout);
            this._cleanupStream();
            reject(new Error(`Volcano server error ${errCode}: ${errMsg}`));
            return;
          }

          const payloadSize = raw.readUInt32BE(offset);
          offset += 4;
          if (offset + payloadSize > raw.length) return;

          let payload = raw.subarray(offset, offset + payloadSize);
          const compression = raw[2] & 0xF;
          if (compression === CMP_GZIP) {
            try { payload = require('zlib').gunzipSync(payload); } catch { /* keep raw */ }
          }
          if ((raw[2] >> 4) & 0xF) {
            try {
              const json = JSON.parse(payload.toString('utf-8'));
              const text = json.result?.text || '';
              // Keep longest text — server may send incremental results per chunk,
              // and with `result_type: 'single'` each one overwrites the previous.
              // longest = safest against both incremental and cumulative response modes.
              if (text.length > this._streamText.length) this._streamText = text;

              if (!this._streamReady) {
                this._streamReady = true;
                clearTimeout(timeout);
                // Resolve startStream promise — caller can now send audio
                resolve();
              }

              // If endStream is waiting, resolve immediately on final result.
              // Don't wait for WS close — server may keep connection alive.
              if (this._streamResolve && text) {
                if (this._streamTimer) clearTimeout(this._streamTimer);
                this._streamResolve(this._streamText.trim());
                this._cleanupStream();
                return;
              }
            } catch { /* non-JSON payload */ }
          }
        } catch (err: any) {
          console.error('[Volcano Stream] Parse error:', err.message);
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        if (this._streamReject) {
          this._streamReject(new Error(`Volcano stream: ${err.message}`));
          this._streamReject = null;
        }
        this._cleanupStream();
        reject(new Error(`Volcano stream: ${err.message}`));
      });

      ws.on('close', (code: number) => {
        console.log('[Volcano Stream] WS closed, code:', code, 'text:', this._streamText.slice(0, 80));
        clearTimeout(timeout);
        if (this._streamResolve) {
          this._streamResolve(this._streamText.trim());
        }
        this._cleanupStream();
      });

      this._streamWs = ws;
      this._streamReady = false;
      this._streamText = '';
    });
  }

  sendStreamChunk(pcm: Buffer): void {
    if (!this._streamWs || this._streamWs.readyState !== WebSocket.OPEN || !this._streamReady) return;
    // Strip WAV header if present (44 bytes)
    const rawPcm = pcm.length > 44 ? pcm.subarray(44) : pcm;
    const frame = buildFrame(MT_AUDIO_ONLY, 0x0, SER_NONE, CMP_NONE, rawPcm);
    this._streamWs.send(frame);
  }

  endStream(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this._streamWs || this._streamWs.readyState !== WebSocket.OPEN) {
        this._cleanupStream();
        resolve(this._streamText.trim());
        return;
      }
      this._streamResolve = resolve;
      this._streamReject = reject;

      // Send empty last-packet frame to signal end-of-audio
      const lastFrame = buildFrame(MT_AUDIO_ONLY, 0x2, SER_NONE, CMP_NONE, Buffer.alloc(0));
      this._streamWs.send(lastFrame);
      console.log('[Volcano Stream] Sent audio_end, waiting for final result');

      // Timeout guard — server should respond within seconds after audio_end
      this._streamTimer = setTimeout(() => {
        console.log('[Volcano Stream] Timeout waiting for final result, using accumulated text');
        if (this._streamResolve) {
          this._streamResolve(this._streamText.trim());
        }
        this._cleanupStream();
      }, 8000);
    });
  }

  private _cleanupStream(): void {
    if (this._streamTimer) { clearTimeout(this._streamTimer); this._streamTimer = null; }
    if (this._streamWs) {
      this._streamWs.onmessage = null;
      this._streamWs.onerror = null;
      this._streamWs.onclose = null;
      try { this._streamWs.close(); } catch { /* ignore */ }
      this._streamWs = null;
    }
    this._streamReady = false;
    this._streamReadyResolve = null;
    this._streamResolve = null;
    this._streamReject = null;
  }

  // ── Batch mode (fallback / non-streaming) ─────────────
  async transcribe(audioBuffer: Buffer, sampleRate: number, lang?: string): Promise<RecognitionResult> {
    const volcLang = lang && lang !== 'auto' ? (lang === 'en' ? 'en-US' : 'zh-CN') : 'zh-CN';
    const t0 = performance.now();

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.transcribeOnce(audioBuffer, sampleRate, volcLang, lang, t0);
      } catch (err: any) {
        lastError = err;
        if (attempt === 0) {
          console.log('[Volcano ASR] Attempt 1 failed, retrying:', err.message);
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }
    throw lastError!;
  }

  private transcribeOnce(audioBuffer: Buffer, sampleRate: number, volcLang: string, lang: string | undefined, t0: number): Promise<RecognitionResult> {
    return new Promise((resolve, reject) => {
      let finalText = '';
      const timeout = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Volcano ASR timeout (20s)'));
      }, 20000);

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-Key': this.apiKey,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Request-Id': crypto.randomUUID(),
          'X-Api-Connect-Id': crypto.randomUUID(),
          'X-Api-Sequence': '-1',
        },
      });

      ws.on('open', () => {
        console.log('[Volcano ASR] WS connected');
        const reqJson = JSON.stringify({
          user: { uid: 'tingmo' },
          audio: {
            format: 'pcm',
            rate: sampleRate || 16000,
            bits: 16,
            channel: 1,
            language: volcLang,
          },
          request: {
            model_name: this.model,
            enable_itn: true,
            enable_punc: true,
            result_type: 'single',
          },
        });
        const frame = buildFrame(MT_FULL_REQUEST, 0, SER_JSON, CMP_NONE, Buffer.from(reqJson, 'utf-8'));
        ws.send(frame);
      });

      let serverReady = false;

      ws.on('message', (raw: Buffer) => {
        try {
          if (raw.length < 8) return;

          const msgType = (raw[1] >> 4) & 0xF;

          let offset = 4;
          if (msgType === MT_SERVER_RESP) {
            offset += 4;
          } else if (msgType === MT_ERROR) {
            const errCode = raw.readUInt32BE(offset + 4);
            const errSize = raw.readUInt32BE(offset + 8);
            const errMsg = raw.subarray(offset + 12, offset + 12 + errSize).toString('utf-8');
            console.error('[Volcano ASR] Server error:', errCode, errMsg);
            clearTimeout(timeout);
            reject(new Error(`Volcano server error ${errCode}: ${errMsg}`));
            return;
          }

          const payloadSize = raw.readUInt32BE(offset);
          offset += 4;
          if (offset + payloadSize > raw.length) return;

          let payload = raw.subarray(offset, offset + payloadSize);
          const compression = raw[2] & 0xF;
          if (compression === CMP_GZIP) {
            try { payload = require('zlib').gunzipSync(payload); } catch { /* keep raw */ }
          }
          if ((raw[2] >> 4) & 0xF) {
            try {
              const json = JSON.parse(payload.toString('utf-8'));
              const text = json.result?.text || '';
              if (text) finalText = text;

              if (!serverReady) {
                serverReady = true;
                sendAudio(ws, audioBuffer);
              }
            } catch { /* non-JSON payload */ }
          }
        } catch (err: any) {
          console.error('[Volcano ASR] Parse error:', err.message);
        }
      });

      ws.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(new Error(`Volcano ASR: ${err.message}`));
      });

      ws.on('close', (code: number) => {
        clearTimeout(timeout);
        console.log('[Volcano ASR] WS closed, code:', code, 'text:', finalText.slice(0, 80));
        if (code !== 1000 && !finalText) {
          reject(new Error(`Volcano ASR connection closed with code ${code} — possible auth failure`));
        } else {
          resolve({
            text: finalText.trim(),
            durationMs: performance.now() - t0,
            language: lang || 'zh',
          });
        }
      });

      ws.on('unexpected-response', (_req: any, res: any) => {
        clearTimeout(timeout);
        reject(new Error(`Volcano ASR auth failed: HTTP ${res.statusCode} ${res.statusMessage || ''}`));
      });
    });
  }

  async dispose(): Promise<void> {
    this._cleanupStream();
    this.isReady = false;
  }
}

async function sendAudio(ws: WebSocket, audioBuffer: Buffer) {
  const pcm = audioBuffer.length > 44 ? audioBuffer.subarray(44) : audioBuffer;
  const CHUNK = 6400; // 200ms @ 16kHz 16bit mono

  for (let offset = 0; offset < pcm.length; offset += CHUNK) {
    const chunk = pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length));
    const frame = buildFrame(MT_AUDIO_ONLY, 0x0, SER_NONE, CMP_NONE, chunk);
    ws.send(frame);
    // Yield to allow send buffer to drain, preventing backpressure overflow
    if (ws.bufferedAmount > 65536) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  // Send empty last-packet frame to signal end-of-audio
  const lastFrame = buildFrame(MT_AUDIO_ONLY, 0x2, SER_NONE, CMP_NONE, Buffer.alloc(0));
  ws.send(lastFrame);
  console.log('[Volcano ASR] Sent', pcm.length, 'bytes PCM + audio_end');
}
