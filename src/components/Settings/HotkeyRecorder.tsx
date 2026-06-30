import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/context';

interface Props {
  currentHotkey: string;
  onHotkeyChange: (key: string) => void;
  onReset: () => void;
  /** 'recording' = voice hotkey, 'translate' = translation hotkey */
  type?: 'recording' | 'translate';
}

// Map key codes to i18n keys
function keyCodeToI18n(code: string): string {
  if (code.includes('Right')) {
    if (code.startsWith('Control')) return 'hotkey.key.rightCtrl';
    if (code.startsWith('Alt')) return 'hotkey.key.rightAlt';
    if (code.startsWith('Shift')) return 'hotkey.key.rightShift';
  }
  if (code.includes('Left')) {
    if (code.startsWith('Control')) return 'hotkey.key.leftCtrl';
    if (code.startsWith('Alt')) return 'hotkey.key.leftAlt';
    if (code.startsWith('Shift')) return 'hotkey.key.leftShift';
  }
  if (code.startsWith('Meta')) return 'hotkey.key.win';
  return '';
}

export const HotkeyRecorder: React.FC<Props> = ({ currentHotkey, onHotkeyChange, onReset, type = 'recording' }) => {
  const { t } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [display, setDisplay] = useState('');
  const displayRef = useRef('');
  const keysRef = useRef<Set<string>>(new Set());
  const recordingRef = useRef(false);

  // Keep recordingRef in sync so cleanup can read it without stale closure
  useEffect(() => { recordingRef.current = isRecording; }, [isRecording]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecording) return;
    // Skip browser-generated ghost events (empty code or "Unidentified" key)
    if (!e.code || e.key === 'Unidentified') return;
    // Escape cancels recording
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsRecording(false);
      setDisplay('');
      displayRef.current = '';
      keysRef.current.clear();
      window.tingmo?.setHotkeyPaused(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    keysRef.current.add(e.code);

    const i18nKey = keyCodeToI18n(e.code);

    // Build display from ALL currently held keys (supports multi-modifier combos)
    const parts: string[] = [];
    for (const code of keysRef.current) {
      const k = keyCodeToI18n(code);
      if (k) {
        parts.push(t(k));
      } else if (!['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
        'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(code)) {
        // Regular key — just use the key name
        parts.push(code.startsWith('Key') ? code.slice(3) : code);
      }
    }

    const newDisplay = parts.join(' + ');
    displayRef.current = newDisplay;
    setDisplay(newDisplay);
  }, [isRecording, t]);

  const handleKeyUp = useCallback(async (e: KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    keysRef.current.delete(e.code);
    if (keysRef.current.size === 0 && displayRef.current) {
      const key = displayRef.current;
      // 1. Notify main process if this is the recording hotkey
      if (type === 'recording') {
        await window.tingmo?.setRecordingHotkey(key);
      }
      // 2. Notify parent to update Zustand state
      onHotkeyChange(key);
      // 3. THEN resume the hook
      await window.tingmo?.setHotkeyPaused(false);
      setIsRecording(false);
    }
  }, [isRecording, onHotkeyChange]);

  useEffect(() => {
    if (isRecording) {
      window.addEventListener('keydown', handleKeyDown, true);
      window.addEventListener('keyup', handleKeyUp, true);
      return () => {
        window.removeEventListener('keydown', handleKeyDown, true);
        window.removeEventListener('keyup', handleKeyUp, true);
      };
    }
  }, [isRecording, handleKeyDown, handleKeyUp]);

  // Ensure hook is unpaused on unmount (prevents global hook from staying paused forever)
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        window.tingmo?.setHotkeyPaused(false);
      }
    };
  }, []);

  const handleClick = async () => {
    if (!isRecording) {
      // Pause global hotkey hook BEFORE starting to record, so Alt key
      // events reach the renderer instead of being consumed by the hook
      await window.tingmo?.setHotkeyPaused(true);
      setIsRecording(true);
      setDisplay('');
      keysRef.current.clear();
    }
  };

  const handleReset = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRecording(false);
    setDisplay('');
    displayRef.current = '';
    keysRef.current.clear();
    await window.tingmo?.setHotkeyPaused(false);
    onReset();
  };

  return (
    <div className="hotkey-row">
      <span
        className={`nb-key hotkey-target ${isRecording ? 'recording' : ''}`}
        onClick={handleClick}
        title={isRecording ? t('hotkey.recordingTooltip') : t('hotkey.clickToReset')}
      >
        {isRecording ? (display || t('hotkey.recordingPlaceholder')) : currentHotkey}
      </span>
      <button className="hotkey-reset" onClick={handleReset} title={t('hotkey.resetToDefault')}>↺</button>
    </div>
  );
};
