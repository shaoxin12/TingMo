import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n/context';
import { useSettingsStore } from '../../store/settings';
import { useModelStore } from '../../store/model';

interface Props {
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<Props> = ({ onComplete }) => {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const asrProvider = useSettingsStore((s) => s.asrProvider);
  const setAsrProvider = useSettingsStore((s) => s.setAsrProvider);
  const modelStatus = useModelStore((s) => s.status);
  const modelProgress = useModelStore((s) => s.progress);
  const setModelProgress = useModelStore((s) => s.setProgress);
  const setModelError = useModelStore((s) => s.setError);
  const setModelReady = useModelStore((s) => s.setReady);

  const hasModelStep = asrProvider === 'local';
  const maxStep = hasModelStep ? 3 : 2;

  const stepTitles = [
    t('onboarding.welcomeTitle'),
    t('onboarding.hotkeyTitle'),
    t('onboarding.modeTitle'),
    t('onboarding.modelTitle'),
  ];
  const stepDescs = [
    t('onboarding.welcomeDesc'),
    t('onboarding.hotkeyDesc'),
    '',
    t('onboarding.modelDesc'),
  ];

  useEffect(() => {
    const unsub = window.tingmo?.onModelProgress((data) => {
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
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            {t('onboarding.modeDesc')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => { setAsrProvider('local'); }}
              style={{
                padding: '16px 24px', borderRadius: 8, border: asrProvider === 'local' ? '2px solid #000' : '2px solid #ddd',
                background: asrProvider === 'local' ? '#000' : '#fff',
                color: asrProvider === 'local' ? '#fff' : '#000',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              {t('onboarding.local')}
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4, opacity: 0.7 }}>
                {t('onboarding.localDesc')}
              </div>
            </button>
            <button
              onClick={() => { setAsrProvider('cloud'); }}
              style={{
                padding: '16px 24px', borderRadius: 8, border: asrProvider === 'cloud' ? '2px solid #000' : '2px solid #ddd',
                background: asrProvider === 'cloud' ? '#000' : '#fff',
                color: asrProvider === 'cloud' ? '#fff' : '#000',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
              }}
            >
              {t('onboarding.cloud')}
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 4, opacity: 0.7 }}>
                {t('onboarding.cloudDesc')}
              </div>
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ maxWidth: 400 }}>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
            {stepDescs[3]}
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
            <p style={{ fontSize: 14, color: '#0a0', fontWeight: 600 }}>{t('model.ready')}</p>
          ) : modelStatus === 'error' ? (
            <p style={{ fontSize: 14, color: '#e00' }}>{t('model.error')}</p>
          ) : null}
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

      {step < maxStep && (
        <button
          onClick={onComplete}
          style={{ marginTop: 16, background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12 }}
        >
          {t('onboarding.skip')}
        </button>
      )}
    </div>
  );
};
