import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/context';
import pkg from '../../../package.json';

type CheckState = 'idle' | 'checking' | 'ok' | 'fail';

const HAS_VERSION = /v\d+\.\d+/;

export const UpdatePanel: React.FC = () => {
  const { t } = useI18n();
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);

  // Only listen for download progress and completion — user must manually check
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const unsub1 = window.tingmo?.onUpdateProgress?.((data) => {
      setDownloadPercent(data.percent);
    });
    if (unsub1) unsubs.push(unsub1);

    const unsub2 = window.tingmo?.onUpdateDownloaded?.(() => {
      setDownloading(false);
      setUpdateReady(true);
      setStatusMsg('');
    });
    if (unsub2) unsubs.push(unsub2);

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleCheck = async () => {
    setCheckState('checking');
    setStatusMsg('');
    try {
      const result = await window.tingmo?.checkForUpdates();
      if (result?.updateAvailable && result.version !== pkg.version) {
        setCheckState('ok');
        setStatusMsg(t('update.available') + ' (V' + result.version + ')');
      } else {
        setCheckState('ok');
        setStatusMsg(t('update.upToDate'));
      }
    } catch {
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
              <button className={btnClass} onClick={handleCheck} disabled={checkState === 'checking'}>
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
