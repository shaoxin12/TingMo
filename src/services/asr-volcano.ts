import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import WebSocket from 'ws';
import { gunzipSync } from 'zlib';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
const RESOURCE_ID = 'volc.seedasr.auc';

// Volcano binary protocol constants
const MSG_FULL_REQUEST = 0x10;
const MSG_AUDIO_ONLY = 0x11;
const MSG_AUDIO_END = 0x12;
const PROTO_VERSION = 1;
const HEADER_SIZE = 4;

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

  async transcribe(audioBuffer: Buffer, sampleRate: number, _lang?: string): Promise<RecognitionResult> {
    const t0 = performance.now();
    const requestId = crypto.randomUUID();
    const connectId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      let finalText = '';
      let hadError = false;

      const timeout = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        if (!hadError) reject(new Error('Volcano ASR timeout (20s)'));
      }, 20000);

      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-Key': this.apiKey,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Request-Id': requestId,
          'X-Api-Connect-Id': connectId,
        },
      });

      ws.on('open', () => {
        console.log('[Volcano ASR] WS connected');

        // Try text mode first: send FullClientRequest as raw JSON
        const fullReqJson = JSON.stringify({
          user: { uid: 'tingmo' },
          audio: {
            format: 'wav',
            rate: sampleRate || 16000,
            bits: 16,
            channel: 1,
            language: 'zh-CN',
          },
          request: {
            model_name: this.model,
            enable_itn: true,
            enable_punctuation: true,
            result_type: 'single',
          },
        });
        ws.send(fullReqJson); // Send as TEXT, not binary frame
        console.log('[Volcano ASR] Sent FullClientRequest as text');
      });

      let receivedServerReady = false;

      ws.on('message', (raw: Buffer) => {
        try {
          const text = raw.toString('utf-8');
          console.log('[Volcano ASR] Server msg:', text.slice(0, 400));

          let json: any = null;
          try { json = JSON.parse(text); } catch { /* not JSON */ }

          if (json) {
            // Extract text from response
            const resultText =
              json.payload_msg?.result?.[0]?.text ||
              json.result?.text ||
              json.Result?.Text ||
              json.text ||
              '';
            if (resultText) finalText = resultText;

            // Server ready — now send audio
            if (!receivedServerReady) {
              receivedServerReady = true;
              console.log('[Volcano ASR] Server ready, sending audio');
              sendAudioData(ws, audioBuffer);
            }
          }
        } catch (err: any) {
          console.error('[Volcano ASR] Message parse error:', err.message);
        }
      });

      ws.on('error', (err) => {
        hadError = true;
        clearTimeout(timeout);
        console.error('[Volcano ASR] WS error:', err.message);
        reject(new Error(`Volcano ASR: ${err.message}`));
      });

      ws.on('close', (code) => {
        clearTimeout(timeout);
        console.log('[Volcano ASR] WS closed, code:', code, 'text:', finalText.slice(0, 80));
        if (hadError) return;
        resolve({
          text: finalText.trim(),
          durationMs: performance.now() - t0,
          language: 'zh',
        });
      });
    });
  }

  async dispose(): Promise<void> { this.isReady = false; }
}

// ── Audio sending ──────────────────────────────────────────
function sendAudioData(ws: WebSocket, audioBuffer: Buffer) {
  // Skip WAV header (first 44 bytes), send raw PCM as binary frames
  const pcmData = audioBuffer.length > 44 ? audioBuffer.subarray(44) : audioBuffer;

  // Send all PCM data in binary frames (type 0x11 = audio only)
  const CHUNK = 16384;
  for (let offset = 0; offset < pcmData.length; offset += CHUNK) {
    const chunk = pcmData.subarray(offset, Math.min(offset + CHUNK, pcmData.length));
    ws.send(buildFrame(MSG_AUDIO_ONLY, chunk)); // Send as binary frame
  }

  // Send audio end as JSON text
  ws.send(JSON.stringify({ type: 'audio_end' }));
  console.log('[Volcano ASR] Sent audio PCM:', pcmData.length, 'bytes + audio_end');
}

// ── Binary frame protocol ──────────────────────────────────
function buildFrame(type: number, payload: string | Buffer): Buffer {
  const payloadBuf = typeof payload === 'string' ? Buffer.from(payload, 'utf-8') : payload;
  const header = Buffer.alloc(4);
  header.writeUInt8(PROTO_VERSION, 0);
  header.writeUInt8(HEADER_SIZE, 1);
  header.writeUInt8(type, 2);
  header.writeUInt8(0, 3); // flags: uncompressed

  const size = Buffer.alloc(4);
  size.writeUInt32BE(payloadBuf.length, 0);

  return Buffer.concat([header, size, payloadBuf]);
}

// ── Response parsing ───────────────────────────────────────
interface ParsedFrame {
  type: number;
  payload: Buffer;
}

function parseFrames(data: Buffer): ParsedFrame[] {
  const frames: ParsedFrame[] = [];
  let offset = 0;

  while (offset + 8 <= data.length) {
    const version = data.readUInt8(offset);
    if (version !== PROTO_VERSION) {
      // Raw JSON? Try whole buffer
      frames.push({ type: 0x90, payload: data });
      return frames;
    }

    const msgType = data.readUInt8(offset + 2);
    const flags = data.readUInt8(offset + 3);
    const payloadSize = data.readUInt32BE(offset + 4);

    if (offset + 8 + payloadSize > data.length) break;

    let payload = data.subarray(offset + 8, offset + 8 + payloadSize);

    // Decompress if gzip flag
    if (flags & 0x02) {
      try { payload = gunzipSync(payload); } catch { /* keep raw */ }
    }

    frames.push({ type: msgType, payload });
    offset += 8 + payloadSize;
  }

  return frames;
}
