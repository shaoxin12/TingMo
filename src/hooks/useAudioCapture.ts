import { useRef, useCallback, useState } from 'react';
import { translate, type Locale } from '../i18n/translations';
import { useSettingsStore } from '../store/settings';

// Resample Float32Array from source rate to target rate using linear interpolation.
// Applies 2-pass triangular anti-aliasing filter when downsampling to prevent
// high-frequency noise (>Nyquist) from aliasing into the audible band.
function resample(samples: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return samples;

  // Anti-alias lowpass: 2x 3-point moving average (kernel [1,2,3,2,1]/9)
  if (srcRate > dstRate) {
    const tmp = new Float32Array(samples.length);
    // Pass 1
    tmp[0] = samples[0];
    for (let i = 1; i < samples.length - 1; i++) {
      tmp[i] = samples[i - 1] * 0.25 + samples[i] * 0.5 + samples[i + 1] * 0.25;
    }
    tmp[samples.length - 1] = samples[samples.length - 1];
    // Pass 2
    for (let i = 1; i < samples.length - 1; i++) {
      samples[i] = tmp[i - 1] * 0.25 + tmp[i] * 0.5 + tmp[i + 1] * 0.25;
    }
  }

  const ratio = srcRate / dstRate;
  const newLength = Math.floor(samples.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcPos = i * ratio;
    const srcIdx = Math.floor(srcPos);
    const frac = srcPos - srcIdx;
    const a = samples[srcIdx] ?? 0;
    const b = samples[srcIdx + 1] ?? a;
    result[i] = a + (b - a) * frac;
  }
  return result;
}

// Encode Float32Array PCM as WAV Buffer
function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

const SILENCE_RMS = 0.02;
const DEFAULT_VAD_TIMEOUT_SEC = 2.0;

export function useAudioCapture() {
  const [audioLevel, setAudioLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const sampleRateRef = useRef(48000);
  const silenceDurRef = useRef(0);
  const vadTimeoutRef = useRef(DEFAULT_VAD_TIMEOUT_SEC);
  const vadCallbackRef = useRef<(() => void) | null>(null);
  const vadTriggeredRef = useRef(false);
  const sentSamplesRef = useRef(0);
  const TARGET_RATE = 16000;

  const startCapture = useCallback(async (deviceId?: string) => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      sampleRateRef.current = audioCtx.sampleRate;

      const source = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferSize = 4096;
      const scriptNode = audioCtx.createScriptProcessor(bufferSize, 1, 1);
      pcmChunksRef.current = [];
      silenceDurRef.current = 0;
      vadTriggeredRef.current = false;
      sentSamplesRef.current = 0;

      scriptNode.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(inputData));

        // RMS-based silence detection
        let sum = 0;
        for (let j = 0; j < inputData.length; j++) sum += inputData[j] * inputData[j];
        const rms = Math.sqrt(sum / inputData.length);

        if (rms < SILENCE_RMS) {
          silenceDurRef.current += inputData.length / sampleRateRef.current;
          // VAD auto-stop
          if (
            !vadTriggeredRef.current &&
            silenceDurRef.current >= vadTimeoutRef.current &&
            vadTimeoutRef.current > 0
          ) {
            vadTriggeredRef.current = true;
            vadCallbackRef.current?.();
          }
        } else {
          silenceDurRef.current = 0;
        }
      };

      source.connect(scriptNode);
      // Must connect to destination for onaudioprocess to fire, but gain=0 to stay silent
      const muteGain = audioCtx.createGain();
      muteGain.gain.value = 0;
      scriptNode.connect(muteGain);
      muteGain.connect(audioCtx.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(Math.min(1, rms * 4));
        animFrameRef.current = requestAnimationFrame(loop);
      };
      loop();
      return true;
    } catch (err: any) {
      const message = err?.message ?? 'Audio capture failed';
      console.error('Audio capture failed:', err);
      const lang = useSettingsStore.getState().uiLanguage as Locale;
      await window.tingmo?.reportCaptureError(`${translate('error.micStartFailed', lang)}：${message}`);
      return false;
    }
  }, []);

  // Return WAV of PCM accumulated since last drain (streaming ASR)
  const drainNewWav = useCallback((): ArrayBuffer | null => {
    const chunks = pcmChunksRef.current;
    if (chunks.length === 0) return null;
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    if (totalLength <= sentSamplesRef.current) return null;

    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    const newSamples = combined.slice(sentSamplesRef.current);
    sentSamplesRef.current = totalLength;
    const resampled = resample(newSamples, sampleRateRef.current, TARGET_RATE);
    return encodeWAV(resampled, TARGET_RATE);
  }, []);

  const stopCapture = useCallback((): { wav: ArrayBuffer; sampleRate: number } | null => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setAudioLevel(0);

    const chunks = pcmChunksRef.current;
    if (chunks.length === 0) return null;
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    pcmChunksRef.current = [];
    const resampled = resample(combined, sampleRateRef.current, TARGET_RATE);

    // Normalize: scale to consistent level regardless of input volume
    let peak = 0;
    for (let i = 0; i < resampled.length; i++) {
      const abs = Math.abs(resampled[i]);
      if (abs > peak) peak = abs;
    }
    if (peak > 0 && peak < 0.05) {
      const gain = 0.9 / peak;
      for (let i = 0; i < resampled.length; i++) {
        resampled[i] = Math.max(-1, Math.min(1, resampled[i] * gain));
      }
      console.log('[Audio] Normalized: peak', peak.toFixed(4), '×', gain.toFixed(1), '→ 0.9');
    }

    return { wav: encodeWAV(resampled, TARGET_RATE), sampleRate: TARGET_RATE };
  }, []);

  const setVadTimeout = useCallback((seconds: number) => {
    vadTimeoutRef.current = seconds;
  }, []);

  const setVadCallback = useCallback((cb: (() => void) | null) => {
    vadCallbackRef.current = cb;
  }, []);

  return { audioLevel, startCapture, stopCapture, drainNewWav, setVadTimeout, setVadCallback };
}
