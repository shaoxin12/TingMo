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

  constructor(private modelDir: string) {}

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
          senseVoice: { model: modelPath, language: '', useInverseTextNormalization: 1 },
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

  async transcribe(audioBuffer: Buffer, _sampleRate: number, lang?: string): Promise<RecognitionResult> {
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
      return { text, durationMs: performance.now() - t0, language: lang || 'zh', confidence: 0.85 };
    }

    // Long audio: split into overlapping chunks (sequential — ONNX Runtime uses internal threading)
    const chunkWavs = splitWavChunks(audioBuffer, CHUNK_SECS, 1);
    console.log('[SherpaASR] Splitting into', chunkWavs.length, 'chunks');

    const texts: string[] = [];
    for (const wav of chunkWavs) {
      const { samples: chunkSamples } = parseWAV(wav);
      const stream = this.recognizer.createStream();
      stream.acceptWaveform(SAMPLE_RATE, chunkSamples);
      this.recognizer.decode(stream);
      texts.push(this.recognizer.getResult(stream).text || '');
      stream.free();
    }

    const text = joinChunkResults(texts);
    console.log('[SherpaASR] Done,', (performance.now() - t0).toFixed(0), 'ms,', text.length, 'chars');
    return { text, durationMs: performance.now() - t0, language: lang || 'zh', confidence: 0.85 };
  }

  async dispose(): Promise<void> {
    if (this.recognizer) { this.recognizer.free(); this.recognizer = null; }
    this.isReady = false;
  }
}
