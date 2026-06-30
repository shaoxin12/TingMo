import React, { useEffect, useState, useRef } from 'react';
import { useI18n } from '../../i18n/context';
import pkg from '../../../package.json';

type CheckState = 'idle' | 'checking' | 'ok' | 'fail';

/** Detect a version string like "v0.4.1" or "v1.2.3-beta" in text */
const HAS_VERSION = /v\d+\.\d+/;

export const UpdatePanel: React.FC = () => {
  const { t } = useI18n();
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const mountedRef = useRef(true);

  // Active check on mount — gives correct initial state regardless of auto-updater events
  useEffect(() => {
    mountedRef.current = true;
    doCheck();
    return () => { mountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for real-time auto-updater events (background check, download progress, etc.)
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const unsub1 = window.tingmo?.onUpdateAvailable?.((data) => {
      if (!mountedRef.current) return;
      setCheckState('ok');
      // If the detected version matches current, treat as up-to-date
      if (data.version === pkg.version) {
        setStatusMsg(t('update.upToDate'));
      } else {
        setStatusMsg(t('update.available') + ' (V' + data.version + ')');
      }
    });
    if (unsub1) unsubs.push(unsub1);

    const unsub2 = window.tingmo?.onUpdateProgress?.((data) => {
      if (!mountedRef.current) return;
      setDownloadPercent(data.percent);
    });
    if (unsub2) unsubs.push(unsub2);

    const unsub3 = window.tingmo?.onUpdateDownloaded?.(() => {
      if (!mountedRef.current) return;
      setDownloading(false);
      setUpdateReady(true);
      setStatusMsg('');
    });
    if (unsub3) unsubs.push(unsub3);

    const unsub4 = window.tingmo?.onUpdateNotAvailable?.(() => {
      if (!mountedRef.current) return;
      setCheckState('ok');
      setStatusMsg(t('update.upToDate'));
    });
    if (unsub4) unsubs.push(unsub4);

    return () => unsubs.forEach((fn) => fn());
  }, [t]);

  const doCheck = async () => {
    setCheckState('checking');
    setStatusMsg('');
    try {
      const result = await window.tingmo?.checkForUpdates();
      if (!mountedRef.current) return;
      if (result?.updateAvailable && result.version !== pkg.version) {
        setCheckState('ok');
        setStatusMsg(t('update.available') + ' (V' + result.version + ')');
      } else if (result?.updateAvailable && result.version === pkg.version) {
        setCheckState('ok');
        setStatusMsg(t('update.upToDate'));
      } else {
        setCheckState('ok');
        setStatusMsg(t('update.upToDate'));
      }
    } catch {
      if (!mountedRef.current) return;
      setCheckState('fail');
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const result = await window.tingmo?.downloadUpdate();
      if (result && !result.success) {
        setDownloading(false);
        setCheckState('fail');
        setStatusMsg(t('update.error'));
      }
    } catch {
      setDownloading(false);
      setCheckState('fail');
      setStatusMsg(t('update.error'));
    }
  };

  const handleInstall = () => {
    window.tingmo?.installUpdate();
  };

  const btnClass = `nb-btn nb-btn-test ${checkState === 'checking' ? 'nb-btn-test-loading' : ''} ${checkState === 'ok' ? 'nb-btn-test-ok' : ''} ${checkState === 'fail' ? 'nb-btn-test-fail' : ''}`;

  const showDownload = checkState === 'ok' && HAS_VERSION.test(statusMsg);

  return (
    <div>
      <div className="nb-row" style={{ alignItems: 'center' }}>
        <span className="nb-label" style={{ flex: 'none' }}>{t('update.currentVersion')} <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', marginLeft: 4 }}>V{pkg.version}</span></span>
        {downloading && (
          <div style={{ flex: 1, height: 3, background: '#eee', borderRadius: 1, marginRight: 8 }}>
            <div style={{ width: downloadPercent + '%', height: '100%', background: '#FF5A1F', borderRadius: 1, transition: 'width 0.3s' }} />
          </div>
        )}
        {checkState === 'ok' && statusMsg && (
          <span style={{ color: '#34a853', fontSize: 11, flex: 1 }}>{statusMsg}</span>
        )}
        <div style={{ flex: 1 }} />
        {checkState === 'fail' && (
          <span style={{ color: '#e00', fontSize: 11, marginRight: 6 }}>{t('update.error')}</span>
        )}
        {!updateReady ? (
          <>
            {!showDownload && (
              <button className={btnClass} onClick={doCheck} disabled={checkState === 'checking'}>
                {checkState === 'checking' ? t('update.checking') : checkState === 'fail' ? '✗' : checkState === 'ok' ? '✓' : t('update.check')}
              </button>
            )}
            {showDownload && (
              <button className="nb-btn" onClick={handleDownload} disabled={downloading} style={{ fontSize: 11, padding: '3px 10px', flex: 'none' }}>
                {downloading ? t('update.downloading') + '...' : t('update.download')}
              </button>
            )}
          </>
        ) : (
          <button className="nb-btn" onClick={handleInstall} style={{ background: '#FF5A1F', color: '#fff', border: 'none', fontSize: 11, padding: '3px 10px', flex: 'none' }}>
            {t('update.install')}
          </button>
        )}
      </div>
    </div>
  );
};
