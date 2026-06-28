import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/context';

interface Props {
  currentHotkey: string;
  onHotkeyChange: (key: string) => void;
  onReset: () => void;
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

export const HotkeyRecorder: React.FC<Props> = ({ currentHotkey, onHotkeyChange, onReset }) => {
  const { t } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [display, setDisplay] = useState('');
  const displayRef = useRef('');
  const keysRef = useRef<Set<string>>(new Set());

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();
    keysRef.current.add(e.code);

    const i18nKey = keyCodeToI18n(e.code);

    // Check if the key pressed IS a modifier key (has i18n translation)
    const isModifierKey = i18nKey !== '';

    const parts: string[] = [];
    if (e.ctrlKey && !isModifierKey) parts.push('Ctrl');
    if (e.altKey && !isModifierKey) parts.push('Alt');
    if (e.shiftKey && !isModifierKey) parts.push('Shift');
    if (e.metaKey && !isModifierKey) parts.push('Win');

    if (i18nKey) {
      // Single modifier key (e.g. Right Alt) — use the translated name directly
      parts.push(t(i18nKey));
    } else if (!['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
      'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
      parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
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
      onHotkeyChange(displayRef.current);
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
