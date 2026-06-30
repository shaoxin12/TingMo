import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context';
import { useModelStore } from '../../store/model';

interface Props {
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<Props> = ({ onComplete }) => {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const modelStatus = useModelStore((s) => s.status);
  const modelProgress = useModelStore((s) => s.progress);
  const setModelProgress = useModelStore((s) => s.setProgress);
  const setModelError = useModelStore((s) => s.setError);
  const setModelReady = useModelStore((s) => s.setReady);

  // 3 steps: Welcome → Hotkey → Model download
  const maxStep = 2;

  const stepTitles = [
    t('onboarding.welcomeTitle'),
    t('onboarding.hotkeyTitle'),
    t('onboarding.modelTitle'),
  ];
  const stepDescs = [
    t('onboarding.welcomeDesc'),
    t('onboarding.hotkeyDesc'),
    t('onboarding.modelDesc'),
  ];

  const [modelChecked, setModelChecked] = useState(false);

  // Check model status on mount and when reaching step 2
  useEffect(() => {
    if (step === 2) {
      setModelChecked(false);
      window.tingmo?.checkModel().then((r) => {
        if (r?.exists) setModelReady(r.path || '');
        setModelChecked(true);
      }).catch(() => {
        setModelChecked(true);
      });
    }
  }, [step]);

  useEffect(() => {
    const unsub = window.tingmo?.onModelProgress((data) => {
      setModelChecked(true);
      if (data.stage === 'done') {
        window.tingmo?.checkModel().then((r) => {
          if (r?.exists) setModelReady(r.path || '');
        });
      } else if (data.stage === 'error') {
        setModelError(data.error || t('model.error'));
      } else {
        setModelProgress(data.stage, data.percent);
      }
    });
    return () => { if (unsub) unsub(); };
  }, [t, setModelProgress, setModelError, setModelReady]);

  const isDownloading = modelStatus === 'downloading' || modelStatus === 'extracting';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center',
    }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>TINGMO</span>
      </div>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {Array.from({ length: maxStep + 1 }).map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: i === step ? '#000' : i < step ? '#FF5A1F' : '#ddd',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>

      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 12px', color: '#000' }}>
        {stepTitles[step]}
      </h2>

      {step === 0 && (
        <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6, maxWidth: 400 }}>
          {stepDescs[0]}
        </p>
      )}

      {step === 1 && (
        <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8, maxWidth: 400 }}>
          <p>{stepDescs[1]}</p>
          <div style={{
            background: '#f5f5f5', borderRadius: 8, padding: '12px 20px',
            marginTop: 12, fontFamily: 'monospace', fontSize: 14,
          }}>
            <div><strong>{t('hotkey.key.rightAlt')}</strong> — {t('onboarding.voiceHotkey')}</div>
            <div style={{ marginTop: 4 }}><strong>{t('hotkey.key.rightShift')} + {t('hotkey.key.rightAlt')}</strong> — {t('onboarding.translateHotkey')}</div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ maxWidth: 400 }}>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
            {stepDescs[2]}
          </p>
          {isDownloading ? (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                {modelStatus === 'extracting' ? t('model.extracting') : t('model.downloading')} {Math.round(modelProgress)}%
              </p>
              <div style={{ width: '100%', height: 6, background: '#eee', borderRadius: 3 }}>
                <div style={{
                  width: modelProgress + '%', height: '100%', background: '#FF5A1F', borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          ) : modelStatus === 'ready' ? (
            <p style={{ fontSize: 14, color: '#0a0', fontWeight: 600 }}>✓ {t('model.ready')}</p>
          ) : modelStatus === 'error' ? (
            <p style={{ fontSize: 14, color: '#e00' }}>{t('model.error')}</p>
          ) : !modelChecked ? (
            <p style={{ fontSize: 14, color: '#999' }}>{t('model.checking')}</p>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 14, color: '#999', marginBottom: 12 }}>
                {t('model.notInstalled')}
              </p>
              <button
                className="nb-btn"
                onClick={() => {
                  setModelProgress('downloading', 0);
                  window.tingmo?.ensureModel().then((r) => {
                    if (r?.ok) {
                      window.tingmo?.checkModel().then((cr) => {
                        if (cr?.exists) setModelReady(cr.path || '');
                      });
                    } else {
                      setModelError(r?.error || t('model.error'));
                    }
                  }).catch((e) => {
                    setModelError((e as Error).message || t('model.error'));
                  });
                }}
                style={{ background: '#000', color: '#fff', border: 'none', fontSize: 13 }}
              >
                {t('model.download')}
              </button>
            </div>
          )}

          {/* Hint about switching to cloud later */}
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 20, lineHeight: 1.5 }}>
            {t('onboarding.cloudHint')}
          </p>
        </div>
      )}

      <div style={{ marginTop: 40, display: 'flex', gap: 12 }}>
        {step > 0 && (
          <button className="nb-btn" onClick={() => setStep(step - 1)}>
            {t('onboarding.back')}
          </button>
        )}
        {step < maxStep ? (
          <button className="nb-btn" onClick={() => setStep(step + 1)} style={{ background: '#000', color: '#fff', border: 'none' }}>
            {t('onboarding.next')}
          </button>
        ) : (
          <button
            className="nb-btn"
            onClick={onComplete}
            disabled={isDownloading}
            style={{ background: isDownloading ? '#ccc' : '#FF5A1F', color: '#fff', border: 'none' }}
          >
            {t('onboarding.start')}
          </button>
        )}
      </div>
    </div>
  );
};
