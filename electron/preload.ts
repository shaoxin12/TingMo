import { contextBridge, ipcRenderer } from 'electron';

export interface VoiceStateChange {
  state: 'idle' | 'recording' | 'recognizing' | 'refining' | 'success' | 'error';
}

export interface RecognitionDone {
  charCount: number;
  durationMs: number;
}

const api = {
  onVoiceStateChange: (callback: (data: VoiceStateChange) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: VoiceStateChange) => callback(data);
    ipcRenderer.on('voice:state-change', handler);
    return () => ipcRenderer.removeListener('voice:state-change', handler);
  },

  onAudioLevel: (callback: (level: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, level: number) => callback(level);
    ipcRenderer.on('voice:audio-level', handler);
    return () => ipcRenderer.removeListener('voice:audio-level', handler);
  },

  onRecognitionDone: (callback: (data: RecognitionDone) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RecognitionDone) => callback(data);
    ipcRenderer.on('voice:recognition-done', handler);
    return () => ipcRenderer.removeListener('voice:recognition-done', handler);
  },

  openSettings: () => ipcRenderer.invoke('settings:open'),
  finishRecording: () => ipcRenderer.invoke('voice:finish-recording'),
  cancelRecording: () => ipcRenderer.invoke('voice:cancel-recording'),
  reportCaptureError: (message: string) => ipcRenderer.invoke('voice:capture-error', message),
  copyText: (text: string) => ipcRenderer.invoke('voice:copy-text', text),

  // Allow renderer to resize the floating window (e.g. error panel expansion)
  resizeFloating: (width: number, height: number) => ipcRenderer.invoke('floating:resize', width, height),

  // Model download progress
  onModelProgress: (callback: (data: { stage: string; percent: number; error?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { stage: string; percent: number; error?: string }) => callback(data);
    ipcRenderer.on('model:progress', handler);
    return () => ipcRenderer.removeListener('model:progress', handler);
  },
  ensureModel: () => ipcRenderer.invoke('model:ensure') as Promise<{ ok: boolean; path?: string; error?: string }>,
  checkModel: () => ipcRenderer.invoke('model:check') as Promise<{ exists: boolean; path?: string }>,

  // Streaming ASR: process a small chunk, returns raw text
  asrChunk: (wavBuf: ArrayBuffer) => ipcRenderer.invoke('voice:asr-chunk', wavBuf) as Promise<string>,

  // Streaming ASR lifecycle (for providers that support incremental recognition)
  asrStreamStart: (sampleRate: number, lang: string) => ipcRenderer.invoke('voice:asr-stream-start', sampleRate, lang) as Promise<void>,
  asrStreamSend: (wavBuf: ArrayBuffer) => ipcRenderer.invoke('voice:asr-stream-chunk', wavBuf) as Promise<void>,
  asrStreamEnd: () => ipcRenderer.invoke('voice:asr-stream-end') as Promise<string>,

  // Send audio buffer to main process for transcription
  transcribe: (audioBuffer: ArrayBuffer, language?: string, opts?: {
    translate?: boolean; translateTarget?: string; dictionary?: Array<{word: string; replace: string}>;
    polishMode?: string; preAsrText?: string;
  }) => ipcRenderer.invoke('voice:transcribe', audioBuffer, language, opts),

  // Stats & history
  getStats: () => ipcRenderer.invoke('stats:get'),
  getOverview: () => ipcRenderer.invoke('stats:overview'),
  getHistory: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),

  // Hotkey management
  setTranslateHotkey: (hotkey: string) => ipcRenderer.invoke('settings:set-translate-hotkey', hotkey),
  setRecordingHotkey: (keyName: string) => ipcRenderer.invoke('settings:set-hotkey', keyName),
  setHotkeyPaused: (paused: boolean) => ipcRenderer.invoke('hotkey:pause', paused),
  onTranslateMode: (callback: (data: { enabled: boolean }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { enabled: boolean }) => callback(data);
    ipcRenderer.on('voice:translate-mode', handler);
    return () => ipcRenderer.removeListener('voice:translate-mode', handler);
  },
  onRefineFailed: (callback: (data: { error: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { error: string }) => callback(data);
    ipcRenderer.on('voice:refine-failed', handler);
    return () => ipcRenderer.removeListener('voice:refine-failed', handler);
  },

  // LLM / Refinement settings
  getApiKey: () => ipcRenderer.invoke('settings:get-api-key'),
  setApiKey: (key: string) => ipcRenderer.invoke('settings:set-api-key', key),
  initRefinement: () => ipcRenderer.invoke('settings:init-refinement'),
  reinitRecognition: () => ipcRenderer.invoke('settings:reinit-recognition') as Promise<boolean>,
  getRefinementStatus: () => ipcRenderer.invoke('settings:refinement-status'),
  getSystemLocale: () => ipcRenderer.invoke('settings:get-system-locale') as Promise<string>,
  setUiLanguage: (lang: string) => ipcRenderer.invoke('settings:set-ui-language', lang),

  // UI sound — played from main process via Win32 MessageBeep (avoids renderer AudioContext issues)
  playSound: (type: string) => ipcRenderer.invoke('voice:play-sound', type),

  // Debug
  debugSaveWav: (buffer: ArrayBuffer, filename: string) => ipcRenderer.invoke('debug:save-wav', buffer, filename),

  // App settings persistence
  loadAppSettings: () => ipcRenderer.invoke('settings:load-app-settings') as Promise<Record<string, unknown>>,
  saveAppSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('settings:save-app-settings', settings),
  setMuteOnRecord: (enabled: boolean) => ipcRenderer.invoke('settings:set-mute-on-record', enabled),
  onSettingsChanged: (callback: (data: { muteOnRecord?: boolean; recordMode?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('settings:changed', handler);
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },

  // Auto-update
  onUpdateAvailable: (callback: (data: { version: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { version: string }) => callback(data);
    ipcRenderer.on('update:available', handler);
    return () => ipcRenderer.removeListener('update:available', handler);
  },
  onUpdateProgress: (callback: (data: { percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { percent: number }) => callback(data);
    ipcRenderer.on('update:progress', handler);
    return () => ipcRenderer.removeListener('update:progress', handler);
  },
  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update:downloaded', handler);
    return () => ipcRenderer.removeListener('update:downloaded', handler);
  },
  // Window controls (frameless titlebar)
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
  onMaximizeChange: (callback: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => callback(maximized);
    ipcRenderer.on('window:maximize-change', handler);
    return () => ipcRenderer.removeListener('window:maximize-change', handler);
  },

  checkForUpdates: () => ipcRenderer.invoke('update:check') as Promise<{ updateAvailable: boolean; version: string | null; error?: string }>,
  downloadUpdate: () => ipcRenderer.invoke('update:download') as Promise<{ success: boolean; error?: string }>,
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Provider connection testing
  testAsrConnection: (provider: string, apiKey: string, endpoint: string) =>
    ipcRenderer.invoke('asr:test-connection', provider, apiKey, endpoint) as Promise<{ ok: boolean; error?: string }>,
  testLlmConnection: (provider: string, apiKey: string, model: string, baseUrl: string) =>
    ipcRenderer.invoke('llm:test-connection', provider, apiKey, model, baseUrl) as Promise<{ ok: boolean; error?: string }>,

  // ASR cloud API key (separate from LLM)
  setAsrCloudApiKey: (key: string) => ipcRenderer.invoke('settings:set-asr-cloud-api-key', key),
  getAsrCloudApiKey: () => ipcRenderer.invoke('settings:get-asr-cloud-api-key') as Promise<string>,
};

contextBridge.exposeInMainWorld('tingmo', api);

export type TingMoAPI = typeof api;
