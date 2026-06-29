import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';
import { parseWAV, splitWavChunks, joinChunkResults } from './audio-chunker';

const CHUNK_SECS = 10;

export class SherpaASRProvider implements IRecognitionProvider {
  readonly name = 'SenseVoiceSmall';
  readonly type = 'local' as const;
  readonly vadEnabled = true;
  isReady = false;

  private recognizer: any = null;
  private sherpa: any = null;
  // Mutex: sherpa-onnx recognizer is a single instance; createStream/decode are
  // not concurrency-safe. A zombie full-ASR job (e.g. after safety timeout) would
  // block streaming chunks. This flag lets asr-chunk fast-return instead of queueing.
  private busy = false;
  get isBusy(): boolean { return this.busy; }

  constructor(private modelDir: string, private langHint: string = '') {}

  async initialize(): Promise<boolean> {
    try {
      const fs = require('fs');
      const path = require('path');
      this.sherpa = require('sherpa-onnx');

      const modelPath = path.join(this.modelDir, 'model.int8.onnx');
      let tokensPath = path.join(this.modelDir, 'tokens.txt');

      if (!fs.existsSync(modelPath)) {
        console.log('[SherpaASR] model.int8.onnx not found at', modelPath);
        this.isReady = false;
        return false;
      }

      if (!fs.existsSync(tokensPath)) {
        console.log('[SherpaASR] searching for tokens.txt...');
        for (const entry of fs.readdirSync(this.modelDir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            const p = path.join(this.modelDir, entry.name, 'tokens.txt');
            if (fs.existsSync(p)) { tokensPath = p; break; }
          }
        }
        if (!tokensPath) console.warn('[SherpaASR] tokens.txt not found in subdirs');
      }

      this.recognizer = this.sherpa.createOfflineRecognizer({
        modelConfig: {
          senseVoice: { model: modelPath, language: this.langHint || '', useInverseTextNormalization: 1 },
          tokens: tokensPath,
        },
      });
      this.isReady = true;
      console.log('[SherpaASR] Initialized');
      return true;
    } catch (err: any) {
      console.error('[SherpaASR] Init error:', err.message);
      this.isReady = false;
      return false;
    }
  }

  /** Transcribe raw PCM samples directly (no WAV encode/decode overhead) */
  async transcribeRaw(samples: Float32Array, sampleRate: number, lang?: string, signal?: AbortSignal): Promise<RecognitionResult> {
    if (this.busy) {
      console.warn('[SherpaASR] Busy, transcribeRaw skipped');
      return { text: '', durationMs: 0, language: lang || 'auto', confidence: 0 };
    }
    this.busy = true;
    try {
      const t0 = performance.now();
      const totalSecs = samples.length / sampleRate;

      // Short audio: single pass
      if (totalSecs <= CHUNK_SECS + 2) {
        const stream = this.recognizer.createStream();
        stream.acceptWaveform(sampleRate, samples);
        this.recognizer.decode(stream);
        const text = this.recognizer.getResult(stream).text || '';
        stream.free();
        console.log('[SherpaASR] Raw single pass,', (performance.now() - t0).toFixed(0), 'ms,', text.length, 'chars');
        return { text, durationMs: performance.now() - t0, language: lang || 'auto', confidence: 0.85 };
      }

      // Long audio: split into overlapping chunks
      const chunkLen = CHUNK_SECS * sampleRate;
      const overlapLen = 1 * sampleRate;
      const step = chunkLen - overlapLen;
      const texts: string[] = [];
      for (let start = 0; start < samples.length; start += step) {
        if (signal?.aborted) { console.log('[SherpaASR] Raw aborted, returning partial', texts.length, 'chunks'); break; }
        const end = Math.min(start + chunkLen, samples.length);
        const segment = samples.slice(start, end);
        if (segment.length < chunkLen * 0.5 && texts.length > 0) break;
        const stream = this.recognizer.createStream();
        stream.acceptWaveform(sampleRate, segment);
        this.recognizer.decode(stream);
        texts.push(this.recognizer.getResult(stream).text || '');
        stream.free();
        if (end >= samples.length) break;
      }

      const text = joinChunkResults(texts);
      console.log('[SherpaASR] Raw done,', (performance.now() - t0).toFixed(0), 'ms,', text.length, 'chars');
      return { text, durationMs: performance.now() - t0, language: lang || 'auto', confidence: 0.85 };
    } finally {
      this.busy = false;
    }
  }

  async transcribe(audioBuffer: Buffer, _sampleRate: number, lang?: string, signal?: AbortSignal): Promise<RecognitionResult> {
    if (this.busy) {
      console.warn('[SherpaASR] Busy, transcribe skipped');
      return { text: '', durationMs: 0, language: lang || 'auto', confidence: 0 };
    }
    this.busy = true;
    try {
      const t0 = performance.now();
      const { samples } = parseWAV(audioBuffer);
      const SAMPLE_RATE = 16000;
      const totalSecs = samples.length / SAMPLE_RATE;

      // Short audio: single pass
      if (totalSecs <= CHUNK_SECS + 2) {
        const stream = this.recognizer.createStream();
        stream.acceptWaveform(SAMPLE_RATE, samples);
        this.recognizer.decode(stream);
        const text = this.recognizer.getResult(stream).text || '';
        stream.free();
        console.log('[SherpaASR] Single pass,', (performance.now() - t0).toFixed(0), 'ms,', text.length, 'chars');
        return { text, durationMs: performance.now() - t0, language: lang || 'auto', confidence: 0.85 };
      }

      // Long audio: split into overlapping chunks (sequential — ONNX Runtime uses internal threading)
      const chunkWavs = splitWavChunks(audioBuffer, CHUNK_SECS, 1);
      console.log('[SherpaASR] Splitting into', chunkWavs.length, 'chunks');

      const texts: string[] = [];
      for (const wav of chunkWavs) {
        if (signal?.aborted) { console.log('[SherpaASR] Aborted, returning partial', texts.length, 'chunks'); break; }
        const { samples: chunkSamples } = parseWAV(wav);
        const stream = this.recognizer.createStream();
        stream.acceptWaveform(SAMPLE_RATE, chunkSamples);
        this.recognizer.decode(stream);
        texts.push(this.recognizer.getResult(stream).text || '');
        stream.free();
      }

      const text = joinChunkResults(texts);
      console.log('[SherpaASR] Done,', (performance.now() - t0).toFixed(0), 'ms,', text.length, 'chars');
      return { text, durationMs: performance.now() - t0, language: lang || 'auto', confidence: 0.85 };
    } finally {
      this.busy = false;
    }
  }

  async dispose(): Promise<void> {
    if (this.recognizer) { this.recognizer.free(); this.recognizer = null; }
    this.isReady = false;
  }
}
