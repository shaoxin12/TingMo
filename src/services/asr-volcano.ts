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
        // Send FullClientRequest (type=1, JSON, no compression)
        const reqJson = JSON.stringify({
          user: { uid: 'tingmo' },
          audio: {
            format: 'pcm',
            rate: sampleRate || 16000,
            bits: 16,
            channel: 1,
            language: 'zh-CN',
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
        console.log('[Volcano ASR] Sent FullClientRequest, size:', frame.length);
      });

      let serverReady = false;

      ws.on('message', (raw: Buffer) => {
        try {
          console.log('[Volcano ASR] Raw msg, size:', raw.length, 'hex:', raw.subarray(0, 12).toString('hex'));

          if (raw.length < 8) return;

          const msgType = (raw[1] >> 4) & 0xF;
          const flags = raw[1] & 0xF;
          console.log('[Volcano ASR] msgType:', msgType.toString(16), 'flags:', flags.toString(16));

          let offset = 4; // skip 4-byte header

          // Server response (type 0x9) and error (type 0xF) have a 4-byte sequence/error-code before payload size
          if (msgType === MT_SERVER_RESP) {
            const seq = raw.readUInt32BE(offset);
            offset += 4;
            console.log('[Volcano ASR] Server resp, seq:', seq);
          } else if (msgType === MT_ERROR) {
            const errCode = raw.readUInt32BE(offset);
            offset += 4;
            const errSize = raw.readUInt32BE(offset);
            offset += 4;
            const errMsg = raw.subarray(offset, offset + errSize).toString('utf-8');
            console.error('[Volcano ASR] Server error:', errCode, errMsg);
            return;
          }

          const payloadSize = raw.readUInt32BE(offset);
          offset += 4;
          if (offset + payloadSize > raw.length) return;

          let payload = raw.subarray(offset, offset + payloadSize);
          const compression = (raw[2] >> 4) & 0xF;
          if (compression === CMP_GZIP) {
            try { payload = require('zlib').gunzipSync(payload); } catch { /* keep raw */ }
          }

          const serMethod = raw[2] & 0xF;
          if (serMethod === SER_JSON) {
            try {
              const json = JSON.parse(payload.toString('utf-8'));
              console.log('[Volcano ASR] Server JSON:', JSON.stringify(json).slice(0, 300));
              const text = json.result?.text || '';
              if (text) finalText = text;

              // First response = server ready, now send audio
              if (!serverReady) {
                serverReady = true;
                console.log('[Volcano ASR] Server ready, sending audio');
                sendAudio(ws, audioBuffer);
              }
            } catch {
              console.log('[Volcano ASR] Non-JSON payload');
            }
          }
        } catch (err: any) {
          console.error('[Volcano ASR] Parse error:', err.message);
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Volcano ASR: ${err.message}`));
      });

      ws.on('close', (code) => {
        clearTimeout(timeout);
        console.log('[Volcano ASR] WS closed, code:', code, 'text:', finalText.slice(0, 80));
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

function sendAudio(ws: WebSocket, audioBuffer: Buffer) {
  const pcm = audioBuffer.length > 44 ? audioBuffer.subarray(44) : audioBuffer;
  const CHUNK = 6400; // 200ms @ 16kHz 16bit mono

  for (let offset = 0; offset < pcm.length; offset += CHUNK) {
    const chunk = pcm.subarray(offset, Math.min(offset + CHUNK, pcm.length));
    const frame = buildFrame(MT_AUDIO_ONLY, 0x0, SER_NONE, CMP_NONE, chunk);
    ws.send(frame);
  }

  // Send empty last-packet frame to signal end-of-audio
  const lastFrame = buildFrame(MT_AUDIO_ONLY, 0x2, SER_NONE, CMP_NONE, Buffer.alloc(0));
  ws.send(lastFrame);
  console.log('[Volcano ASR] Sent', pcm.length, 'bytes PCM + audio_end');
}
