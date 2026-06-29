import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../store/settings';
import { useI18n } from '../i18n/context';

export const TrayPopup: React.FC = () => {
  const { t } = useI18n();
  const asrProvider = useSettingsStore((s) => s.asrProvider);
  const setAsrProvider = useSettingsStore((s) => s.setAsrProvider);
  const muteOnRecord = useSettingsStore((s) => s.muteOnRecord);
  const setMuteOnRecord = useSettingsStore((s) => s.setMuteOnRecord);
  const recordMode = useSettingsStore((s) => s.recordMode);
  const setRecordMode = useSettingsStore((s) => s.setRecordMode);
  const dismissRef = useRef(false);

  useEffect(() => {
    // Close popup when clicking outside
    const handle = setTimeout(() => {
      const onBlur = () => {
        if (!dismissRef.current) {
          dismissRef.current = true;
          window.tingmo?.closeTrayPopup();
        }
      };
      window.addEventListener('blur', onBlur, { once: true });
      // Also close on Escape
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          dismissRef.current = true;
          window.tingmo?.closeTrayPopup();
        }
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, 100);
    return () => {};
  }, []);

  const handleAsrProvider = (p: 'local' | 'cloud') => {
    setAsrProvider(p);
    window.tingmo?.reinitRecognition();
  };

  const handleRecordMode = (mode: 'toggle' | 'hold') => {
    setRecordMode(mode);
    window.tingmo?.setRecordMode?.(mode);
  };

  const handleMuteOnRecord = (enabled: boolean) => {
    setMuteOnRecord(enabled);
    window.tingmo?.setMuteOnRecord(enabled);
  };

  const handleSettings = () => {
    dismissRef.current = true;
    window.tingmo?.openSettings();
    window.tingmo?.closeTrayPopup();
  };

  const handleQuit = () => {
    dismissRef.current = true;
    window.tingmo?.quitApp();
  };

  return (
    <div className="tray-popup">
      {/* Voice Mode */}
      <div className="tray-popup-section">
        <div className="tray-popup-label">{t('tray.voiceMode')}</div>
        <button
          className={`tray-popup-item ${asrProvider === 'local' ? 'active' : ''}`}
          onClick={() => handleAsrProvider('local')}
        >
          <span className="tray-popup-radio">{asrProvider === 'local' ? '●' : '○'}</span>
          <span>{t('tray.voiceMode.local')}</span>
        </button>
        <button
          className={`tray-popup-item ${asrProvider === 'cloud' ? 'active' : ''}`}
          onClick={() => handleAsrProvider('cloud')}
        >
          <span className="tray-popup-radio">{asrProvider === 'cloud' ? '●' : '○'}</span>
          <span>{t('tray.voiceMode.cloud')}</span>
        </button>
      </div>

      <div className="tray-popup-sep" />

      {/* Record Mode */}
      <div className="tray-popup-section">
        <div className="tray-popup-label">{t('tray.recordMode')}</div>
        <button
          className={`tray-popup-item ${recordMode === 'toggle' ? 'active' : ''}`}
          onClick={() => handleRecordMode('toggle')}
        >
          <span className="tray-popup-radio">{recordMode === 'toggle' ? '●' : '○'}</span>
          <span>{t('tray.recordMode.toggle')}</span>
        </button>
        <button
          className={`tray-popup-item ${recordMode === 'hold' ? 'active' : ''}`}
          onClick={() => handleRecordMode('hold')}
        >
          <span className="tray-popup-radio">{recordMode === 'hold' ? '●' : '○'}</span>
          <span>{t('tray.recordMode.hold')}</span>
        </button>
      </div>

      <div className="tray-popup-sep" />

      {/* Mute on Record */}
      <button
        className="tray-popup-item"
        onClick={() => handleMuteOnRecord(!muteOnRecord)}
      >
        <span className="tray-popup-check">{muteOnRecord ? '✓' : ''}</span>
        <span>{t('tray.muteOnRecord')}</span>
      </button>

      <div className="tray-popup-sep" />

      {/* Settings */}
      <button className="tray-popup-item" onClick={handleSettings}>
        <span>{t('tray.settings')}</span>
      </button>

      <div className="tray-popup-sep" />

      {/* Quit */}
      <button className="tray-popup-item" onClick={handleQuit}>
        <span>{t('tray.quit')}</span>
      </button>
    </div>
  );
};
