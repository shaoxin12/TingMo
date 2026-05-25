import React, { useState, useEffect, useCallback } from 'react';
import { useSettingsStore, TranslateLang, UILanguage } from '../../store/settings';
import { useI18n } from '../../i18n/context';
import { LLM_PROVIDERS, ASR_CLOUD_PROVIDERS, getLLMModels, getASRModels } from '../../services/llm-providers';
import { HotkeyRecorder } from './HotkeyRecorder';
import { NbSelect } from './NbSelect';
import { HomePanel } from './HomePanel';
import { DictionaryPanel } from './DictionaryPanel';
import { ModelPanel } from './ModelPanel';
import { UpdatePanel } from './UpdatePanel';
import { MicDevicePicker } from './MicDevicePicker';

type Tab = 'home' | 'dictionary' | 'model' | 'settings';

function extractModifier(hotkey: string, fallback: string): string {
  const parts = hotkey.split(' + ');
  return parts.length > 1 ? parts[parts.length - 1] : fallback;
}

const TRANS_LANGS: { value: TranslateLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
];

const LANG_OPTIONS: { value: UILanguage; label: string }[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en',    label: 'English' },
  { value: 'ja',    label: '日本語' },
  { value: 'ko',    label: '한국어' },
];

export const SettingsWindow: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const { t } = useI18n();
  const {
    asrProvider, setAsrProvider,
    hotkey, setHotkey, resetHotkey,
    translateHotkey, setTranslateHotkey, resetTranslateHotkey,
    launchAtStartup, setLaunchAtStartup,
    muteOnRecord, setMuteOnRecord,
    useDictionary, setUseDictionary,
    refineEnabled, setRefineEnabled,
    llmProvider, setLlmProvider,
    llmApiKey, setLlmApiKey,
    llmModel, setLlmModel,
    llmBaseUrl, setLlmBaseUrl,
    asrCloudProvider, setAsrCloudProvider,
    asrCloudModel, setAsrCloudModel,
    asrCloudApiKey, setAsrCloudApiKey,
    selectedMicDeviceId, setSelectedMicDeviceId,
    translateTarget, setTranslateTarget,
    uiLanguage, setUiLanguage,
  } = useSettingsStore();

  // ── Test button states ─────────────────────────────────
  const [asrTesting, setAsrTesting] = useState(false);
  const [asrTestResult, setAsrTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [asrTestError, setAsrTestError] = useState('');
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [llmTestError, setLlmTestError] = useState('');

  // ── Test handlers ─────────────────────────────────────
  const handleTestAsr = useCallback(async () => {
    setAsrTesting(true);
    setAsrTestResult('idle');
    setAsrTestError('');
    try {
      await window.tingmo?.setAsrCloudApiKey(asrCloudApiKey);
      const preset = ASR_CLOUD_PROVIDERS.find((p) => p.key === asrCloudProvider);
      const result = await window.tingmo?.testAsrConnection(asrCloudProvider, asrCloudApiKey, preset?.endpoint || '');
      if (result?.ok) { setAsrTestResult('ok'); }
      else { setAsrTestResult('fail'); setAsrTestError(result?.error || t('test.failed')); }
    } catch (err: any) {
      setAsrTestResult('fail');
      setAsrTestError(err?.message || t('test.failed'));
    } finally {
      setAsrTesting(false);
    }
  }, [asrCloudProvider, asrCloudApiKey, t]);

  const handleTestLlm = useCallback(async () => {
    setLlmTesting(true);
    setLlmTestResult('idle');
    setLlmTestError('');
    try {
      await window.tingmo?.setApiKey(llmApiKey);
      const result = await window.tingmo?.testLlmConnection(llmProvider, llmApiKey, llmModel, llmBaseUrl);
      if (result?.ok) { setLlmTestResult('ok'); }
      else { setLlmTestResult('fail'); setLlmTestError(result?.error || t('test.failed')); }
    } catch (err: any) {
      setLlmTestResult('fail');
      setLlmTestError(err?.message || t('test.failed'));
    } finally {
      setLlmTesting(false);
    }
  }, [llmProvider, llmApiKey, llmModel, llmBaseUrl, t]);

  // Persist ALL settings + keys, then re-init providers IN ORDER
  useEffect(() => {
    (async () => {
      await window.tingmo?.saveLlmSettings({
        refineEnabled,
        llmProvider, llmModel, llmBaseUrl,
        llmApiKey,
        asrProvider, asrCloudProvider, asrCloudModel,
        asrCloudApiKey,
      });
      await window.tingmo?.initRefinement();
      await window.tingmo?.reinitRecognition();
    })();
  }, [refineEnabled,
      llmProvider, llmModel, llmBaseUrl, llmApiKey,
      asrProvider, asrCloudProvider, asrCloudModel, asrCloudApiKey]);

  useEffect(() => {
    window.tingmo?.setUiLanguage(uiLanguage);
  }, [uiLanguage]);

  // Sync tray menu changes (mute-on-record, record mode) back to Zustand
  useEffect(() => {
    return (window.tingmo as any)?.onSettingsChanged?.((data: { muteOnRecord?: boolean; recordMode?: string }) => {
      if (typeof data.muteOnRecord === 'boolean') setMuteOnRecord(data.muteOnRecord);
      if (typeof data.recordMode === 'string') {
        // recordMode changes are handled by main process directly
      }
    });
  }, [setMuteOnRecord]);

  // Maximize state for window control button
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    return window.tingmo?.onMaximizeChange?.((maximized: boolean) => {
      setIsMaximized(maximized);
    });
  }, []);

  const minimizeWindow = () => window.tingmo?.minimizeWindow();
  const toggleMaximize = () => window.tingmo?.maximizeWindow();
  const closeWindow = () => window.tingmo?.closeWindow();

  const navItems: { key: Tab; label: string }[] = [
    { key: 'home',       label: t('nav.home') },
    { key: 'dictionary', label: t('nav.dictionary') },
    { key: 'model',      label: t('nav.model') },
    { key: 'settings',   label: t('nav.settings') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>
      <div className="nb-titlebar">
        <div className="nb-titlebar-brand">
          <img className="nb-titlebar-logo" src="./icon.png" alt="" />
          <span>TingMo</span>
        </div>
        <div className="nb-titlebar-controls">
          <button className="nb-win-btn" onClick={minimizeWindow}>
            <svg viewBox="0 0 16 16"><rect x="3" y="12" width="10" height="1.5" fill="currentColor" /></svg>
          </button>
          <button className="nb-win-btn" onClick={toggleMaximize}>
            {isMaximized ? (
              <svg viewBox="0 0 16 16"><rect x="3" y="5" width="7" height="7" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" /><rect x="6" y="3" width="7" height="7" rx="0.5" fill="#fff" stroke="currentColor" strokeWidth="1.5" /></svg>
            ) : (
              <svg viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
            )}
          </button>
          <button className="nb-win-btn nb-win-close" onClick={closeWindow}>
            <svg viewBox="0 0 16 16"><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" /><line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" /></svg>
          </button>
        </div>
      </div>
      <div className="nb-shell" style={{ height: 'calc(100vh - 36px)' }}>
        <nav className="nb-sidebar">
          <div className="nb-sidebar-top">
            <div className="nb-sidebar-nav">
            {navItems.map((item) => (
              <button key={item.key} className={`nb-nav-item ${activeTab === item.key ? 'active' : ''}`} onClick={() => setActiveTab(item.key)}>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="nb-sidebar-bottom"><div className="nb-sidebar-ver">V0.3.0</div></div>
      </nav>

      <main className="nb-main">
        {activeTab === 'home' && <HomePanel />}
        {activeTab === 'dictionary' && <DictionaryPanel />}

        {activeTab === 'model' && (
          <>
            {/* ASR Model */}
            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('model.asrSection')}</span></h2>
              <div className="nb-card">
                <div className="nb-row">
                  <span className="nb-label">{t('settings.voiceMode')}</span>
                  <div className="nb-segmented">
                    <button className={`nb-seg ${asrProvider === 'local' ? 'active' : ''}`} onClick={() => setAsrProvider('local')}>{t('settings.voiceMode.local')}</button>
                    <button className={`nb-seg ${asrProvider === 'cloud' ? 'active' : ''}`} onClick={() => setAsrProvider('cloud')}>{t('settings.voiceMode.cloud')}</button>
                  </div>
                </div>
                {asrProvider === 'cloud' && (
                  <>
                    <div className="nb-hr" />
                    <div className="nb-row">
                      <span className="nb-label">{t('provider.asrService')}</span>
                      <NbSelect
                        value={asrCloudProvider}
                        options={ASR_CLOUD_PROVIDERS.map((p) => ({
                          value: p.key, label: p.name,
                          icon: <img className="nb-provider-icon" src={`./providers/${p.key}.svg`} alt="" />,
                        }))}
                        onChange={(v) => { setAsrCloudProvider(v); setAsrTestResult('idle'); }}
                      />
                    </div>
                    <div className="nb-hr" />
                    <div className="nb-row">
                      <span className="nb-label">{t('settings.model')}</span>
                      <NbSelect value={asrCloudModel}
                        options={getASRModels(asrCloudProvider).map((m) => ({ value: m, label: m }))}
                        onChange={(v) => setAsrCloudModel(v)} />
                    </div>
                    <div className="nb-hr" />
                    <div className="nb-row">
                      <span className="nb-label">{t('model.asrCloudApiKey')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                        <input className="nb-input" type="password" value={asrCloudApiKey}
                          onChange={(e) => { setAsrCloudApiKey(e.target.value); setAsrTestResult('idle'); }}
                          placeholder={t('model.asrCloudApiKeyPlaceholder')} style={{ flex: 1 }} />
                        <button
                          className={`nb-btn nb-btn-test ${asrTesting ? 'nb-btn-test-loading' : ''} ${asrTestResult === 'ok' ? 'nb-btn-test-ok' : ''} ${asrTestResult === 'fail' ? 'nb-btn-test-fail' : ''}`}
                          onClick={handleTestAsr} disabled={asrTesting || !asrCloudApiKey}
                        >
                          {asrTesting ? t('test.testing') : asrTestResult === 'ok' ? '✓' : asrTestResult === 'fail' ? '✗' : t('test.button')}
                        </button>
                      </div>
                    </div>
                    {asrTestResult === 'fail' && (
                      <>
                        <div className="nb-hr" />
                        <div className="nb-row"><span className="nb-label" /><span className="nb-value" style={{ color: '#e00', fontSize: 12 }}>{asrTestError}</span></div>
                      </>
                    )}
                  </>
                )}
                {asrProvider === 'local' && <ModelPanel />}
              </div>
            </section>

            {/* LLM Model */}
            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('model.llmSection')}</span></h2>
              <div className="nb-card">
                <div className="nb-row">
                  <span className="nb-label">{t('settings.enableRefine')}</span>
                  <label className="nb-toggle"><input type="checkbox" checked={refineEnabled} onChange={(e) => setRefineEnabled(e.target.checked)} /><span className="nb-toggle-slider" /></label>
                </div>
                {refineEnabled && (
                  <>
                    <div className="nb-hr" />
                    <div className="nb-row">
                      <span className="nb-label">{t('provider.llmService')}</span>
                      <NbSelect
                        value={llmProvider}
                        options={LLM_PROVIDERS.map((p) => ({
                          value: p.key, label: p.name,
                          icon: <img className="nb-provider-icon" src={`./providers/${p.key}.svg`} alt="" />,
                        }))}
                        onChange={(v) => { setLlmProvider(v); setLlmTestResult('idle'); }}
                      />
                    </div>
                    <div className="nb-hr" />
                    {LLM_PROVIDERS.find((p) => p.key === llmProvider)?.authType !== 'none' && (
                      <>
                        <div className="nb-row">
                          <span className="nb-label">{t('settings.apiKey')}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                            <input className="nb-input" type="password" value={llmApiKey}
                              onChange={(e) => { setLlmApiKey(e.target.value); setLlmTestResult('idle'); }}
                              placeholder={t('settings.apiKeyPlaceholder')} style={{ flex: 1 }} />
                            <button
                              className={`nb-btn nb-btn-test ${llmTesting ? 'nb-btn-test-loading' : ''} ${llmTestResult === 'ok' ? 'nb-btn-test-ok' : ''} ${llmTestResult === 'fail' ? 'nb-btn-test-fail' : ''}`}
                              onClick={handleTestLlm} disabled={llmTesting || !llmApiKey}
                            >
                              {llmTesting ? t('test.testing') : llmTestResult === 'ok' ? '✓' : llmTestResult === 'fail' ? '✗' : t('test.button')}
                            </button>
                          </div>
                        </div>
                        {llmTestResult === 'fail' && (
                          <>
                            <div className="nb-hr" />
                            <div className="nb-row"><span className="nb-label" /><span className="nb-value" style={{ color: '#e00', fontSize: 12 }}>{llmTestError}</span></div>
                          </>
                        )}
                        <div className="nb-hr" />
                      </>
                    )}
                    <div className="nb-row">
                      <span className="nb-label">{t('settings.model')}</span>
                      <NbSelect value={llmModel}
                        options={getLLMModels(llmProvider).map((m) => ({ value: m, label: m }))}
                        onChange={(v) => setLlmModel(v)} />
                    </div>
                    <div className="nb-hr" />
                    <div className="nb-row">
                      <span className="nb-label">{t('settings.apiEndpoint')}</span>
                      <input className="nb-input" type="text" value={llmBaseUrl}
                        onChange={(e) => setLlmBaseUrl(e.target.value)}
                        placeholder={t('settings.apiEndpointPlaceholder')} />
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('section.keybind')}</span></h2>
              <div className="nb-card">
                <div className="nb-row">
                  <span className="nb-label">{t('settings.voiceInput')}</span>
                  <HotkeyRecorder currentHotkey={hotkey} onHotkeyChange={(key) => { setHotkey(key); window.tingmo?.setRecordingHotkey(key); }} onReset={() => { resetHotkey(); window.tingmo?.setRecordingHotkey('右 Alt'); }} />
                </div>
                <div className="nb-hr" />
                <div className="nb-row">
                  <span className="nb-label">{t('settings.translateInput')}</span>
                  <HotkeyRecorder currentHotkey={translateHotkey}
                    onHotkeyChange={(key) => { setTranslateHotkey(key); window.tingmo?.setTranslateModifier(extractModifier(key, 'Right Shift')); }}
                    onReset={() => { resetTranslateHotkey(); window.tingmo?.setTranslateModifier('Right Shift'); }}
                  />
                </div>
              </div>
            </section>

            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('section.voice')}</span></h2>
              <div className="nb-card">
                <div className="nb-row">
                  <span className="nb-label">{t('settings.micDevice')}</span>
                  <MicDevicePicker value={selectedMicDeviceId} onChange={setSelectedMicDeviceId} />
                </div>
                <div className="nb-hr" />
                <div className="nb-row">
                  <span className="nb-label">{t('settings.muteOnRecord')}</span>
                  <label className="nb-toggle"><input type="checkbox" checked={muteOnRecord} onChange={(e) => { setMuteOnRecord(e.target.checked); window.tingmo?.setMuteOnRecord(e.target.checked); }} /><span className="nb-toggle-slider" /></label>
                </div>
              </div>
            </section>

            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('section.translate')}</span></h2>
              <div className="nb-card">
                <div className="nb-row">
                  <span className="nb-label">{t('settings.targetLanguage')}</span>
                  <NbSelect value={translateTarget} options={TRANS_LANGS} onChange={(v) => setTranslateTarget(v as TranslateLang)} />
                </div>
                <div className="nb-hr" />
                <div className="nb-row">
                  <span className="nb-label">{t('settings.translateEngine')}</span>
                  <span className="nb-value" style={{ fontSize: 12, color: refineEnabled ? '#000' : '#999' }}>
                    {refineEnabled ? `LLM (${llmModel || 'gpt-4o-mini'})` : t('settings.translateEngine.disabled')}
                  </span>
                </div>
              </div>
            </section>

            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('section.options')}</span></h2>
              <div className="nb-card">
                <div className="nb-row">
                  <span className="nb-label">{t('settings.launchAtStartup')}</span>
                  <label className="nb-toggle"><input type="checkbox" checked={launchAtStartup} onChange={(e) => setLaunchAtStartup(e.target.checked)} /><span className="nb-toggle-slider" /></label>
                </div>
                <div className="nb-hr" />
                <div className="nb-row">
                  <span className="nb-label">{t('settings.useDictionary')}</span>
                  <label className="nb-toggle"><input type="checkbox" checked={useDictionary} onChange={(e) => setUseDictionary(e.target.checked)} /><span className="nb-toggle-slider" /></label>
                </div>
                <div className="nb-hr" />
                <div className="nb-row">
                  <span className="nb-label">{t('settings.uiLanguage')}</span>
                  <NbSelect value={uiLanguage} options={LANG_OPTIONS} onChange={(v) => setUiLanguage(v as UILanguage)} />
                </div>
              </div>
            </section>

            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('section.about')}</span></h2>
              <div className="nb-card">
                <p className="nb-about-name">{t('about.appName')}</p>
                <p className="nb-about-desc">{t('about.description')}</p>
                <div className="nb-meta">
                  <span>SenseVoice</span><span className="meta-dot">·</span>
                  <span>sherpa-onnx</span><span className="meta-dot">·</span>
                  <span>Electron</span><span className="meta-dot">·</span>
                  <span>React</span>
                </div>
              </div>
            </section>

            <section className="nb-section">
              <h2 className="nb-section-title"><span className="nb-tag accent">{t('section.update')}</span></h2>
              <div className="nb-card"><UpdatePanel /></div>
            </section>
          </>
        )}
      </main>
      </div>
    </div>
  );
};
