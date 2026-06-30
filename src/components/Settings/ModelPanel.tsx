import React, { useEffect } from 'react';
import { useI18n } from '../../i18n/context';
import { useModelStore } from '../../store/model';

export const ModelPanel: React.FC = () => {
  const { t } = useI18n();
  const { status, progress, errorMessage, modelPath, setProgress, setError, setReady, setStatus } = useModelStore();

  useEffect(() => {
    window.tingmo?.checkModel().then((result) => {
      if (result?.exists) {
        setReady(result.path || '');
      }
    }).catch(() => { /* ignore */ });

    const unsub = window.tingmo?.onModelProgress((data) => {
      if (data.stage === 'done') {
        window.tingmo?.checkModel().then((r) => {
          if (r?.exists) setReady(r.path || '');
        });
      } else if (data.stage === 'error') {
        setError(data.error || t('model.error'));
      } else {
        setProgress(data.stage, data.percent);
      }
    });

    return () => { if (unsub) unsub(); };
  }, [t, setProgress, setError, setReady]);

  const handleDownload = async () => {
    setStatus('downloading');
    try {
      const result = await window.tingmo?.ensureModel();
      if (result?.ok) {
        setReady(result.path || '');
      } else {
        setError(result?.error || t('model.error'));
      }
    } catch {
      setError(t('model.error'));
    }
  };

  return (
    <>
      <div className="nb-hr" />
      {status === 'ready' ? (
        <div className="nb-row">
          <span className="nb-label">{t('model.ready')}</span>
          <span className="nb-value" style={{ fontSize: 11, fontFamily: 'monospace', opacity: 0.6, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
            onClick={() => window.tingmo?.openFolder(modelPath)}
            title={t('model.openFolder')}>
            {modelPath}
          </span>
        </div>
      ) : status === 'error' ? (
        <>
          <div className="nb-row">
            <span className="nb-label">{t('model.error')}</span>
            <span className="nb-value" style={{ fontSize: 12, color: '#e00' }}>{errorMessage}</span>
          </div>
          <div className="nb-hr" />
          <div className="nb-row">
            <button className="nb-btn" onClick={handleDownload}>{t('model.retry')}</button>
          </div>
        </>
      ) : status === 'downloading' || status === 'extracting' ? (
        <>
          <div className="nb-row">
            <span className="nb-label">
              {status === 'extracting' ? t('model.extracting') : t('model.downloading')}
            </span>
            <span className="nb-value" style={{ fontSize: 12 }}>{Math.round(progress)}%</span>
          </div>
          <div className="nb-hr" />
          <div className="nb-row">
            <div style={{ width: '100%', height: 4, background: '#eee', borderRadius: 2 }}>
              <div style={{
                width: progress + '%', height: '100%', background: '#FF5A1F', borderRadius: 2,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="nb-row">
            <span className="nb-label">{t('model.notDownloaded')}</span>
            <span className="nb-value" style={{ fontSize: 12, opacity: 0.6 }}>{t('model.sizeValue')}</span>
          </div>
          <div className="nb-hr" />
          <div className="nb-row">
            <button className="nb-btn" onClick={handleDownload}>{t('model.download')}</button>
          </div>
        </>
      )}
    </>
  );
};
