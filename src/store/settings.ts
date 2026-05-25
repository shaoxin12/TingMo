import { create } from 'zustand';
import { getLLMProvider } from '../services/llm-providers';

export type ASRProvider = 'local' | 'cloud';
export type RecordMode = 'toggle' | 'hold';
export type Language = 'zh' | 'en';
export type TranslateLang = 'en' | 'zh' | 'ja' | 'ko' | 'fr' | 'de' | 'es';
export type UILanguage = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko';
export type PolishMode = 'raw' | 'light' | 'structured' | 'formal' | 'custom';

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
  asrCloudApiKey: string;
  polishMode: PolishMode;
  customPrompt: string;
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
  setAsrCloudApiKey: (key: string) => void;
  setPolishMode: (mode: PolishMode) => void;
  setCustomPrompt: (prompt: string) => void;
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
        polishMode: state.polishMode,
        customPrompt: state.customPrompt,
        selectedMicDeviceId: state.selectedMicDeviceId,
        uiLanguage: state.uiLanguage,
        llmProvider: state.llmProvider,
        asrCloudProvider: state.asrCloudProvider,
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
  asrCloudApiKey: '',
  polishMode: 'structured',
  customPrompt: '',
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
  setRefineEnabled: (enabled) => set({ refineEnabled: enabled }),

  setLlmProvider: (p) => {
    const preset = getLLMProvider(p);
    set({
      llmProvider: p,
      llmModel: preset?.defaultModel || 'gpt-4o-mini',
      llmBaseUrl: preset?.baseUrl || 'https://api.openai.com/v1',
    });
  },
  setLlmApiKey: (key) => set({ llmApiKey: key }),
  setLlmModel: (model) => set({ llmModel: model }),
  setLlmBaseUrl: (url) => set({ llmBaseUrl: url }),

  setAsrCloudProvider: (p) => set({ asrCloudProvider: p }),
  setAsrCloudApiKey: (key) => set({ asrCloudApiKey: key }),
  setPolishMode: (mode) => { set({ polishMode: mode }); schedulePersist(get()); },
  setCustomPrompt: (prompt) => { set({ customPrompt: prompt }); schedulePersist(get()); },
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
          polishMode: saved.polishMode || 'structured',
          customPrompt: saved.customPrompt || '',
          selectedMicDeviceId: saved.selectedMicDeviceId || '',
          uiLanguage: saved.uiLanguage || 'zh-CN',
          llmProvider: saved.llmProvider || 'openai',
          asrCloudProvider: saved.asrCloudProvider || 'openai',
        });
      }
    } catch (err) {
      console.error('[Settings] Failed to hydrate:', err);
    } finally {
      set({ _hydrated: true });
    }
  },
}));

