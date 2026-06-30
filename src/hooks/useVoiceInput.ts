import { useState, useEffect, useCallback } from 'react';

export type VoiceState = 'idle' | 'recording' | 'recognizing' | 'refining' | 'success';

interface VoiceInputState {
  state: VoiceState;
  charCount: number | null;
}

export function useVoiceInput() {
  const [voiceState, setVoiceState] = useState<VoiceInputState>({
    state: 'idle',
    charCount: null,
  });
  const [translateMode, setTranslateMode] = useState(false);

  useEffect(() => {
    const api = window.tingmo;
    if (!api) return;

    const unsub1 = api.onVoiceStateChange((data) => {
      try {
        setVoiceState((prev) => ({
          ...prev,
          state: data.state as VoiceState,
        }));
        if (data.state === 'idle') setTranslateMode(false);
      } catch (err) {
        console.error('[useVoiceInput] onVoiceStateChange error:', err);
      }
    });

    const unsub2 = api.onRecognitionDone((data) => {
      try {
        setVoiceState({
          state: 'success',
          charCount: data.charCount,
        });
      } catch (err) {
        console.error('[useVoiceInput] onRecognitionDone error:', err);
      }
    });

    const unsub4 = api.onTranslateMode?.((data: { enabled: boolean }) => {
      try {
        setTranslateMode(data.enabled);
      } catch (err) {
        console.error('[useVoiceInput] onTranslateMode error:', err);
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub4?.();
    };
  }, []);

  const finish = useCallback(async () => {
    await window.tingmo?.finishRecording()?.catch((err: Error) => {
      console.error('[useVoiceInput] finishRecording failed:', err);
    });
  }, []);

  const cancel = useCallback(async () => {
    await window.tingmo?.cancelRecording()?.catch((err: Error) => {
      console.error('[useVoiceInput] cancelRecording failed:', err);
    });
  }, []);

  return {
    state: voiceState.state,
    charCount: voiceState.charCount,
    translateMode,
    finish,
    cancel,
  };
}
