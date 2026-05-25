import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import WebSocket from 'ws';

const WS_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_nostream';
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
    const connectId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL, {
        headers: {
          'X-Api-Key': this.apiKey,
          'X-Api-Resource-Id': RESOURCE_ID,
          'X-Api-Request-Id': crypto.randomUUID(),
          'X-Api-Connect-Id': connectId,
        },
      });

      let fullResult = '';
      const timeout = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('Volcano ASR timeout (20s)'));
      }, 20000);

      ws.on('open', () => {
        console.log('[Volcano ASR] WS connected, sending audio:', audioBuffer.length, 'bytes');
        // Send full client request header
        const header = buildWsHeader();
        ws.send(header);

        // Send audio-only request
        const audioOnly = buildAudioOnlyReq();
        ws.send(audioOnly);

        // Send audio data in chunks (32KB each)
        const CHUNK = 32768;
        for (let offset = 0; offset < audioBuffer.length; offset += CHUNK) {
          const chunk = audioBuffer.subarray(offset, offset + CHUNK);
          ws.send(buildAudioChunk(chunk));
        }

        // Send end-of-audio
        ws.send(buildAudioEnd());
      });

      ws.on('message', (data: Buffer) => {
        const response = parseResponse(data);
        console.log('[Volcano ASR] WS message:', JSON.stringify(response).slice(0, 300));
        if (response.type === 'final_result') {
          fullResult = response.text || '';
        }
        if (response.type === 'speech_end') {
          clearTimeout(timeout);
          ws.close();
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error('[Volcano ASR] WS error:', err.message);
        reject(new Error(`Volcano ASR WS error: ${err.message}`));
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        console.log('[Volcano ASR] WS closed. Result:', fullResult.slice(0, 80));
        resolve({
          text: fullResult.trim(),
          durationMs: performance.now() - t0,
          language: 'zh',
        });
      });
    });
  }

  async dispose(): Promise<void> { this.isReady = false; }
}

// ── Volcano WebSocket protocol helpers ─────────────────────

function buildWsHeader(): Buffer {
  const req = JSON.stringify({
    user: { uid: 'tingmo-user' },
    audio: {
      format: 'wav',
      rate: 16000,
      bits: 16,
      channel: 1,
      language: 'zh-CN',
    },
    request: {
      model_name: 'bigmodel',
      enable_itn: true,
      enable_punctuation: true,
      enable_speaker_info: false,
      result_type: 'single',
    },
  });
  return encodeWsFrame(req);
}

function buildAudioOnlyReq(): Buffer {
  return encodeWsFrame(JSON.stringify({ audio_only: true }));
}

function buildAudioChunk(data: Buffer): Buffer {
  return encodeWsFrame(data, true);
}

function buildAudioEnd(): Buffer {
  return encodeWsFrame(JSON.stringify({ audio_end: true }));
}

// Volcano WS binary protocol: 4-byte header + payload
// Header: [version(1)][header_size(1)][message_type(1)][flags(1)]
// message_type: 0x10 = full client request (JSON), 0x11 = audio only, 0x12 = audio end
// flags: 0x02 = gzip compressed, 0x00 = uncompressed
function encodeWsFrame(payload: string | Buffer, binary = false): Buffer {
  let buf: Buffer;
  if (typeof payload === 'string') {
    buf = Buffer.from(payload, 'utf-8');
  } else {
    buf = payload;
  }

  const header = Buffer.alloc(4);
  header.writeUInt8(1, 0); // protocol version
  header.writeUInt8(4, 1);  // header size
  if (binary) {
    header.writeUInt8(0x11, 2); // audio only
  } else if (typeof payload === 'string' && payload.includes('audio_end')) {
    header.writeUInt8(0x12, 2); // audio end
  } else {
    header.writeUInt8(0x10, 2); // full client request
  }
  header.writeUInt8(0, 3); // flags (uncompressed)

  const size = Buffer.alloc(4);
  size.writeUInt32BE(buf.length, 0);

  return Buffer.concat([header, size, buf]);
}

interface WsResponse {
  type: string;
  text?: string;
}

function parseResponse(data: Buffer): WsResponse {
  try {
    // Volcano WS binary protocol: 4-byte header + 4-byte size + payload
    // Try parsing as JSON from offset 8 first (skip binary frame header)
    let text: string;
    if (data.length > 8 && data.readUInt8(0) === 1) {
      text = data.subarray(8).toString('utf-8');
    } else {
      text = data.toString('utf-8');
    }
    const json = JSON.parse(text);
    // Try multiple response formats
    const type = json.type || json.payload_msg?.type || json.header?.message || '';
    const resultText =
      json.payload_msg?.result?.[0]?.text ||
      json.result?.text ||
      json.result?.Result?.Text ||
      json.Result?.Text ||
      '';
    return { type, text: resultText };
  } catch {
    // Raw binary — log length
    console.log('[Volcano ASR] Raw binary msg, size:', data.length);
    return { type: 'binary' };
  }
}
