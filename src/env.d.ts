/// <reference types="vite/client" />

export {};

interface TingMoAPI {
  onVoiceStateChange: (cb: (data: { state: string }) => void) => () => void;
  onAudioLevel: (cb: (level: number) => void) => () => void;
  onRecognitionDone: (cb: (data: { charCount: number; durationMs: number }) => void) => () => void;
  openSettings: () => Promise<void>;
  finishRecording: () => Promise<void>;
  cancelRecording: () => Promise<void>;
  reportCaptureError: (message: string) => Promise<void>;
  resizeFloating: (width: number, height: number) => Promise<void>;
  copyText: (text: string) => Promise<void>;
  playSound: (type: string) => Promise<void>;
  debugSaveWav: (buffer: ArrayBuffer, filename: string) => Promise<void>;
  asrChunk: (wavBuf: ArrayBuffer) => Promise<string>;
  asrStreamStart: (sampleRate: number, lang: string) => Promise<void>;
  asrStreamSend: (wavBuf: ArrayBuffer) => Promise<void>;
  asrStreamEnd: () => Promise<string>;
  transcribe: (audioBuffer: ArrayBuffer, language?: string, opts?: {
    translate?: boolean; translateTarget?: string; dictionary?: Array<{word: string; replace: string}>;
    polishMode?: string; preAsrText?: string;
  }) => Promise<void>;
  onTranslateMode: (cb: (data: { enabled: boolean }) => void) => () => void;
  onRefineFailed: (cb: (data: { error: string }) => void) => () => void;
  setTranslateHotkey: (hotkey: string) => Promise<void>;
  setRecordingHotkey: (keyName: string) => Promise<void>;
  setHotkeyPaused: (paused: boolean) => Promise<void>;
  getStats: () => Promise<{ totalDurationMs: number; totalCharCount: number; totalSessions: number }>;
  getOverview: () => Promise<{ totalDurationMs: number; totalCharCount: number; totalSessions: number; todayDurationMs: number; todayCharCount: number; todaySessions: number; recentDays: Array<{ date: string; durationMs: number; charCount: number }> }>;
  getHistory: () => Promise<Array<{ id: string; text: string; charCount: number; timestamp: number }>>;
  clearHistory: () => Promise<void>;
  // LLM / Refinement
  getApiKey: () => Promise<string>;
  setApiKey: (key: string) => Promise<void>;
  initRefinement: () => Promise<boolean>;
  reinitRecognition: () => Promise<boolean>;
  getRefinementStatus: () => Promise<{ ready: boolean; provider: string | null }>;
  getSystemLocale: () => Promise<string>;
  setUiLanguage: (lang: string) => Promise<void>;
  // App settings persistence
  loadAppSettings: () => Promise<Record<string, unknown>>;
  saveAppSettings: (settings: Record<string, unknown>) => Promise<void>;
  setMuteOnRecord: (enabled: boolean) => Promise<void>;
  onSettingsChanged: (cb: (data: Record<string, unknown>) => void) => () => void;

  // Model download
  onModelProgress: (cb: (data: { stage: string; percent: number; error?: string }) => void) => () => void;
  ensureModel: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  checkModel: () => Promise<{ exists: boolean; path?: string }>;
  // Auto-update
  onUpdateAvailable: (cb: (data: { version: string }) => void) => () => void;
  onUpdateProgress: (cb: (data: { percent: number }) => void) => () => void;
  onUpdateDownloaded: (cb: () => void) => () => void;
  checkForUpdates: () => Promise<{ updateAvailable: boolean; version: string | null; error?: string }>;
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>;
  installUpdate: () => Promise<void>;
  // Provider connection testing
  testAsrConnection: (provider: string, apiKey: string, endpoint: string) => Promise<{ ok: boolean; error?: string }>;
  testLlmConnection: (provider: string, apiKey: string, model: string, baseUrl: string) => Promise<{ ok: boolean; error?: string }>;
  // ASR cloud API key (separate from LLM)
  setAsrCloudApiKey: (key: string) => Promise<void>;
  getAsrCloudApiKey: () => Promise<string>;
  // Window controls (frameless titlebar)
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
  // Tray
  quitApp: () => Promise<void>;
  setRecordMode: (mode: string) => Promise<void>;
  // File system
  openFolder: (filePath: string) => Promise<void>;
}

declare global {
  interface Window {
    tingmo: TingMoAPI;
  }
}
