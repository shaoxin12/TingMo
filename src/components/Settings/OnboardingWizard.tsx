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
  const asrCloudApiKey = useSettingsStore((s) => s.asrCloudApiKey);
  const setAsrCloudApiKey = useSettingsStore((s) => s.setAsrCloudApiKey);
  const llmApiKey = useSettingsStore((s) => s.llmApiKey);
  const setLlmApiKey = useSettingsStore((s) => s.setLlmApiKey);
  const modelStatus = useModelStore((s) => s.status);
  const modelProgress = useModelStore((s) => s.progress);
  const setModelProgress = useModelStore((s) => s.setProgress);
  const setModelError = useModelStore((s) => s.setError);
  const setModelReady = useModelStore((s) => s.setReady);

  // Both modes have 4 steps: Welcome → Hotkey → Mode → Configure (API keys or model download)
  const maxStep = 3;

  const stepTitles = [
    t('onboarding.welcomeTitle'),
    t('onboarding.hotkeyTitle'),
    t('onboarding.modeTitle'),
    asrProvider === 'cloud' ? t('onboarding.apiKeyTitle') : t('onboarding.modelTitle'),
  ];
  const stepDescs = [
    t('onboarding.welcomeDesc'),
    t('onboarding.hotkeyDesc'),
    '',
    asrProvider === 'cloud' ? t('onboarding.apiKeyDesc') : t('onboarding.modelDesc'),
  ];

  const [modelChecked, setModelChecked] = useState(false);

  // Check model status on mount and when reaching step 3 for local mode
  useEffect(() => {
    if (asrProvider !== 'cloud') {
      setModelChecked(false);
      window.tingmo?.checkModel().then((r) => {
        if (r?.exists) {
          setModelReady(r.path || '');
        }
        setModelChecked(true);
      }).catch(() => {
        setModelChecked(true);
      });
    }
  }, [asrProvider, step === 3]);

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
  const showModelSection = step === 3 && asrProvider !== 'cloud';

  const handleStart = () => {
    // Validate required fields in cloud mode
    if (asrProvider === 'cloud') {
      const trimmedAsr = asrCloudApiKey.trim();
      if (!trimmedAsr) return;
      // Ensure store has trimmed values before completing
      if (trimmedAsr !== asrCloudApiKey) setAsrCloudApiKey(trimmedAsr);
      const trimmedLlm = llmApiKey.trim();
      if (trimmedLlm !== llmApiKey) setLlmApiKey(trimmedLlm);
    }
    onComplete();
  };

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

      {step === 3 && asrProvider === 'cloud' && (
        <div style={{ maxWidth: 400, width: '100%' }}>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 1.6 }}>
            {stepDescs[3]}
          </p>
          <div style={{ textAlign: 'left' }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('model.asrCloudApiKey')}
              </label>
              <input
                type="password"
                value={asrCloudApiKey}
                onChange={(e) => setAsrCloudApiKey(e.target.value)}
                placeholder={t('model.asrCloudApiKeyPlaceholder')}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {t('settings.apiKey')}
              </label>
              <input
                type="password"
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder={t('settings.apiKeyPlaceholder')}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd',
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <p style={{ fontSize: 11, color: '#999', marginTop: 8 }}>
              {t('onboarding.apiKeyHint')}
            </p>
          </div>
        </div>
      )}

      {showModelSection && (
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
            onClick={handleStart}
            disabled={isDownloading || (asrProvider === 'cloud' && !asrCloudApiKey.trim())}
            style={{ background: (isDownloading || (asrProvider === 'cloud' && !asrCloudApiKey.trim())) ? '#ccc' : '#FF5A1F', color: '#fff', border: 'none' }}
          >
            {t('onboarding.start')}
          </button>
        )}
      </div>

      {/* Hide skip button while downloading to prevent accidental skip mid-download */}
      {step < maxStep && !isDownloading && (
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
