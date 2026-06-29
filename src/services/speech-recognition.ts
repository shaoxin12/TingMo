export interface RecognitionResult {
  text: string;
  durationMs: number;
  language?: string;
  confidence?: number;
}

export interface IRecognitionProvider {
  readonly name: string;
  readonly type: 'local' | 'api';
  readonly vadEnabled: boolean;

  initialize(): Promise<boolean>;
  transcribe(audioBuffer: Buffer, sampleRate: number, lang?: string, signal?: AbortSignal): Promise<RecognitionResult>;
  /** Transcribe raw PCM samples directly (optional optimization — skips WAV re-encode/decode) */
  transcribeRaw?(samples: Float32Array, sampleRate: number, lang?: string, signal?: AbortSignal): Promise<RecognitionResult>;
  /** Whether the recognizer is currently processing a request (mutex for single-instance recognizers). */
  readonly isBusy?: boolean;
  dispose(): Promise<void>;
  readonly isReady: boolean;

  // ── Streaming mode (optional) ──────────────────────────
  // Providers that support incremental streaming (e.g. Volcano WebSocket)
  // implement these to enable "recognize while recording" for near-zero latency.
  /** Open streaming connection and send initial config. Returns when server is ready. */
  startStream?(sampleRate: number, lang: string): Promise<void>;
  /** Send a raw PCM chunk to the streaming connection. */
  sendStreamChunk?(pcm: Buffer): void;
  /** Close the stream, wait for final result. Returns accumulated text. */
  endStream?(): Promise<string>;
}
