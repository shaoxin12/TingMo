import type { IRecognitionProvider, RecognitionResult } from './speech-recognition';

function findFile(fs: any, path: any, dir: string, filename: string): string | null {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const result = findFile(fs, path, path.join(dir, entry.name), filename);
        if (result) return result;
      } else if (entry.name === filename) {
        return path.join(dir, entry.name);
      }
    }
  } catch { /* ignore */ }
  return null;
}

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

      // tokens.txt might be in a subdirectory from old tar.bz2 extraction
      if (!fs.existsSync(tokensPath)) {
        console.log('[SherpaASR] tokens.txt not at top level, searching subdirectories...');
        const found = findFile(fs, path, this.modelDir, 'tokens.txt');
        if (found) {
          tokensPath = found;
          console.log('[SherpaASR] Found tokens.txt at', found);
        }
      }

      const config = {
        modelConfig: {
          senseVoice: {
            model: modelPath,
            language: '', // auto-detect
            useInverseTextNormalization: 1,
          },
          tokens: tokensPath,
        },
      };

      this.recognizer = this.sherpa.createOfflineRecognizer(config);
      this.isReady = true;
      console.log('[SherpaASR] Initialized (sherpa-onnx)');
      return true;
    } catch (err: any) {
      console.error('[SherpaASR] Init error:', err.message);
      this.isReady = false;
      return false;
    }
  }

  async transcribe(
    audioBuffer: Buffer,
    _sampleRate: number,
    lang?: string,
  ): Promise<RecognitionResult> {
    const t0 = performance.now();

    // Parse WAV: 16-bit PCM mono → Float32Array (16kHz after browser resampling)
    const numSamples = Math.floor((audioBuffer.length - 44) / 2);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = audioBuffer.readInt16LE(44 + i * 2) / 32768;
    }

    const stream = this.recognizer.createStream();
    stream.acceptWaveform(16000, samples);
    this.recognizer.decode(stream);
    const text = this.recognizer.getResult(stream).text || '';
    stream.free();

    console.log('[SherpaASR] Result:', text.slice(0, 120));

    return {
      text,
      durationMs: performance.now() - t0,
      language: lang || 'auto',
      confidence: 0.85,
    };
  }

  async dispose(): Promise<void> {
    if (this.recognizer) {
      this.recognizer.free();
      this.recognizer = null;
    }
    this.isReady = false;
  }
}
