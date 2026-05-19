import { contextBridge, ipcRenderer } from 'electron';

export interface VoiceStateChange {
  state: 'idle' | 'recording' | 'recognizing' | 'success' | 'error';
}

export interface RecognitionDone {
  charCount: number;
  durationMs: number;
}

export interface InjectFailed {
  text: string;
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

  onInjectFailed: (callback: (data: InjectFailed) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: InjectFailed) => callback(data);
    ipcRenderer.on('voice:inject-failed', handler);
    return () => ipcRenderer.removeListener('voice:inject-failed', handler);
  },

  openSettings: () => ipcRenderer.invoke('settings:open'),
  finishRecording: () => ipcRenderer.invoke('voice:finish-recording'),
  cancelRecording: () => ipcRenderer.invoke('voice:cancel-recording'),
  reportCaptureError: (message: string) => ipcRenderer.invoke('voice:capture-error', message),
  retryInject: (text: string) => ipcRenderer.invoke('voice:retry-inject', text),
  copyText: (text: string) => ipcRenderer.invoke('voice:copy-text', text),

  // Model download progress
  onModelProgress: (callback: (data: { stage: string; percent: number }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { stage: string; percent: number }) => callback(data);
    ipcRenderer.on('model:progress', handler);
    return () => ipcRenderer.removeListener('model:progress', handler);
  },

  // Send audio buffer to main process for transcription
  transcribe: (audioBuffer: ArrayBuffer, language?: string) => ipcRenderer.invoke('voice:transcribe', audioBuffer, language),
};

contextBridge.exposeInMainWorld('tingmo', api);

export type TingMoAPI = typeof api;
