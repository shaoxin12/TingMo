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

function playUISound(type: 'appear' | 'dismiss') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    if (type === 'appear') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(1100, ctx.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1100, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(780, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.08);
    }
    setTimeout(() => ctx.close(), 300);
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
  const a = Math.sin(i * 2.71 + t * 0.005) * Math.cos(i * 1.93 + t * 0.008);
  return a * 0.5 + 0.5;
}

export const FloatingWindow: React.FC = () => {
  const { state, translateMode } = useVoiceInput();
  const { t } = useI18n();
  const { audioLevel, startCapture, stopCapture, drainNewWav } = useAudioCapture();
  const asrProvider = useSettingsStore((s) => s.asrProvider);
  const language = useSettingsStore((s) => s.language);
  const translateTarget = useSettingsStore((s) => s.translateTarget);
  const useDictionary = useSettingsStore((s) => s.useDictionary);
  const dictionary = useSettingsStore((s) => s.dictionary);
  const selectedMicDeviceId = useSettingsStore((s) => s.selectedMicDeviceId);

  const sentAudioRef = useRef(false);
  const prevStateRef = useRef<typeof state>('idle');
  const streamTextRef = useRef<string[]>([]);
  const streamTimerRef = useRef<ReturnType<typeof setInterval>>();
  const streamBusyRef = useRef(false);   // guard against overlapping asrChunk calls
  const streamClosedRef = useRef(false); // discard late-resolving promises after recognizing
  const [visible, setVisible] = useState(false);
  const levelRef = useRef(0);
  const [, setTick] = useState(0);
  const animRef = useRef(0);

  useEffect(() => {
    levelRef.current += (audioLevel - levelRef.current) * 0.18;
  }, [audioLevel]);

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

    if (animRef2.current) { animRef2.current.cancel(); animRef2.current = null; }

    // Appear — use flushSync to guarantee capsule DOM is committed before animating
    if (prev === 'idle' && state !== 'idle') {
      playUISound('appear');
      flushSync(() => setVisible(true));
      if (capsuleRef.current) {
        const anim = capsuleRef.current.animate([
          { opacity: '0', transform: 'translateY(16px) scale(0.88)' },
          { opacity: '0.9', transform: 'translateY(-2px) scale(1.02)', offset: 0.6 },
          { opacity: '1', transform: 'translateY(0) scale(1)' },
        ], { duration: 380, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' });
        animRef2.current = anim;
      }
      return;
    }

    // Dismiss from cancel / error / idle-from-main
    if (prev !== 'idle' && state === 'idle') {
      playUISound('dismiss');
      if (capsuleRef.current) {
        const anim = capsuleRef.current.animate([
          { opacity: '1', transform: 'translateY(0) scale(1)' },
          { opacity: '0', transform: 'translateY(16px) scale(0.85)' },
        ], { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.6, 1)', fill: 'forwards' });
        animRef2.current = anim;
        anim.onfinish = () => { setVisible(false); animRef2.current = null; };
      }
    }
  }, [state]);

  // ── Success → auto-dismiss (renderer-side timer) ─────────
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (state === 'success') {
      successTimerRef.current = setTimeout(() => {
        playUISound('dismiss');
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
  useEffect(() => {
    if (state === 'recording') {
      startCapture(selectedMicDeviceId || undefined);
      sentAudioRef.current = false;
      if (asrProvider === 'local') {
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
              if (text && !streamClosedRef.current) {
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
      if (asrProvider === 'local') {
        (async () => {
          const lastWav = drainNewWav();
          if (lastWav && lastWav.byteLength > 1000) {
            const text = await window.tingmo?.asrChunk(lastWav);
            if (text) streamTextRef.current.push(text);
          }
          const result = stopCapture();
          const preAsrText = streamTextRef.current.join('').trim();
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
          }
        })();
      } else {
        // Cloud ASR: single full request (no streaming)
        const result = stopCapture();
        if (result && !sentAudioRef.current) {
          sentAudioRef.current = true;
          if (!hasAudioSignal(result.wav)) { window.tingmo?.cancelRecording(); return; }
          (window.tingmo as any).transcribe(result.wav, language || 'auto', {
            translate: translateMode, translateTarget,
            dictionary: useDictionary ? dictionary : [],
          });
        } else if (!result) {
          window.tingmo?.cancelRecording();
        }
      }
    }
    return () => clearInterval(streamTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
	  }, [state, asrProvider, startCapture, stopCapture, drainNewWav, selectedMicDeviceId, language,
	    translateMode, translateTarget, useDictionary, dictionary]);

  if (!visible) return null;

  const lvl = levelRef.current;
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

      {/* Vertical bar waveform — centered, grows up+down */}
      <div className="capsule-bars">
        {PROFILE.map((p, i) => {
          const jit = barJitter(i, now);
          // Threshold boost: tiny below 0.04, explodes above
          const boost = lvl < 0.04
            ? lvl * 0.25
            : 0.01 + Math.pow((lvl - 0.04) * 1.04, 0.45);
          const h = 2 + p * boost * 48 * (0.2 + jit * 0.8);
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
