import React, { useState, useCallback } from 'react';
import { useI18n } from '../../i18n/context';
import { useSettingsStore } from '../../store/settings';
import { LLM_PROVIDERS, ASR_CLOUD_PROVIDERS, getLLMModels, getASRModels, getModelLabel } from '../../services/llm-providers';

interface Props {
  /** Compact mode for onboarding wizard (hides test buttons, smaller layout) */
  compact?: boolean;
}

export const CloudConfigPanel: React.FC<Props> = ({ compact = false }) => {
  const { t } = useI18n();
  const asrCloudProvider = useSettingsStore((s) => s.asrCloudProvider);
  const setAsrCloudProvider = useSettingsStore((s) => s.setAsrCloudProvider);
  const asrCloudModel = useSettingsStore((s) => s.asrCloudModel);
  const setAsrCloudModel = useSettingsStore((s) => s.setAsrCloudModel);
  const asrCloudApiKey = useSettingsStore((s) => s.asrCloudApiKey);
  const setAsrCloudApiKey = useSettingsStore((s) => s.setAsrCloudApiKey);
  const llmProvider = useSettingsStore((s) => s.llmProvider);
  const setLlmProvider = useSettingsStore((s) => s.setLlmProvider);
  const llmModel = useSettingsStore((s) => s.llmModel);
  const setLlmModel = useSettingsStore((s) => s.setLlmModel);
  const llmApiKey = useSettingsStore((s) => s.llmApiKey);
  const setLlmApiKey = useSettingsStore((s) => s.setLlmApiKey);
  const llmBaseUrl = useSettingsStore((s) => s.llmBaseUrl);

  const [asrTesting, setAsrTesting] = useState(false);
  const [asrTestOk, setAsrTestOk] = useState<boolean | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestOk, setLlmTestOk] = useState<boolean | null>(null);

  const handleTestAsr = useCallback(async () => {
    setAsrTesting(true);
    setAsrTestOk(null);
    try {
      await window.tingmo?.setAsrCloudApiKey(asrCloudApiKey);
      const preset = ASR_CLOUD_PROVIDERS.find((p) => p.key === asrCloudProvider);
      const result = await window.tingmo?.testAsrConnection(asrCloudProvider, asrCloudApiKey, preset?.endpoint || '');
      setAsrTestOk(result?.ok ?? false);
    } catch {
      setAsrTestOk(false);
    } finally {
      setAsrTesting(false);
    }
  }, [asrCloudProvider, asrCloudApiKey]);

  const handleTestLlm = useCallback(async () => {
    setLlmTesting(true);
    setLlmTestOk(null);
    try {
      await window.tingmo?.setApiKey(llmApiKey);
      const result = await window.tingmo?.testLlmConnection(llmProvider, llmApiKey, llmModel, llmBaseUrl);
      setLlmTestOk(result?.ok ?? false);
    } catch {
      setLlmTestOk(false);
    } finally {
      setLlmTesting(false);
    }
  }, [llmProvider, llmApiKey, llmModel, llmBaseUrl]);

  const inputStyle = compact ? {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd',
    fontSize: 14, outline: 'none' as const, boxSizing: 'border-box' as const,
  } : {};

  return (
    <div style={compact ? { maxWidth: 420, width: '100%' } : undefined}>
      {/* ── ASR Cloud ─────────────────────────────── */}
      <div style={{ marginBottom: compact ? 20 : 0 }}>
        {!compact && <div className="nb-hr" />}
        <div className={compact ? '' : 'nb-row'} style={compact ? { marginBottom: 14 } : undefined}>
          <span className={compact ? '' : 'nb-label'} style={compact ? { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } : undefined}>
            {t('provider.asrService')}
          </span>
          <select
            value={asrCloudProvider}
            onChange={(e) => { setAsrCloudProvider(e.target.value as any); setAsrTestOk(null); }}
            style={compact ? { ...inputStyle, cursor: 'pointer' } : {}}
          >
            {ASR_CLOUD_PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </div>

        {!compact && <div className="nb-hr" />}
        <div className={compact ? '' : 'nb-row'} style={compact ? { marginBottom: 14 } : undefined}>
          <span className={compact ? '' : 'nb-label'} style={compact ? { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } : undefined}>
            {t('settings.model')}
          </span>
          <select
            value={asrCloudModel}
            onChange={(e) => setAsrCloudModel(e.target.value)}
            style={compact ? { ...inputStyle, cursor: 'pointer' } : {}}
          >
            {getASRModels(asrCloudProvider).map((m) => (
              <option key={m} value={m}>{getModelLabel(m)}</option>
            ))}
          </select>
        </div>

        {!compact && <div className="nb-hr" />}
        <div className={compact ? '' : 'nb-row'} style={compact ? { marginBottom: 8 } : undefined}>
          <span className={compact ? '' : 'nb-label'} style={compact ? { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } : undefined}>
            {t('model.asrCloudApiKey')}
          </span>
          <div style={compact ? { display: 'flex', gap: 8 } : { display: 'flex', flex: 1 }}>
            <input
              className={compact ? '' : 'nb-input'}
              type="password"
              value={asrCloudApiKey}
              onChange={(e) => { setAsrCloudApiKey(e.target.value); setAsrTestOk(null); }}
              placeholder={t('model.asrCloudApiKeyPlaceholder')}
              style={compact ? { ...inputStyle, flex: 1 } : { flex: 1 }}
            />
            {!compact && (
              <button className="nb-btn nb-btn-test"
                onClick={handleTestAsr} disabled={asrTesting || !asrCloudApiKey}
                style={{ flex: 'none' }}>
                {asrTesting ? '...' : asrTestOk === true ? '✓' : asrTestOk === false ? '✗' : t('update.check')}
              </button>
            )}
          </div>
        </div>
        {compact && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={handleTestAsr} disabled={asrTesting || !asrCloudApiKey}
              style={{
                fontSize: 12, padding: '4px 14px', borderRadius: 6,
                border: asrTestOk === true ? '1px solid #34a853' : asrTestOk === false ? '1px solid #e00' : '1px solid #ddd',
                background: asrTestOk === true ? '#e8f5e9' : asrTestOk === false ? '#fdecea' : '#f5f5f5',
                color: asrTestOk === true ? '#34a853' : asrTestOk === false ? '#e00' : '#666',
                cursor: asrTesting ? 'default' : 'pointer',
                marginTop: 4,
              }}
            >
              {asrTesting ? '...' : asrTestOk === true ? '✓ ' + t('update.upToDate') : asrTestOk === false ? '✗ ' + t('update.error') : t('test.button')}
            </button>
          </div>
        )}
      </div>

      {/* ── LLM ────────────────────────────────────── */}
      <div>
        {!compact && <div className="nb-hr" />}
        <div className={compact ? '' : 'nb-row'} style={compact ? { marginBottom: 14 } : undefined}>
          <span className={compact ? '' : 'nb-label'} style={compact ? { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } : undefined}>
            {t('provider.llmService')}
          </span>
          <select
            value={llmProvider}
            onChange={(e) => { setLlmProvider(e.target.value as any); setLlmTestOk(null); }}
            style={compact ? { ...inputStyle, cursor: 'pointer' } : {}}
          >
            {LLM_PROVIDERS.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </div>

        {!compact && <div className="nb-hr" />}
        <div className={compact ? '' : 'nb-row'} style={compact ? { marginBottom: 14 } : undefined}>
          <span className={compact ? '' : 'nb-label'} style={compact ? { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } : undefined}>
            {t('settings.model')}
          </span>
          <select
            value={llmModel}
            onChange={(e) => setLlmModel(e.target.value)}
            style={compact ? { ...inputStyle, cursor: 'pointer' } : {}}
          >
            {getLLMModels(llmProvider).map((m) => (
              <option key={m} value={m}>{getModelLabel(m)}</option>
            ))}
          </select>
        </div>

        {!compact && <div className="nb-hr" />}
        <div className={compact ? '' : 'nb-row'} style={compact ? { marginBottom: 8 } : undefined}>
          <span className={compact ? '' : 'nb-label'} style={compact ? { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 } : undefined}>
            {t('settings.apiKey')}
          </span>
          <div style={compact ? { display: 'flex', gap: 8 } : { display: 'flex', flex: 1 }}>
            <input
              className={compact ? '' : 'nb-input'}
              type="password"
              value={llmApiKey}
              onChange={(e) => { setLlmApiKey(e.target.value); setLlmTestOk(null); }}
              placeholder={t('settings.apiKeyPlaceholder')}
              style={compact ? { ...inputStyle, flex: 1 } : { flex: 1 }}
            />
            {!compact && (
              <button className="nb-btn nb-btn-test"
                onClick={handleTestLlm} disabled={llmTesting || !llmApiKey}
                style={{ flex: 'none' }}>
                {llmTesting ? '...' : llmTestOk === true ? '✓' : llmTestOk === false ? '✗' : t('update.check')}
              </button>
            )}
          </div>
        </div>
        {compact && (
          <button
            onClick={handleTestLlm} disabled={llmTesting || !llmApiKey}
            style={{
              fontSize: 12, padding: '4px 14px', borderRadius: 6,
              border: llmTestOk === true ? '1px solid #34a853' : llmTestOk === false ? '1px solid #e00' : '1px solid #ddd',
              background: llmTestOk === true ? '#e8f5e9' : llmTestOk === false ? '#fdecea' : '#f5f5f5',
              color: llmTestOk === true ? '#34a853' : llmTestOk === false ? '#e00' : '#666',
              cursor: llmTesting ? 'default' : 'pointer',
              marginTop: 4,
            }}
          >
            {llmTesting ? '...' : llmTestOk === true ? '✓ ' + t('update.upToDate') : llmTestOk === false ? '✗ ' + t('update.error') : t('test.button')}
          </button>
        )}
      </div>
    </div>
  );
};
