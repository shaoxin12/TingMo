import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useSettingsStore } from '../store/settings';
import { useI18n } from '../i18n/context';

function hasAudioSignal(wavBuf: ArrayBuffer): boolean {
  const view = new DataView(wavBuf);
  if (wavBuf.byteLength < 100) return false;
  const totalSamples = Math.floor((wavBuf.byteLength - 44) / 2);
  const segments = 8, segLen = Math.floor(totalSamples / segments);
  let active = 0;
  for (let s = 0; s < segments; s++) {
    const start = 44 + s * segLen * 2;
    let sum = 0;
    const n = Math.min(200, segLen);
    for (let i = 0; i < n; i++) sum += Math.abs(view.getInt16(start + i * 2, true));
    if (sum / n > 100) active++;
  }
  return active >= 2;
}

/** Generate a simple sine-wave WAV and play via HTML5 Audio element.
 *  Avoids Web Audio API AudioContext issues in Electron (suspended without user gesture). */
function playUISound(type: 'appear' | 'dismiss') {
  try {
    const sampleRate = 8000;
    const duration = type === 'appear' ? 0.2 : 0.12;
    const numSamples = Math.floor(sampleRate * duration);
    const dataSize = numSamples * 2;
    const buf = new ArrayBuffer(44 + dataSize);
    const v = new DataView(buf);

    // WAV header
    const writeStr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
    v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    writeStr(36, 'data'); v.setUint32(40, dataSize, true);

    // Fill PCM samples
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      let sample = 0;
      if (type === 'appear') {
        // Two-tone chime: E5(659Hz) + C6(1047Hz) with fast decay
        sample = Math.sin(2 * Math.PI * 880 * t) * 0.5 + Math.sin(2 * Math.PI * 1320 * t) * 0.3;
      } else {
        // Descending blip: C6→G5
        const freq = 1047 - (t / duration) * 263;
        sample = Math.sin(2 * Math.PI * freq * t) * 0.4;
      }
      // Exponential decay envelope
      sample *= Math.exp(-t * 12);
      const int16 = Math.max(-32767, Math.min(32767, Math.round(sample * 6000)));
      v.setInt16(44 + i * 2, int16, true);
    }

    const blob = new Blob([buf], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 0.5;
    audio.play().then(() => {
      audio.onended = () => URL.revokeObjectURL(url);
    }).catch(() => URL.revokeObjectURL(url));
  } catch { /* ignore */ }
}

const BAR_COUNT = 15;

const PROFILE: number[] = (() => {
  const mid = (BAR_COUNT - 1) / 2;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const x = (i - mid) / (mid * 0.8);
    return Math.exp(-x * x * 0.25); // wider bell: edge bars still ~60% of center
  });
})();

function barJitter(i: number, t: number): number {
  const a = Math.sin(i * 2.71 + t * 0.0035) * Math.cos(i * 1.93 + t * 0.0056);
  return a * 0.5 + 0.5;
}

export const FloatingWindow: React.FC = () => {
  const { state, translateMode } = useVoiceInput();
  const { t } = useI18n();
  const { startCapture, stopCapture, drainNewWav } = useAudioCapture();
  const asrProvider = useSettingsStore((s) => s.asrProvider);
  const asrCloudProvider = useSettingsStore((s) => s.asrCloudProvider);
  const language = useSettingsStore((s) => s.language);
  const translateTarget = useSettingsStore((s) => s.translateTarget);
  const useDictionary = useSettingsStore((s) => s.useDictionary);
  const dictionary = useSettingsStore((s) => s.dictionary);
  const polishMode = useSettingsStore((s) => s.polishMode);
  const selectedMicDeviceId = useSettingsStore((s) => s.selectedMicDeviceId);
  const uiSoundEnabled = useSettingsStore((s) => s.uiSoundEnabled);

  const sentAudioRef = useRef(false);
  const prevStateRef = useRef<typeof state>('idle');
  const streamTextRef = useRef<string[]>([]);
  const streamTimerRef = useRef<ReturnType<typeof setInterval>>();
  const streamBusyRef = useRef(false);   // guard against overlapping asrChunk calls
  const streamClosedRef = useRef(false); // discard late-resolving promises after recognizing
  const [visible, setVisible] = useState(false);
  const [, setTick] = useState(0);
  const animRef = useRef(0);

  const barActive = state === 'recording' || state === 'recognizing' || state === 'refining';
  useEffect(() => {
    if (!barActive || !visible) {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = 0; }
      return;
    }
    const loop = () => {
      setTick((t) => t + 1);
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = 0; } };
  }, [barActive, visible]);

  const capsuleRef = useRef<HTMLDivElement>(null);
  const animRef2 = useRef<Animation | null>(null);

  // ── Appear + cancel-dismiss ──────────────────────────────
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    // Appear — use flushSync to commit capsule DOM, then wait one frame
    // for the browser to attach the ref before starting Web Animation.
    if (prev === 'idle' && state !== 'idle') {
      if (animRef2.current) { animRef2.current.cancel(); animRef2.current = null; }
      if (uiSoundEnabled) playUISound('appear');
      flushSync(() => setVisible(true));
      requestAnimationFrame(() => {
        if (capsuleRef.current) {
          const anim = capsuleRef.current.animate([
            { opacity: '0', transform: 'translateY(16px) scale(0.88)' },
            { opacity: '0.9', transform: 'translateY(-2px) scale(1.02)', offset: 0.6 },
            { opacity: '1', transform: 'translateY(0) scale(1)' },
          ], { duration: 380, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' });
          animRef2.current = anim;
          anim.onfinish = () => { animRef2.current = null; };
        }
      });
      return;
    }

    // Dismiss from cancel / error / idle-from-main
    if (prev !== 'idle' && state === 'idle' && visible) {
      // Cancel any stale animation (including appear) before dismiss
      if (animRef2.current) { animRef2.current.cancel(); animRef2.current = null; }
      if (uiSoundEnabled) playUISound('dismiss');
      if (capsuleRef.current) {
        const anim = capsuleRef.current.animate([
          { opacity: '1', transform: 'translateY(0) scale(1)' },
          { opacity: '0', transform: 'translateY(16px) scale(0.85)' },
        ], { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
        animRef2.current = anim;
        anim.onfinish = () => { setVisible(false); animRef2.current = null; };
      }
    }
  }, [state, visible]);

  // ── Success → auto-dismiss (renderer-side timer) ─────────
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (state === 'success') {
      successTimerRef.current = setTimeout(() => {
        if (uiSoundEnabled) playUISound('dismiss');
        if (capsuleRef.current) {
          const anim = capsuleRef.current.animate([
            { opacity: '1', transform: 'translateY(0) scale(1)' },
            { opacity: '0', transform: 'translateY(16px) scale(0.85)' },
          ], { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
          anim.onfinish = () => { setVisible(false); };
        }
      }, 800);
    }
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animRef2.current) animRef2.current.cancel();
    };
  }, []);

  // ── Audio capture ────────────────────────────────────────
  const isCloudStream = asrProvider === 'cloud' && (asrCloudProvider === 'volcano' || asrCloudProvider === 'aliyun');
  useEffect(() => {
    if (state === 'recording') {
      startCapture(selectedMicDeviceId || undefined);
      sentAudioRef.current = false;
      if (isCloudStream) {
        // Cloud WebSocket streaming (Volcano / Aliyun): open connection, send chunks
        streamTextRef.current = [];
        streamClosedRef.current = false;
        streamBusyRef.current = false;
        (async () => {
          try {
            await window.tingmo?.asrStreamStart(16000, language || 'auto');
            console.log('[FW] Cloud stream started');
          } catch (err: any) {
            console.error('[FW] Cloud stream start failed:', err.message);
          }
        })();
        streamTimerRef.current = setInterval(async () => {
          if (streamBusyRef.current || streamClosedRef.current) return;
          const wav = drainNewWav();
          if (wav && wav.byteLength > 1000) {
            streamBusyRef.current = true;
            try {
              await window.tingmo?.asrStreamSend(wav);
            } catch { /* ignore */ }
            streamBusyRef.current = false;
          }
        }, 500);
      } else if (asrProvider === 'local') {
        streamTextRef.current = [];
        streamClosedRef.current = false;
        streamBusyRef.current = false;
        streamTimerRef.current = setInterval(async () => {
          if (streamBusyRef.current || streamClosedRef.current) return;
          const wav = drainNewWav();
          if (wav && wav.byteLength > 1000) {
            streamBusyRef.current = true;
            try {
              const text = await window.tingmo?.asrChunk(wav);
              if (text) {
                streamTextRef.current.push(text);
              }
            } finally {
              streamBusyRef.current = false;
            }
          }
        }, 2000);
      }
    } else if (state === 'idle') {
      clearInterval(streamTimerRef.current);
      streamClosedRef.current = true;
      stopCapture();
      sentAudioRef.current = false;
      streamTextRef.current = [];
    } else if (state === 'recognizing') {
      clearInterval(streamTimerRef.current);
      streamClosedRef.current = true;
      if (isCloudStream) {
        // Drain remaining PCM, end stream, get final text from cloud WS
        (async () => {
          const lastWav = drainNewWav();
          if (lastWav && lastWav.byteLength > 1000) {
            try { await window.tingmo?.asrStreamSend(lastWav); } catch { /* ignore */ }
          }
          // Race: stream result vs 5s timeout fallback
          let preAsrText = '';
          try {
            const streamPromise = window.tingmo?.asrStreamEnd();
            const timeoutPromise = new Promise<string>((r) => setTimeout(() => r(''), 5000));
            preAsrText = (await Promise.race([streamPromise, timeoutPromise])) || '';
          } catch { preAsrText = ''; }
          console.log(`[FW] Cloud stream end: preAsrText ${preAsrText.length} chars — "${preAsrText.slice(0, 80)}"`);
          const result = stopCapture();
          if ((preAsrText || (result && hasAudioSignal(result.wav))) && !sentAudioRef.current) {
            sentAudioRef.current = true;
            if (!preAsrText && result && !hasAudioSignal(result.wav)) {
              window.tingmo?.cancelRecording(); return;
            }
            (window.tingmo as any).transcribe(result?.wav || new ArrayBuffer(0), language || 'auto', {
              translate: translateMode, translateTarget,
              dictionary: useDictionary ? dictionary : [],
              polishMode: polishMode || 'balanced',
              preAsrText: preAsrText || undefined,
            });
          } else {
            // No audio captured (e.g. hold-mode quick tap) — reset state
            window.tingmo?.cancelRecording();
          }
        })();
      } else if (asrProvider === 'local') {
        (async () => {
          const lastWav = drainNewWav();
          if (lastWav && lastWav.byteLength > 1000) {
            const text = await window.tingmo?.asrChunk(lastWav);
            if (text) streamTextRef.current.push(text);
          }
          const result = stopCapture();
          const preAsrText = streamTextRef.current.join('').trim();
          console.log(`[FW] preAsrText: ${streamTextRef.current.length} chunks, ${preAsrText.length} chars — "${preAsrText.slice(0, 80)}"`);
          if ((preAsrText || (result && hasAudioSignal(result.wav))) && !sentAudioRef.current) {
            sentAudioRef.current = true;
            if (!preAsrText && result && !hasAudioSignal(result.wav)) {
              window.tingmo?.cancelRecording(); return;
            }
            (window.tingmo as any).transcribe(result?.wav || new ArrayBuffer(0), language || 'auto', {
              translate: translateMode, translateTarget,
              dictionary: useDictionary ? dictionary : [],
              preAsrText: preAsrText || undefined,
            });
          } else {
            // No audio captured (e.g. hold-mode quick tap) — reset state
            window.tingmo?.cancelRecording();
          }
        })();
      } else {
        // Cloud ASR: single full request (no streaming)
        console.log('[FW] Cloud non-stream path, provider:', asrCloudProvider);
        const result = stopCapture();
        console.log('[FW] stopCapture result:', result ? `wav ${result.wav?.byteLength || 0} bytes` : 'null');
        if (result && !sentAudioRef.current) {
          sentAudioRef.current = true;
          const hasSignal = hasAudioSignal(result.wav);
          console.log('[FW] hasAudioSignal:', hasSignal);
          if (!hasSignal) { console.log('[FW] No audio signal, cancelling'); window.tingmo?.cancelRecording(); return; }
          console.log('[FW] Calling transcribe...');
          (window.tingmo as any).transcribe(result.wav, language || 'auto', {
            translate: translateMode, translateTarget,
            dictionary: useDictionary ? dictionary : [],
          });
        } else if (!result) {
          console.log('[FW] stopCapture returned null, cancelling');
          window.tingmo?.cancelRecording();
        }
      }
    }
    return () => clearInterval(streamTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [state, asrProvider, asrCloudProvider, startCapture, stopCapture, drainNewWav, selectedMicDeviceId, language,
	    translateMode, translateTarget, useDictionary, dictionary, polishMode]);

  if (!visible) return null;

  const now = Date.now();

  const barColor = (state === 'recognizing' || state === 'refining')
    ? '#FF5A1F'
    : '#fff';

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
    <div className="capsule" ref={capsuleRef}>
      <div className={`capsule-indicator ${
        state === 'recording' ? 'on' :
        state === 'recognizing' || state === 'refining' ? 'thinking' :
        state === 'success' ? 'success' : ''
      }`}>
        <div className="capsule-indicator-core" />
      </div>

      {/* Vertical bar waveform — pure jitter-driven, always animating */}
      <div className="capsule-bars">
        {PROFILE.map((p, i) => {
          const jit = barJitter(i, now);
          // Jitter-only: bell curve profile × organic random motion
          // Center bars reach ~20px, edges ~12px. Constant gentle animation.
          const h = 2 + p * jit * 20;
          return (
            <div
              key={i}
              className="capsule-bar-item"
              style={{ height: h, background: barColor }}
            />
          );
        })}
      </div>

      {/* Recognizing sweep */}
      {(state === 'recognizing' || state === 'refining') && (
        <div className="capsule-sweep" />
      )}

      {/* Translate badge */}
      {translateMode && state === 'recording' && (
        <span className="capsule-badge">{t('capsule.translate')}</span>
      )}
    </div>
    </div>
  );
};
