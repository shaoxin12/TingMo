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
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { dismissRef.current = true; window.tingmo?.closeTrayPopup(); }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
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
      <button className={`tray-popup-row ${asrProvider === 'local' ? 'active' : ''}`}
        onClick={() => handleAsrProvider('local')}>
        <span className="tray-popup-dot" />
        {t('tray.voiceMode.local')}
      </button>
      <button className={`tray-popup-row ${asrProvider === 'cloud' ? 'active' : ''}`}
        onClick={() => handleAsrProvider('cloud')}>
        <span className="tray-popup-dot" />
        {t('tray.voiceMode.cloud')}
      </button>

      <div className="tray-popup-sep" />

      <button className={`tray-popup-row ${recordMode === 'toggle' ? 'active' : ''}`}
        onClick={() => handleRecordMode('toggle')}>
        <span className="tray-popup-dot"></span>
        {t('tray.recordMode.toggle')}
      </button>
      <button className={`tray-popup-row ${recordMode === 'hold' ? 'active' : ''}`}
        onClick={() => handleRecordMode('hold')}>
        <span className="tray-popup-dot" />
        {t('tray.recordMode.hold')}
      </button>

      <div className="tray-popup-sep" />

      <button className="tray-popup-row" onClick={() => handleMuteOnRecord(!muteOnRecord)}>
        <span className="tray-popup-check">{muteOnRecord ? '✓' : ''}</span>
        {t('tray.muteOnRecord')}
      </button>

      <div className="tray-popup-sep" />

      <button className="tray-popup-row" onClick={handleSettings}>
        {t('tray.settings')}
      </button>

      <div className="tray-popup-sep" />

      <button className="tray-popup-row" onClick={handleQuit}>
        {t('tray.quit')}
      </button>
    </div>
  );
};
