import { create } from 'zustand';

export type ModelStatus = 'idle' | 'checking' | 'downloading' | 'extracting' | 'ready' | 'error';

export interface ModelDownloadState {
  status: ModelStatus;
  progress: number;
  errorMessage: string;
  modelPath: string;

  setStatus: (s: ModelStatus) => void;
  setProgress: (stage: string, percent: number) => void;
  setError: (msg: string) => void;
  setReady: (path: string) => void;
  reset: () => void;
}

const initialState = {
  status: 'idle' as ModelStatus,
  progress: 0,
  errorMessage: '',
  modelPath: '',
};

export const useModelStore = create<ModelDownloadState>((set) => ({
  ...initialState,

  setStatus: (status) => set({ status }),
  setProgress: (_stage, percent) => {
    const stage = _stage as string;
    const currentStatus = useModelStore.getState().status;
    const newStatus: ModelStatus =
      stage === 'downloading' ? 'downloading' :
      stage === 'extracting' ? 'extracting' : currentStatus;
    set({ status: newStatus, progress: percent });
  },
  setError: (errorMessage) => set({ status: 'error', errorMessage }),
  setReady: (modelPath) => set({ status: 'ready', modelPath, progress: 100 }),
  reset: () => set(initialState),
}));
