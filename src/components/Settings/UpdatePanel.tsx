import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/context';

export const UpdatePanel: React.FC = () => {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [updateReady, setUpdateReady] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    const unsub1 = window.tingmo?.onUpdateAvailable?.((data) => {
      setStatusMsg(t('update.available') + ' (v' + data.version + ')');
    });
    if (unsub1) unsubs.push(unsub1);

    const unsub2 = window.tingmo?.onUpdateProgress?.((data) => {
      setDownloadPercent(data.percent);
      setStatusMsg(t('update.downloading') + ' ' + Math.round(data.percent) + '%');
    });
    if (unsub2) unsubs.push(unsub2);

    const unsub3 = window.tingmo?.onUpdateDownloaded?.(() => {
      setDownloading(false);
      setUpdateReady(true);
      setStatusMsg(t('update.downloaded'));
    });
    if (unsub3) unsubs.push(unsub3);

    return () => unsubs.forEach((fn) => fn());
  }, [t]);

  const handleCheck = async () => {
    setChecking(true);
    setStatusMsg(t('update.checking'));
    try {
      const result = await window.tingmo?.checkForUpdates();
      if (result?.updateAvailable) {
        setStatusMsg(t('update.available') + ' (v' + result.version + ')');
      } else {
        setStatusMsg(t('update.upToDate'));
      }
    } catch {
      setStatusMsg(t('update.error'));
    }
    setChecking(false);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await window.tingmo?.downloadUpdate();
    } catch {
      setStatusMsg(t('update.error'));
      setDownloading(false);
    }
  };

  const handleInstall = () => {
    window.tingmo?.installUpdate();
  };

  return (
    <div>
      <div className="nb-row">
        <span className="nb-label">{t('update.currentVersion')}</span>
        <span className="nb-value" style={{ fontSize: 12, fontFamily: 'monospace' }}>V0.3.0</span>
      </div>
      {statusMsg && (
        <>
          <div className="nb-hr" />
          <div className="nb-row">
            <span className="nb-label">{t('update.status')}</span>
            <span className="nb-value" style={{ fontSize: 12 }}>{statusMsg}</span>
          </div>
        </>
      )}
      {downloading && (
        <>
          <div className="nb-hr" />
          <div className="nb-row">
            <div style={{ width: '100%', height: 4, background: '#eee', borderRadius: 2 }}>
              <div style={{ width: downloadPercent + '%', height: '100%', background: '#FF5A1F', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
          </div>
        </>
      )}
      <div className="nb-hr" />
      <div className="nb-row" style={{ gap: 8 }}>
        {!updateReady ? (
          <>
            <button className="nb-btn" onClick={handleCheck} disabled={checking}>
              {checking ? t('update.checking') : t('update.check')}
            </button>
            {statusMsg.includes('v') && !statusMsg.includes(t('update.upToDate')) && (
              <button className="nb-btn" onClick={handleDownload} disabled={downloading}>
                {downloading ? t('update.downloading') + '...' : t('update.download')}
              </button>
            )}
          </>
        ) : (
          <button className="nb-btn" onClick={handleInstall} style={{ background: '#FF5A1F', color: '#fff', border: 'none' }}>
            {t('update.install')}
          </button>
        )}
      </div>
    </div>
  );
};
