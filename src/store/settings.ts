import { create } from 'zustand';
import { getLLMProvider, getASRCloudProvider } from '../services/llm-providers';

export type ASRProvider = 'local' | 'cloud';
export type RecordMode = 'toggle' | 'hold';
export type Language = 'zh' | 'en';
export type TranslateLang = 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de' | 'es';
export type UILanguage = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko';

export interface DictEntry {
  word: string;
  replace: string;
}

export interface SettingsState {
  asrProvider: ASRProvider;
  recordMode: RecordMode;
  language: Language;
  hotkey: string;
  translateHotkey: string;
  launchAtStartup: boolean;
  muteOnRecord: boolean;
  useDictionary: boolean;
  translateTarget: TranslateLang;
  dictionary: DictEntry[];
  refineEnabled: boolean;

  // LLM — provider-aware
  llmProvider: string;
  llmApiKey: string;
  llmModel: string;
  llmBaseUrl: string;

  // ASR cloud — independent from LLM
  asrCloudProvider: string;
  asrCloudModel: string;
  asrCloudApiKey: string;
  selectedMicDeviceId: string;
  uiLanguage: UILanguage;
  _hydrated: boolean;

  setAsrProvider: (p: ASRProvider) => void;
  setRecordMode: (mode: RecordMode) => void;
  setLanguage: (lang: Language) => void;
  setHotkey: (key: string) => void;
  setTranslateHotkey: (key: string) => void;
  setLaunchAtStartup: (enabled: boolean) => void;
  setMuteOnRecord: (enabled: boolean) => void;
  setUseDictionary: (enabled: boolean) => void;
  setTranslateTarget: (lang: TranslateLang) => void;
  addDictEntry: (entry: DictEntry) => void;
  removeDictEntry: (index: number) => void;
  resetHotkey: () => void;
  resetTranslateHotkey: () => void;
  setRefineEnabled: (enabled: boolean) => void;

  setLlmProvider: (p: string) => void;
  setLlmApiKey: (key: string) => void;
  setLlmModel: (model: string) => void;
  setLlmBaseUrl: (url: string) => void;

  setAsrCloudProvider: (p: string) => void;
  setAsrCloudModel: (model: string) => void;
  setAsrCloudApiKey: (key: string) => void;
  setSelectedMicDeviceId: (id: string) => void;
  setUiLanguage: (lang: UILanguage) => void;
  hydrate: () => Promise<void>;
}

const DEFAULT_HOTKEY = '右 Alt';
const DEFAULT_TRANSLATE_HOTKEY = '右 Alt + 右 Shift';

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(state: SettingsState): void {
  if (!state._hydrated) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const w = window as any;
    if (w.tingmo?.saveAppSettings) {
      w.tingmo.saveAppSettings({
        asrProvider: state.asrProvider,
        recordMode: state.recordMode,
        language: state.language,
        hotkey: state.hotkey,
        translateHotkey: state.translateHotkey,
        launchAtStartup: state.launchAtStartup,
        muteOnRecord: state.muteOnRecord,
        useDictionary: state.useDictionary,
        translateTarget: state.translateTarget,
        dictionary: state.dictionary,
        refineEnabled: state.refineEnabled,
        selectedMicDeviceId: state.selectedMicDeviceId,
        uiLanguage: state.uiLanguage,
        llmProvider: state.llmProvider,
        llmModel: state.llmModel,
        llmBaseUrl: state.llmBaseUrl,
        llmApiKey: state.llmApiKey,
        asrCloudProvider: state.asrCloudProvider,
        asrCloudModel: state.asrCloudModel,
        asrCloudApiKey: state.asrCloudApiKey,
      });
    }
  }, 300);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  asrProvider: 'local',
  recordMode: 'toggle',
  language: 'zh',
  hotkey: DEFAULT_HOTKEY,
  translateHotkey: DEFAULT_TRANSLATE_HOTKEY,
  launchAtStartup: false,
  muteOnRecord: true,
  useDictionary: true,
  translateTarget: 'en',
  dictionary: [],
  refineEnabled: false,

  llmProvider: 'openai',
  llmApiKey: '',
  llmModel: 'gpt-4o-mini',
  llmBaseUrl: 'https://api.openai.com/v1',

  asrCloudProvider: 'openai',
  asrCloudModel: 'whisper-1',
  asrCloudApiKey: '',
  selectedMicDeviceId: '',
  uiLanguage: 'zh-CN',
  _hydrated: false,

  setAsrProvider: (p) => { set({ asrProvider: p }); schedulePersist(get()); },
  setRecordMode: (mode) => { set({ recordMode: mode }); schedulePersist(get()); },
  setLanguage: (lang) => { set({ language: lang }); schedulePersist(get()); },
  setHotkey: (key) => { set({ hotkey: key }); schedulePersist(get()); },
  setTranslateHotkey: (key) => { set({ translateHotkey: key }); schedulePersist(get()); },
  setLaunchAtStartup: (enabled) => { set({ launchAtStartup: enabled }); schedulePersist(get()); },
  setMuteOnRecord: (enabled) => { set({ muteOnRecord: enabled }); schedulePersist(get()); },
  setUseDictionary: (enabled) => { set({ useDictionary: enabled }); schedulePersist(get()); },
  setTranslateTarget: (lang) => { set({ translateTarget: lang }); schedulePersist(get()); },
  addDictEntry: (entry) => { set((s) => ({ dictionary: [...s.dictionary, entry] })); schedulePersist(get()); },
  removeDictEntry: (index) => { set((s) => ({ dictionary: s.dictionary.filter((_, i) => i !== index) })); schedulePersist(get()); },
  resetHotkey: () => { set({ hotkey: DEFAULT_HOTKEY }); schedulePersist(get()); },
  resetTranslateHotkey: () => { set({ translateHotkey: DEFAULT_TRANSLATE_HOTKEY }); schedulePersist(get()); },
  setRefineEnabled: (enabled) => { set({ refineEnabled: enabled }); schedulePersist(get()); },

  setLlmProvider: (p) => {
    const preset = getLLMProvider(p);
    set({
      llmProvider: p,
      llmModel: preset?.defaultModel || 'gpt-4o-mini',
      llmBaseUrl: preset?.baseUrl || 'https://api.openai.com/v1',
    });
    schedulePersist(get());
  },
  setLlmApiKey: (key) => { set({ llmApiKey: key }); schedulePersist(get()); },
  setLlmModel: (model) => { set({ llmModel: model }); schedulePersist(get()); },
  setLlmBaseUrl: (url) => { set({ llmBaseUrl: url }); schedulePersist(get()); },

  setAsrCloudProvider: (p) => {
    const asrPreset = getASRCloudProvider(p);
    set({ asrCloudProvider: p, asrCloudModel: asrPreset?.defaultModel || 'whisper-1' });
    schedulePersist(get());
  },
  setAsrCloudModel: (model) => { set({ asrCloudModel: model }); schedulePersist(get()); },
  setAsrCloudApiKey: (key) => { set({ asrCloudApiKey: key }); schedulePersist(get()); },
  setSelectedMicDeviceId: (id) => { set({ selectedMicDeviceId: id }); schedulePersist(get()); },
  setUiLanguage: (lang) => { set({ uiLanguage: lang }); schedulePersist(get()); },

  hydrate: async () => {
    try {
      const w = window as any;
      if (!w.tingmo?.loadAppSettings) return;
      const saved = await w.tingmo.loadAppSettings();
      if (saved && Object.keys(saved).length > 0) {
        set({
          asrProvider: saved.asrProvider || 'local',
          recordMode: saved.recordMode || 'toggle',
          language: saved.language || 'zh',
          hotkey: saved.hotkey || DEFAULT_HOTKEY,
          translateHotkey: saved.translateHotkey || DEFAULT_TRANSLATE_HOTKEY,
          launchAtStartup: saved.launchAtStartup ?? false,
          muteOnRecord: saved.muteOnRecord ?? true,
          useDictionary: saved.useDictionary ?? true,
          translateTarget: saved.translateTarget || 'en',
          dictionary: saved.dictionary || [],
          refineEnabled: saved.refineEnabled ?? false,
          selectedMicDeviceId: saved.selectedMicDeviceId || '',
          uiLanguage: saved.uiLanguage || 'zh-CN',
          llmProvider: saved.llmProvider || 'openai',
          llmModel: saved.llmModel || 'gpt-4o-mini',
          llmBaseUrl: saved.llmBaseUrl || 'https://api.openai.com/v1',
          llmApiKey: saved.llmApiKey || '',
          asrCloudProvider: saved.asrCloudProvider || 'openai',
          asrCloudModel: saved.asrCloudModel || 'whisper-1',
          asrCloudApiKey: saved.asrCloudApiKey || '',
        });
      }
    } catch (err) {
      console.error('[Settings] Failed to hydrate:', err);
    } finally {
      set({ _hydrated: true });
    }
  },
}));

