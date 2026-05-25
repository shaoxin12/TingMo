import { app, BrowserWindow, ipcMain, session, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { createTray, updateTrayState, updateTrayLanguage, setOnAsrProviderChange } from './tray';
import { startHotkey, stopHotkey, setHotkeyCallback, setHotkeyReleaseCallback, setEscCallback, waitForHotkeyRelease } from './hotkey';
import { injectText } from './text-inserter';
import { ensureModel } from '../src/services/model-downloader';
import { duckSystemAudio, unduckSystemAudio } from './audio-ducking';
import { addRecordingStats, addHistoryEntry, loadStats, loadHistory, clearHistory, loadOverview } from './stats-history';
import { SherpaASRProvider } from '../src/services/funasr-sherpa';
import { getLLMProvider, getASRCloudProvider } from '../src/services/llm-providers';

// Single instance lock — prevent double tray icon
let gotTheLock = false;
if (app) {
  gotTheLock = app.requestSingleInstanceLock();
}

if (!gotTheLock) {
  if (app) app.quit();
} else {
  app.on('second-instance', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized()) settingsWindow.restore();
      settingsWindow.show();
      settingsWindow.focus();
    } else {
      createSettingsWindow();
    }
  });
}

const koffi = require('koffi');

// Strip DWM shadow/border from transparent frameless window
function stripDwmFrame(win: BrowserWindow): void {
  try {
    const dwmapi = koffi.load('dwmapi.dll');
    const DwmSetWindowAttribute = dwmapi.func(
      'DwmSetWindowAttribute', 'int32', ['void*', 'uint32', 'void*', 'uint32'],
    );
    const hwnd = koffi.as(win.getNativeWindowHandle(), 'void*');

    // Disable non-client rendering (removes DWM border/shadow)
    const policy = Buffer.alloc(4);
    policy.writeInt32LE(2, 0); // DWMNCRP_DISABLED = 2 (was 1, try 2 for more aggressive)
    DwmSetWindowAttribute(hwnd, 2, koffi.as(policy, 'void*'), 4); // DWMWA_NCRENDERING_POLICY = 2
  } catch { /* ignore */ }
}

let floatingWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

type VoiceState = 'idle' | 'recording' | 'recognizing' | 'refining' | 'success' | 'error';

let currentState: VoiceState = 'idle';
let floatingReady = false;
let pendingState: VoiceState | null = null;
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
let recordingStartedAt: number = 0;
let translateMode: boolean = false;
let translateModifierVK: number = 0xA1; // default: VK_RSHIFT
let recordMode: 'toggle' | 'hold' = 'toggle';
let muteOnRecord = true;

function getDataPath(filename: string): string {
  return join(app.getPath('userData'), 'data', filename);
}

function readJSON<T>(filepath: string, fallback: T): T {
  try {
    const fs = require('fs');
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return fallback;
}

function writeJSON(filepath: string, data: unknown): void {
  const fs = require('fs');
  const dir = join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
}

function loadRecordMode(): 'toggle' | 'hold' {
  const settings = readJSON<any>(getDataPath('settings.json'), {});
  return settings.recordMode || 'toggle';
}
function loadMuteOnRecord(): boolean {
  const settings = readJSON<any>(getDataPath('settings.json'), {});
  return settings.muteOnRecord ?? true;
}

// Key name → VK code mapping for translate modifier
const MODIFIER_VK_MAP: Record<string, number> = {
  '右 Shift': 0xA1, 'Right Shift': 0xA1, '오른쪽 Shift': 0xA1,
  '右 Ctrl': 0xA3, 'Right Ctrl': 0xA3, '오른쪽 Ctrl': 0xA3,
  '左 Shift': 0xA0, 'Left Shift': 0xA0, '왼쪽 Shift': 0xA0,
  '左 Ctrl': 0xA2, 'Left Ctrl': 0xA2, '왼쪽 Ctrl': 0xA2,
  '右 Alt': 0xA5, 'Right Alt': 0xA5, '오른쪽 Alt': 0xA5,
  '左 Alt': 0xA4, 'Left Alt': 0xA4, '왼쪽 Alt': 0xA4,
};

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
    const fs = require('fs');

    // Read ASR settings from settings.json
    let provider: 'local' | 'cloud' = 'local';
    let asrCloudProviderKey = 'openai';
    let asrCloudModel = 'whisper-1';
    try {
      const filepath = getDataPath('settings.json');
      if (fs.existsSync(filepath)) {
        const appSettings = readJSON<any>(filepath, {});
        provider = appSettings.asrProvider || 'local';
        asrCloudProviderKey = appSettings.asrCloudProvider || 'openai';
        asrCloudModel = appSettings.asrCloudModel || 'whisper-1';
      }
    } catch { /* use default */ }

    if (provider === 'cloud') {

      // Read ASR cloud API key from settings.json
      let asrApiKey = '';
      try {
        const filepath = getDataPath('settings.json');
        if (fs.existsSync(filepath)) {
          const appSettings = readJSON<any>(filepath, {});
          asrApiKey = appSettings.asrCloudApiKey || '';
        }
      } catch { /* ignore */ }

      const preset = getASRCloudProvider(asrCloudProviderKey);
      const asrEndpoint = preset?.endpoint || 'https://api.openai.com/v1';

      if (!asrApiKey) {
        console.log('[Main] Cloud ASR selected but no ASR API key configured');
        recognitionReady = false;
        sendToRenderer('voice:refine-failed', { error: 'Cloud ASR: please configure an API key for ASR in Settings → Model.' });
      } else if (asrCloudProviderKey === 'openai') {
        const { FunASRCloudProvider } = require('../src/services/funasr-cloud');
        recognitionProvider = new FunASRCloudProvider(asrApiKey, asrEndpoint, asrCloudModel);
        recognitionReady = await recognitionProvider.initialize();
        console.log('[Main] Recognition ready (cloud:openai):', asrCloudModel, recognitionReady);
      } else if (asrCloudProviderKey === 'volcano') {
        const { VolcanoASRProvider } = require('../src/services/asr-volcano');
        recognitionProvider = new VolcanoASRProvider(asrApiKey, asrCloudModel);
        recognitionReady = await recognitionProvider.initialize();
        console.log('[Main] Recognition ready (cloud:volcano):', asrCloudModel, recognitionReady);
      } else if (asrCloudProviderKey === 'aliyun') {
        const { AliyunASRProvider } = require('../src/services/asr-aliyun');
        recognitionProvider = new AliyunASRProvider(asrApiKey, asrCloudModel);
        recognitionReady = await recognitionProvider.initialize();
        console.log('[Main] Recognition ready (cloud:aliyun):', asrCloudModel, recognitionReady);
      }
    }
    if (provider === 'local') {

      const userModelDir = join(app.getPath('userData'), 'models', 'funasr');
      const userModel = join(userModelDir, 'model.int8.onnx');
      const userTokens = join(userModelDir, 'tokens.txt');

      if (fs.existsSync(userModel)) {
        if (!fs.existsSync(userTokens)) {
          console.log('[Main] tokens.txt missing, will be re-downloaded');
        }
        console.log('[Main] Loading SenseVoice model via sherpa-onnx from:', userModelDir);
        recognitionProvider = new SherpaASRProvider(userModelDir);
        recognitionReady = await recognitionProvider.initialize();
        console.log('[Main] Recognition ready (local):', recognitionReady);
      } else {
        // Model not found — start background download, don't block app startup
        console.log('[Main] Model not found, starting background download...');
        downloadModel(join(app.getPath('userData'), 'models')).then(() => {
          console.log('[Main] Background model download complete');
        }).catch((err: any) => {
          console.error('[Main] Background model download failed:', err.message);
        });
        recognitionReady = false;
      }
    }
  } catch (err: any) {
    console.error('[Main] Failed to init recognition:', err.message);
    recognitionReady = false;
  }
}

// LLM provider — used for both refinement and translation
let refinementProvider: any = null;
let refinementReady = false;

async function initRefinement(): Promise<void> {
  try {
    const fs = require('fs');
    // Read LLM config + key from settings.json
    const filepath = getDataPath('settings.json');
    let apiKey = '';
    let llmProviderKey = 'openai';
    let model = 'gpt-4o-mini';
    let baseUrl = 'https://api.openai.com/v1';
    if (fs.existsSync(filepath)) {
      try {
        const settings = readJSON<any>(filepath, {});
        apiKey = settings.llmApiKey || '';
        llmProviderKey = settings.llmProvider || 'openai';
        model = settings.llmModel || model;
        baseUrl = settings.llmBaseUrl || baseUrl;
      } catch { /* ignore */ }
    }

    const preset = getLLMProvider(llmProviderKey);
    if (preset && !model) model = preset.defaultModel;
    if (preset && !baseUrl) baseUrl = preset.baseUrl;

    const needsKey = !preset || preset.authType !== 'none';
    if (needsKey && !apiKey) {
      refinementProvider = null;
      refinementReady = false;
      return;
    }

    if (llmProviderKey === 'gemini') {
      const { GeminiProvider } = require('../src/services/llm-gemini');
      refinementProvider = new GeminiProvider({ apiKey, model, baseUrl });
    } else {
      const { OpenAIProvider } = require('../src/services/llm-openai');
      refinementProvider = new OpenAIProvider({ apiKey, model, baseUrl });
    }

    refinementReady = true;
    console.log('[Main] LLM ready:', llmProviderKey, model);
  } catch (err: any) {
    console.error('[Main] Failed to init LLM:', err.message);
    refinementProvider = null;
    refinementReady = false;
  }
}

// Dictionary fuzzy correction — edit-distance based, catches homophone errors
// Only replace when edit distance ≤ 1 for keys ≤3 chars, or ≤2 for longer keys
function applyDictionary(text: string, dictionary: Array<{word: string; replace: string}>): string {
  for (const entry of dictionary) {
    const word = entry.word;
    const replace = entry.replace;
    if (text.includes(word)) continue; // exact match, nothing to fix

    const maxDist = word.length <= 3 ? 1 : 2;
    const wlen = word.length;

    // Sliding window: check substrings of similar length
    for (let i = 0; i <= text.length; i++) {
      for (let len = Math.max(1, wlen - 1); len <= Math.min(wlen + 2, text.length - i); len++) {
        const sub = text.slice(i, i + len);
        const dist = levenshtein(sub, word);
        if (dist <= maxDist && dist < wlen * 0.6) {
          text = text.slice(0, i) + replace + text.slice(i + len);
          console.log('[Main] Dict corrected:', JSON.stringify(sub), '→', JSON.stringify(replace), '(dist=' + dist + ')');
          break; // stop scanning this entry after first correction
        }
      }
    }
  }
  return text;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = temp;
    }
  }
  return dp[n];
}

async function isNetworkAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 2000);
    await fetch('https://api.openai.com/v1/models', { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  }
}

let modelDownloadPromise: Promise<string> | null = null;

async function downloadModel(modelDir: string): Promise<string> {
  if (modelDownloadPromise) return modelDownloadPromise;

  modelDownloadPromise = ensureModel(modelDir, (p) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('model:progress', p);
    }
    if (floatingWindow && !floatingWindow.isDestroyed() && floatingReady) {
      floatingWindow.webContents.send('model:progress', p);
    }
  });

  try {
    return await modelDownloadPromise;
  } finally {
    modelDownloadPromise = null;
  }
}

function createFloatingWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 160,
    height: 44,
    transparent: true,
    backgroundColor: '#00000000',
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

  win.setBackgroundColor('#00000000');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  stripDwmFrame(win);

  // Ensure web contents also has no background
  win.webContents.on('did-finish-load', () => {
    win?.webContents.insertCSS('html,body,#root{background:transparent !important}');
  });
  floatingReady = false;

  // Always position from screen geometry — never use cached floatingPosition,
  // and don't listen for moved events (DWM adjustments cause drift).
  positionOnActiveDisplay(win);

  win.webContents.on('did-finish-load', () => {
    floatingReady = true;
    if (pendingTranslateMode !== null) {
      win.webContents.send('voice:translate-mode', { enabled: pendingTranslateMode });
      pendingTranslateMode = null;
    }
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

function getCursorDisplay(): Electron.Display {
  const { screen } = require('electron');
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

// Position the floating window centered just above the taskbar.
// Uses screen bounds (stable, never changes) minus workArea (to measure
// taskbar height).  setBounds is used instead of setPosition — it sets
// both position AND size atomically, preventing DWM from applying subtle
// size adjustments that shift the window.
function positionOnActiveDisplay(win: BrowserWindow): void {
  const d = getCursorDisplay();
  const bounds = d.bounds;
  const wa = d.workArea;
  const taskbarH = (bounds.y + bounds.height) - (wa.y + wa.height);
  const x = Math.round(bounds.x + (bounds.width - 160) / 2);
  const y = bounds.y + bounds.height - taskbarH - 44 - 6;
  win.setBounds({ x, y, width: 160, height: 44 });
}

function showFloatingWindow(): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    floatingWindow = createFloatingWindow();
  }
  positionOnActiveDisplay(floatingWindow);
  floatingWindow.showInactive();
  // Override any DWM async adjustment after show
  setImmediate(() => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      positionOnActiveDisplay(floatingWindow);
    }
  });
}

function hideFloatingWindow(): void {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.hide();
  }
}

let pendingTranslateMode: boolean | null = null;

function sendToRenderer(channel: string, data?: unknown): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  if (floatingReady) {
    floatingWindow.webContents.send(channel, data);
  } else if (channel === 'voice:state-change') {
    pendingState = (data as { state: VoiceState }).state;
  } else if (channel === 'voice:translate-mode') {
    pendingTranslateMode = (data as { enabled: boolean }).enabled;
  }
}

function setVoiceState(state: VoiceState): void {
  // Track recording start time for stats
  if (state === 'recording' && currentState !== 'recording') {
    recordingStartedAt = Date.now();
    if (muteOnRecord) {
      duckSystemAudio().catch(e => console.error('[Main] duck error:', e));
    }
  } else if (currentState === 'recording' && state !== 'recording') {
    if (muteOnRecord) {
      unduckSystemAudio().catch(e => console.error('[Main] unduck error:', e));
    }
  }

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

function createSettingsWindow(showOnboarding = false): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 900,
    minHeight: 660,
    resizable: true,
    frame: false,
    title: 'TINGMO · 设置',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const hash = showOnboarding ? '/onboarding' : '/settings';
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.loadURL('http://localhost:5173/#' + hash);
  } else {
    settingsWindow.loadFile(join(__dirname, '../dist/index.html'), { hash });
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
  settingsWindow.on('maximize', () => {
    settingsWindow?.webContents.send('window:maximize-change', true);
  });
  settingsWindow.on('unmaximize', () => {
    settingsWindow?.webContents.send('window:maximize-change', false);
  });
}

// ── Hotkey callbacks ──────────────────────────────────────

function handleHotkeyPress(): void {
  clearAutoDismiss();

  // Detect translate modifier key for translation mode
  const user32 = koffi.load('user32.dll');
  const GetAsyncKeyState = user32.func('GetAsyncKeyState', 'int16', ['int32']);
  const modifierDown = (GetAsyncKeyState(translateModifierVK) & 0x8000) !== 0;

  // Reset sticky translateMode when starting a new recording without modifier
  if (currentState === 'idle') {
    translateMode = modifierDown;
  }

  if (recordMode === 'hold') {
    // Hold mode: press to start recording, release to stop
    if (currentState === 'idle') {
      showFloatingWindow();
      if (translateMode) {
        sendToRenderer('voice:translate-mode', { enabled: true });
      }
      setVoiceState('recording');
    } else if (currentState === 'error' || currentState === 'success') {
      hideFloatingWindow();
      setVoiceState('idle');
      translateMode = false;
    }
    return;
  }

  // Toggle mode: each press toggles state
  switch (currentState) {
    case 'idle': {
      showFloatingWindow();
      // Send translate-mode BEFORE voice-state so the renderer knows
      // it's a translation recording before it starts capturing audio.
      if (translateMode) {
        sendToRenderer('voice:translate-mode', { enabled: true });
      }
      setVoiceState('recording');
      break;
    }
    case 'recording': {
      setVoiceState('recognizing');
      break;
    }
    case 'error':
    case 'success': {
      hideFloatingWindow();
      setVoiceState('idle');
      translateMode = false;
      break;
    }
  }
}

function handleHotkeyRelease(): void {
  if (recordMode === 'hold' && currentState === 'recording') {
    setVoiceState('recognizing');
  }
}

function handleEscPress(): void {
  if (currentState !== 'idle') {
    console.log('[Main] Esc pressed — cancelling');
    clearAutoDismiss();
    hideFloatingWindow();
    setVoiceState('idle');
    translateMode = false;
    sendToRenderer('voice:state-change', { state: 'idle' });
  }
}

setHotkeyCallback(() => handleHotkeyPress());
setHotkeyReleaseCallback(() => handleHotkeyRelease());
setEscCallback(() => handleEscPress());

// ── IPC handlers that don't need whenReady ───────────

if (app) {
  ipcMain.handle('asr:test-connection', async (_event, provider: string, apiKey: string, endpoint: string) => {
    const { testAsrConnection } = require('../src/services/connection-test');
    return testAsrConnection(provider, apiKey, endpoint);
  });

  ipcMain.handle('llm:test-connection', async (_event, provider: string, apiKey: string, model: string, baseUrl: string) => {
    const { testLlmConnection } = require('../src/services/connection-test');
    return testLlmConnection(provider, apiKey, model, baseUrl);
  });

  ipcMain.handle('settings:set-asr-cloud-api-key', async (_event, key: string) => {
    // Store ASR key in llm-settings.json alongside other ASR config
    try {
      const fs = require('fs');
      const dir = join(app.getPath('userData'), 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const settingsPath = join(dir, 'llm-settings.json');
      let existing: any = {};
      if (fs.existsSync(settingsPath)) {
        try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch { /* ignore */ }
      }
      existing.asrCloudApiKey = key;
      fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
      console.log('[Main] ASR key saved to llm-settings.json');
    } catch (err: any) {
      console.error('[Main] Failed to save ASR key:', err.message);
    }
  });

  ipcMain.handle('settings:get-asr-cloud-api-key', async () => {
    try {
      const fs = require('fs');
      const settingsPath = join(app.getPath('userData'), 'data', 'llm-settings.json');
      if (!fs.existsSync(settingsPath)) return '';
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return settings.asrCloudApiKey || '';
    } catch {
      return '';
    }
  });
}

// App Lifecycle
if (app) {
  app.whenReady().then(async () => {
  // Migrate data from old "tingmo" dir to "TingMo" (package.json name was lowercased)
  try {
    const fs = require('fs');
    const path = require('path');
    const oldDir = path.join(app.getPath('appData'), 'tingmo');
    const newDir = app.getPath('userData');
    if (oldDir !== newDir && fs.existsSync(oldDir) && !fs.existsSync(path.join(newDir, 'data'))) {
      console.log('[Main] Migrating data from', oldDir, 'to', newDir);
      fs.cpSync(oldDir, newDir, { recursive: true });
    }
  } catch { /* ignore */ }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'media';
  });

  ipcMain.handle('settings:open', () => {
    createSettingsWindow();
  });

  // ── App settings persistence ──────────────────────────
  ipcMain.handle('settings:load-app-settings', () => {
    return readJSON<any>(getDataPath('settings.json'), {});
  });

  ipcMain.handle('settings:save-app-settings', (_event, settings: Record<string, unknown>) => {
    try {
      const filepath = getDataPath('settings.json');
      console.log('[Main] saveAppSettings called. hasKey:', !!settings.asrCloudApiKey, 'asrProvider:', settings.asrProvider);
      const existing = readJSON<any>(filepath, {});
      Object.assign(existing, settings);
      writeJSON(filepath, existing);
      console.log('[Main] Written to:', filepath);
      if (typeof settings.recordMode === 'string') {
        recordMode = (settings as any).recordMode;
      }
      if (typeof settings.launchAtStartup === 'boolean') {
        app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup as boolean });
      }
    } catch (err: any) {
      console.error('[Main] Failed to save settings:', err.message);
    }
  });

  ipcMain.handle('stats:get', () => loadStats());
  ipcMain.handle('stats:overview', () => loadOverview());
  ipcMain.handle('history:get', () => loadHistory());
  ipcMain.handle('history:clear', () => { clearHistory(); });
  ipcMain.handle('settings:set-translate-modifier', (_event, keyName: string) => {
    translateModifierVK = VK_NAME_MAP[keyName] ?? 0xA1;
    console.log('[Main] Translate modifier set to', keyName, 'VK =', translateModifierVK);
  });

  ipcMain.handle('settings:set-hotkey', (_event, hotkeyName: string) => {
    const vk = VK_NAME_MAP[hotkeyName];
    if (vk && vk !== recordingHotkeyVK) {
      recordingHotkeyVK = vk;
      console.log('[Main] Recording hotkey changed to', hotkeyName, 'VK =', vk);
      stopHotkey();
      startHotkey(vk);
    }
  });

  // System locale detection
  ipcMain.handle('settings:get-system-locale', () => {
    const locale = app.getLocale() || 'zh-CN';
    let lang: string;
    if (locale === 'zh-TW' || locale === 'zh-HK' || locale === 'zh-MO') lang = 'zh-TW';
    else if (locale.startsWith('zh')) lang = 'zh-CN';
    else if (locale.startsWith('ja')) lang = 'ja';
    else if (locale.startsWith('ko')) lang = 'ko';
    else lang = 'en';
    console.log('[Main] System locale:', locale, '→', lang);
    return lang;
  });

  ipcMain.handle('settings:set-ui-language', (_event, lang: string) => {
    currentLocale = lang;
    updateTrayLanguage(tray, lang, createSettingsWindow);
  });

  // LLM / Refinement settings
  ipcMain.handle('settings:get-api-key', () => {
    try {
      const fs = require('fs');
      const settingsPath = join(app.getPath('userData'), 'data', 'llm-settings.json');
      if (!fs.existsSync(settingsPath)) return '';
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return settings.llmApiKey || '';
    } catch { /* ignore */ }
    return '';
  });

  ipcMain.handle('settings:set-api-key', (_event, key: string) => {
    try {
      const fs = require('fs');
      const dir = join(app.getPath('userData'), 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const settingsPath = join(dir, 'llm-settings.json');
      let existing: any = {};
      if (fs.existsSync(settingsPath)) {
        try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch { /* ignore */ }
      }
      existing._llmApiKey = key;
      fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
    } catch (err: any) {
      console.error('[Main] Failed to save LLM key:', err.message);
    }
  });

  ipcMain.handle('settings:save-llm-settings', (_event, settings: {
    refineEnabled?: boolean; llmProvider?: string; llmModel?: string;
    llmBaseUrl?: string; llmApiKey?: string; asrProvider?: string;
    asrCloudProvider?: string; asrCloudModel?: string; asrCloudApiKey?: string;
  }) => {
    try {
      const fs = require('fs');
      const dir = join(app.getPath('userData'), 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const settingsPath = join(dir, 'llm-settings.json');
      let existing: any = {};
      if (fs.existsSync(settingsPath)) {
        try { existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')); } catch { /* ignore */ }
      }
      Object.assign(existing, settings);
      fs.writeFileSync(settingsPath, JSON.stringify(existing, null, 2));
    } catch (err: any) {
      console.error('[Main] Failed to save LLM settings:', err.message);
    }
  });

  ipcMain.handle('settings:init-refinement', async () => {
    await initRefinement();
    return refinementReady;
  });

  ipcMain.handle('settings:refinement-status', () => {
    return { ready: refinementReady, provider: refinementProvider?.name || null };
  });

  ipcMain.handle('settings:reinit-recognition', async () => {
    console.log('[Main] Re-initializing recognition from settings change...');
    await initRecognition();
    console.log('[Main] Re-init complete. recReady:', recognitionReady);
    return recognitionReady;
  });

  // ── Model download ─────────────────────────────────────
  ipcMain.handle('model:check', () => {
    const modelPath = join(app.getPath('userData'), 'models', 'funasr', 'model.int8.onnx');
    const tokensPath = join(app.getPath('userData'), 'models', 'funasr', 'tokens.txt');
    const exists = fs.existsSync(modelPath) && fs.existsSync(tokensPath);
    return { exists, path: exists ? modelPath : null };
  });

  ipcMain.handle('model:ensure', async () => {
    const modelDir = join(app.getPath('userData'), 'models');
    try {
      const modelPath = await downloadModel(modelDir);
      return { ok: true, path: modelPath };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  // Settings persistence — unified settings.json in userData
  const SETTINGS_PATH = join(app.getPath('userData'), 'data', 'settings.json');

  ipcMain.handle('settings:load-all', () => {
    try {
      const fs = require('fs');
      if (fs.existsSync(SETTINGS_PATH)) {
        return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      }
    } catch { /* file doesn't exist yet */ }
    return null;
  });

  ipcMain.handle('settings:save-all', (_event, settings: Record<string, unknown>) => {
    try {
      const fs = require('fs');
      const dir = join(app.getPath('userData'), 'data');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err: any) {
      console.error('[Main] Failed to save settings:', err.message);
    }
  });

  ipcMain.handle('voice:finish-recording', () => {
    if (currentState === 'recording') {
      setVoiceState('recognizing');
    }
  });

  ipcMain.handle('voice:cancel-recording', () => {
    hideFloatingWindow();
    setVoiceState('idle');
    translateMode = false;
  });

  ipcMain.handle('voice:capture-error', (_event, message: string) => {
    console.error('[Main] Audio capture error:', message);
    setVoiceState('idle');
  });

  // Audio transcription from renderer
  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer, language?: string, options?: {
    translate?: boolean; translateTarget?: string; dictionary?: Array<{word: string; replace: string}>;
    polishMode?: string; customPrompt?: string;
  }) => {
    try {
      console.log('[Main] Transcribe: buffer =', audioBuffer.byteLength, 'bytes, lang =', language);
      const buf = Buffer.from(audioBuffer);
      let text: string;

      // Start key-release wait now — runs in parallel with ASR
      const releasePromise = waitForHotkeyRelease(150);

      // Debug WAV save — non-blocking
      setImmediate(() => {
        try {
          const fs = require('fs');
          const debugDir = join(process.env.APPDATA || '', 'TingMo', 'debug_recordings');
          if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
          fs.writeFileSync(join(debugDir, `tingmo_${Date.now()}.wav`), buf);
        } catch { /* ignore */ }
      });

      // ── ASR Inference ────────────────────────────────────
      if (recognitionReady && recognitionProvider) {
        console.log('[Main] Using cloud ASR:', recognitionProvider.name);
        const result = await recognitionProvider.transcribe(buf, 16000, language || 'auto');
        text = result.text || '';
        console.log('[Main] ASR result:', text.slice(0, 60));
      } else {
        const fs = require('fs');
        const path = require('path');
        const sherpa = require('sherpa-onnx');
        const modelDir = join(app.getPath('userData'), 'models', 'funasr');
        const modelPath = path.join(modelDir, 'model.int8.onnx');
        const tokensPath = path.join(modelDir, 'tokens.txt');
        if (!fs.existsSync(modelPath)) {
          throw new Error('Model not found: ' + modelPath);
        }
        const rec = sherpa.createOfflineRecognizer({
          modelConfig: {
            senseVoice: { model: modelPath, language: '', useInverseTextNormalization: 1 },
            tokens: tokensPath,
          },
        });
        const numSamples = Math.floor((buf.length - 44) / 2);
        const samples = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; i++) {
          samples[i] = buf.readInt16LE(44 + i * 2) / 32768;
        }
        const stream = rec.createStream();
        stream.acceptWaveform(16000, samples);
        rec.decode(stream);
        text = rec.getResult(stream).text || '';
        stream.free();
        rec.free();
        console.log('[Main] ASR result (local):', text);
      }

      // Filter silence hallucinations — SenseVoice outputs spurious words for near-silent input
      const stripped = text.replace(/[，。？、！，,.\s　]/g, '').trim();
      const HALLUCINATIONS = new Set([
        'yeah', 'yeah.', 'yeah。', 'Yeah', 'Yeah.',
        'um', 'Um', 'uh', 'Uh', 'hmm', 'Hmm',
        '嗯', '嗯。', '啊', '啊。', '哦', '哦。',
        '.', '。', '...', '……',
      ]);
      if (stripped.length < 2 || HALLUCINATIONS.has(text.trim())) {
        console.log('[Main] Silence hallucination filtered:', text);
        setVoiceState('idle');
        hideFloatingWindow();
        translateMode = false;
        return;
      }
      // Dictionary fuzzy correction — always runs, offline or online
      if (options?.dictionary && options.dictionary.length > 0 && text.length > 0) {
        text = applyDictionary(text, options.dictionary);
        console.log('[Main] After dictionary:', text.slice(0, 80));
      }

      // Check if auto-refinement is enabled in settings
      let refineEnabled = false;
      try {
        const fs = require('fs');
        const settingsPath = join(app.getPath('userData'), 'data', 'llm-settings.json');
        if (fs.existsSync(settingsPath)) {
          refineEnabled = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')).refineEnabled ?? false;
        }
      } catch { /* use default */ }

      // LLM Refinement — only if enabled AND not translating
      let originalText = text;
      if (refineEnabled && refinementReady && refinementProvider && text.trim().length > 0 && !options?.translate) {
        const online = await isNetworkAvailable();
        if (online) {
          try {
            setVoiceState('refining');
            const result = await refinementProvider.refine(text, {
              language,
              dictionary: options?.dictionary ?? [],
              polishMode: (options as any)?.polishMode || 'structured',
              customPrompt: (options as any)?.customPrompt || '',
            });
            text = result.refinedText;
            console.log('[Main] Refined:', text.slice(0, 80));
          } catch (err: any) {
            console.error('[Main] Refine failed, using raw ASR:', err.message);
            sendToRenderer('voice:refine-failed', { error: err.message });
          }
        } else {
          console.log('[Main] Offline — skipping refinement');
        }
      }

      // LLM Translation — uses same provider as refinement, different prompt
      if (options?.translate && text.trim()) {
        const target = options.translateTarget || 'en';
        console.log('[Main] Translating to', target, ':', text.slice(0, 40));
        if (refinementReady && refinementProvider) {
          const online = await isNetworkAvailable();
          if (online) {
            try {
              setVoiceState('refining');
              const result = await refinementProvider.translate(text, target, {
                language,
                dictionary: options?.dictionary ?? [],
              });
              text = result.refinedText;
              console.log('[Main] Translated:', text.slice(0, 80));
            } catch (err: any) {
              console.error('[Main] Translation failed:', err.message);
              text = `[${target.toUpperCase()}] ${text}`;
            }
          } else {
            console.log('[Main] Offline — translation skipped');
            text = `[${target.toUpperCase()}] ${text}`;
          }
        } else {
          console.log('[Main] No LLM provider — prepending language tag');
          text = `[${target.toUpperCase()}] ${text}`;
        }
      }

      console.log('[Main] Injecting text:', text.slice(0, 40));
      await releasePromise;

      const injectResult = await injectText(text);
      const durationMs = Date.now() - recordingStartedAt;
      addRecordingStats(durationMs, text.length);
      addHistoryEntry(text, text.length, originalText, refinementProvider?.name || null);

      setVoiceState('success');
      sendToRenderer('voice:recognition-done', { charCount: injectResult.charCount, durationMs: injectResult.durationMs });
    } catch (err: any) {
      console.error('[Main] Transcription error:', err.message);
      setVoiceState('idle');
    }
  });


  // DEBUG: save WAV for testing
  ipcMain.handle('debug:save-wav', async (_event, buffer: ArrayBuffer, filename: string) => {
    try {
      const fs = require('fs');
      const dir = join(app.getPath('userData'), 'debug_recordings');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(join(dir, filename), Buffer.from(buffer));
      console.log('[Debug] Saved:', join(dir, filename), 'size:', buffer.byteLength);
    } catch (err: any) {
      console.error('[Debug] Save failed:', err.message);
    }
  });

  ipcMain.handle('voice:copy-text', async (_event, text: string) => {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
  });

  // ── Window controls (frameless titlebar) ──────────────
  ipcMain.on('window:minimize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.minimize();
    }
  });
  ipcMain.on('window:maximize', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMaximized()) {
        settingsWindow.unmaximize();
      } else {
        settingsWindow.maximize();
      }
    }
  });
  ipcMain.on('window:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });

  // ── Settings sync from renderer ─────────────────────
  let currentLocale = 'en';
  ipcMain.handle('settings:set-mute-on-record', (_event, enabled: boolean) => {
    muteOnRecord = enabled;
    const filepath = getDataPath('settings.json');
    const existing = readJSON<any>(filepath, {});
    existing.muteOnRecord = enabled;
    writeJSON(filepath, existing);
    sendToRenderer('settings:changed', { muteOnRecord: enabled });
    updateTrayLanguage(tray, currentLocale, createSettingsWindow);
  });

  // ── Auto-update ─────────────────────────────────────
  if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'development') {
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false;

    autoUpdater.on('update-available', (info) => {
      console.log('[Updater] Update available:', info.version);
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.webContents.send('update:available', { version: info.version });
      }
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update:available', { version: info.version });
      }
    });

    autoUpdater.on('update-not-available', () => {
      console.log('[Updater] No update available');
    });

    autoUpdater.on('download-progress', (progress) => {
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update:progress', { percent: progress.percent });
      }
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('[Updater] Update downloaded');
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update:downloaded', {});
      }
    });

    autoUpdater.on('error', (err) => {
      console.error('[Updater] Error:', err.message);
    });

    ipcMain.handle('update:check', async () => {
      try {
        const result = await autoUpdater.checkForUpdates();
        return { updateAvailable: !!result?.updateInfo, version: result?.updateInfo?.version || null };
      } catch (err: any) {
        return { updateAvailable: false, version: null, error: err.message };
      }
    });

    ipcMain.handle('update:download', async () => {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    });

    ipcMain.handle('update:install', () => {
      autoUpdater.quitAndInstall();
    });

    // Check for updates 5s after startup (non-blocking)
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('[Updater] Initial check failed:', err.message);
      });
    }, 5000);
  }

  // Init recognition in background
  initRecognition();

  // Load record mode and mute-on-record from persisted settings
  recordMode = loadRecordMode();
  muteOnRecord = loadMuteOnRecord();

  const initLocale = app.getLocale()?.startsWith('zh') ? 'zh-CN' : 'en';
  currentLocale = initLocale;
  tray = createTray(initLocale, createSettingsWindow, recordMode, (mode) => {
    recordMode = mode;
    const filepath = getDataPath('settings.json');
    const existing = readJSON<any>(filepath, {});
    existing.recordMode = mode;
    writeJSON(filepath, existing);
  }, muteOnRecord, (enabled) => {
    muteOnRecord = enabled;
    const filepath = getDataPath('settings.json');
    const existing = readJSON<any>(filepath, {});
    existing.muteOnRecord = enabled;
    writeJSON(filepath, existing);
    sendToRenderer('settings:changed', { muteOnRecord: enabled });
  });
  setOnAsrProviderChange(async () => {
    console.log('[Main] ASR provider changed, re-initializing...');
    await initRecognition();
    console.log('[Main] Re-init complete. recReady:', recognitionReady);
  });
  startHotkey();

  // Show onboarding on first launch
  const settingsPath = getDataPath('settings.json');
  if (!require('fs').existsSync(settingsPath)) {
    createSettingsWindow(true);
  }
});

if (app) {
  app.on('window-all-closed', () => {
    // Don't quit — stays in tray
  });

  app.on('before-quit', () => {
    stopHotkey();
  });

  app.on('activate', () => {
    // On tray click
  });
}

} // end if (app) main process guard
