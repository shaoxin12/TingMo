import { app, BrowserWindow, ipcMain, session, Tray } from 'electron';
import { join } from 'path';
import { createTray, updateTrayState } from './tray';
import { startHotkey, stopHotkey, setHotkeyCallback, waitForHotkeyRelease } from './hotkey';
import { injectText } from './text-inserter';
import { ensureModel } from '../src/services/model-downloader';

let floatingWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let downloadWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

type VoiceState = 'idle' | 'recording' | 'recognizing' | 'success' | 'error';

let currentState: VoiceState = 'idle';
let floatingPosition: { x: number; y: number } | null = null;
let floatingReady = false;
let pendingState: VoiceState | null = null;
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoDismiss(): void {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
}

// Recognition provider — lazy init
let recognitionProvider: any = null;
let recognitionReady = false;

async function initRecognition(): Promise<void> {
  try {
    const { SenseVoiceORTProvider } = require('../src/services/sensevoice-ort');
    const fs = require('fs');

    const modelDir = join(app.getPath('userData'), 'models');
    const modelPath = join(modelDir, 'sensevoice-small', 'model.onnx');
    const tokensPath = join(modelDir, 'sensevoice-small', 'tokens.json');

    // Download model on first launch if missing
    if (!fs.existsSync(modelPath)) {
      await downloadModel(modelDir);
    }

    console.log('[Main] Loading SenseVoice model from:', modelPath);
    recognitionProvider = new SenseVoiceORTProvider(modelPath, tokensPath);
    recognitionReady = await recognitionProvider.initialize();
    console.log('[Main] Recognition ready:', recognitionReady);
  } catch (err: any) {
    console.error('[Main] Failed to init recognition:', err.message);
    recognitionReady = false;
  }
}

function createDownloadWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 120,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    center: true,
    title: '',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  win.loadURL(`data:text/html,
    <html><body style="margin:0;font-family:-apple-system,Segoe UI,sans-serif;
    background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;
    border:3px solid #000;">
    <div style="text-align:center">
    <p id="msg" style="font-size:14px;font-weight:700;color:#000;margin:0 0 8px">
    正在下载语音模型...</p>
    <div id="bar" style="width:280px;height:6px;background:#eee;margin:0 auto">
    <div id="fill" style="width:0%;height:100%;background:#000"></div></div></div>
    <script>
    window.tingmo.onModelProgress(function(p) {
      document.getElementById('msg').textContent =
        p.stage==='downloading'?'下载模型 '+p.percent+'%':
        p.stage==='extracting'?'解压中...':'';
      document.getElementById('fill').style.width=p.percent+'%';
    });
    </script></body></html>`);
  return win;
}

async function downloadModel(modelDir: string): Promise<void> {
  downloadWindow = createDownloadWindow();
  downloadWindow.show();

  await ensureModel(modelDir, (p) => {
    if (downloadWindow && !downloadWindow.isDestroyed()) {
      downloadWindow.webContents.send('model:progress', p);
    }
    if (p.stage === 'done') {
      setTimeout(() => {
        if (downloadWindow && !downloadWindow.isDestroyed()) {
          downloadWindow.close();
          downloadWindow = null;
        }
      }, 600);
    }
  });
}

function createFloatingWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 140,
    height: 48,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  floatingReady = false;

  if (floatingPosition) {
    win.setPosition(floatingPosition.x, floatingPosition.y);
  } else {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    win.setPosition(Math.round((width - 140) / 2), height - 56);
  }

  win.on('moved', () => {
    const [x, y] = win.getPosition();
    floatingPosition = { x, y };
  });

  win.webContents.on('did-finish-load', () => {
    floatingReady = true;
    if (pendingState) {
      win.webContents.send('voice:state-change', { state: pendingState });
      pendingState = null;
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  return win;
}

function showFloatingWindow(): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    floatingWindow = createFloatingWindow();
  }
  floatingWindow.showInactive();
}

function hideFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.hide();
  }
}

function sendToRenderer(channel: string, data?: unknown): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  if (floatingReady) {
    floatingWindow.webContents.send(channel, data);
  } else if (channel === 'voice:state-change') {
    pendingState = (data as { state: VoiceState }).state;
  }
}

function setVoiceState(state: VoiceState): void {
  currentState = state;
  sendToRenderer('voice:state-change', { state });

  switch (state) {
    case 'recording':
      updateTrayState(tray, 'recording');
      break;
    case 'recognizing':
      updateTrayState(tray, 'recognizing');
      break;
    default:
      updateTrayState(tray, 'default');
  }
}

function createSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 520,
    minWidth: 480,
    minHeight: 400,
    resizable: true,
    title: 'TINGMO · 设置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    settingsWindow.loadURL('http://localhost:5173/#/settings');
  } else {
    settingsWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: '/settings' });
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ── Hotkey callback ──────────────────────────────────────────
setHotkeyCallback(async (pressed: boolean) => {
  if (!pressed) return;

  clearAutoDismiss();

  switch (currentState) {
    case 'idle': {
      showFloatingWindow();
      setVoiceState('recording');
      break;
    }
    case 'recording': {
      setVoiceState('recognizing');
      break;
    }
    case 'error':
    case 'success': {
      // Dismiss floating window, go back to idle
      hideFloatingWindow();
      setVoiceState('idle');
      break;
    }
  }
});

// ── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });

  ipcMain.handle('settings:open', () => {
    createSettingsWindow();
  });

  ipcMain.handle('voice:finish-recording', () => {
    if (currentState === 'recording') {
      setVoiceState('recognizing');
    }
  });

  ipcMain.handle('voice:cancel-recording', () => {
    hideFloatingWindow();
    setVoiceState('idle');
  });

  ipcMain.handle('voice:capture-error', (_event, message: string) => {
    console.error('[Main] Audio capture error:', message);
    setVoiceState('error');
    sendToRenderer('voice:inject-failed', { text: message });
  });

  // Audio transcription from renderer
  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer, language?: string) => {
    try {
      console.log('[Main] Transcribe: buffer =', audioBuffer.byteLength, 'bytes, lang =', language);
      const buf = Buffer.from(audioBuffer);
      let text: string;

      if (recognitionReady && recognitionProvider) {
        console.log('[Main] Running SenseVoice...');
        const result = await recognitionProvider.transcribe(buf, 16000, language);
        text = result.text;
        console.log('[Main] SenseVoice result:', text);
      } else {
        // Fallback to mock if model not ready
        console.log('[Main] Using mock (model not ready)');
        await new Promise(r => setTimeout(r, 300));
        text = '这是一段测试文本，通过听墨语音输入法识别。';
      }

      console.log('[Main] Injecting text:', text.slice(0, 40));
      await waitForHotkeyRelease();
      const injectResult = await injectText(text);
      if (injectResult.success) {
        setVoiceState('success');
        sendToRenderer('voice:recognition-done', {
          charCount: injectResult.charCount,
          durationMs: injectResult.durationMs,
        });
        autoDismissTimer = setTimeout(() => {
          hideFloatingWindow();
          setVoiceState('idle');
        }, 1500);
      } else {
        setVoiceState('error');
        sendToRenderer('voice:inject-failed', { text });
      }
    } catch (err: any) {
      console.error('[Main] Transcription error:', err.message);
      setVoiceState('error');
      autoDismissTimer = setTimeout(() => {
        hideFloatingWindow();
        setVoiceState('idle');
      }, 2000);
    }
  });

  ipcMain.handle('voice:retry-inject', async (_event, text: string) => {
    const result = await injectText(text);
    if (result.success) {
      setVoiceState('success');
      sendToRenderer('voice:recognition-done', {
        charCount: result.charCount,
        durationMs: result.durationMs,
      });
      autoDismissTimer = setTimeout(() => {
        hideFloatingWindow();
        setVoiceState('idle');
      }, 1500);
    }
    return result;
  });

  ipcMain.handle('voice:copy-text', async (_event, text: string) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  });

  // Init recognition in background
  initRecognition();

  tray = createTray(createSettingsWindow);
  startHotkey();
});

app.on('window-all-closed', () => {
  // Don't quit — stays in tray
});

app.on('before-quit', () => {
  stopHotkey();
});

app.on('activate', () => {
  // On tray click
});
