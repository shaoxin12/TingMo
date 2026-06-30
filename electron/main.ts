import { app, BrowserWindow, ipcMain, session, Tray } from 'electron';
import { autoUpdater } from 'electron-updater';
import { join } from 'path';
import { createTray, updateTrayState, updateTrayLanguage } from './tray';
import { startHotkey, stopHotkey, setHotkeyCallback, setHotkeyReleaseCallback, setEscCallback, waitForHotkeyRelease, setHookPaused, setTranslateCombo, setTranslateCallback, setTranslateReleaseCallback } from './hotkey';
import { VK_RMENU } from './hotkey-events';
import { injectText } from './text-inserter';
import { ensureModel } from '../src/services/model-downloader';
import { duckSystemAudio, unduckSystemAudio } from './audio-ducking';
import { addRecordingStats, addHistoryEntry, loadStats, loadHistory, clearHistory, loadOverview } from './stats-history';

import { SherpaASRProvider } from '../src/services/funasr-sherpa';
import { getLLMProvider, getASRCloudProvider } from '../src/services/llm-providers';

// Single instance lock — prevent double tray icon
// NOTE: 'app' may be undefined if Electron's built-in module injection is not yet active
// (happens in some sandboxed/dev environments). The if(app) guards are essential.
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
    policy.writeInt32LE(2, 0); // DWMNCRP_DISABLED = 2
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
let stuckWatchdog: ReturnType<typeof setTimeout> | null = null;
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

function loadAppSettings(): { recordMode: 'toggle' | 'hold'; muteOnRecord: boolean } {
  const settings = readJSON<any>(getDataPath('settings.json'), {});
  return {
    recordMode: settings.recordMode || 'toggle',
    muteOnRecord: settings.muteOnRecord ?? true,
  };
}

// Key name → VK code mapping for the recording hotkey (only modifier keys)
const MODIFIER_VK_MAP: Record<string, number> = {
  '右 Shift': 0xA1, 'Right Shift': 0xA1, '오른쪽 Shift': 0xA1,
  '右 Ctrl': 0xA3, 'Right Ctrl': 0xA3, '오른쪽 Ctrl': 0xA3,
  '左 Shift': 0xA0, 'Left Shift': 0xA0, '왼쪽 Shift': 0xA0,
  '左 Ctrl': 0xA2, 'Left Ctrl': 0xA2, '왼쪽 Ctrl': 0xA2,
  '右 Alt': 0xA5, 'Right Alt': 0xA5, '오른쪽 Alt': 0xA5,
  '左 Alt': 0xA4, 'Left Alt': 0xA4, '왼쪽 Alt': 0xA4,
};

// Extended VK_NAME_MAP — includes non-modifier keys for translate hotkey combos
const VK_NAME_MAP: Record<string, number> = {
  ...MODIFIER_VK_MAP,
  'Insert': 0x2D, 'Delete': 0x2E,
  'Home': 0x24, 'End': 0x23,
  'PageUp': 0x21, 'PageDown': 0x22,
  'F1': 0x70, 'F2': 0x71, 'F3': 0x72, 'F4': 0x73,
  'F5': 0x74, 'F6': 0x75, 'F7': 0x76, 'F8': 0x77,
  'F9': 0x78, 'F10': 0x79, 'F11': 0x7A, 'F12': 0x7B,
  'CapsLock': 0x14, 'ScrollLock': 0x91,
  'Space': 0x20, 'Tab': 0x09,
  'Enter': 0x0D, 'Backspace': 0x08,
  'Escape': 0x1B, 'Esc': 0x1B,
  'PrintScreen': 0x2C, 'Pause': 0x13,
};

let recordingHotkeyVK = VK_RMENU; // default: Right Alt

// Floating window dimensions — shared between createFloatingWindow and positionOnActiveDisplay
const FLOATING_WIN_WIDTH = 160;
const FLOATING_WIN_HEIGHT = 44;

function clearAutoDismiss(): void {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
}

// Recognition provider — lazy init
let recognitionProvider: any = null;
let recognitionReady = false;

// Cached local recognizer — initialized once, stays alive across provider switches
let cachedLocalProvider: any = null;
let cachedLocalReady = false;

// Cached fallback recognizer — avoids model reload on every call
let fallbackRecognizer: any = null;
let fallbackRecognizerReady = false;

function getFallbackRecognizer(): any {
  if (fallbackRecognizerReady && fallbackRecognizer) return fallbackRecognizer;
  const fs = require('fs');
  const path = require('path');
  const sherpa = require('sherpa-onnx');
  const modelDir = join(app.getPath('userData'), 'models', 'funasr');
  const modelPath = path.join(modelDir, 'model.int8.onnx');
  const tokensPath = path.join(modelDir, 'tokens.txt');
  if (!fs.existsSync(modelPath)) return null;
  const savedLang = readJSON<any>(getDataPath('settings.json'), {}).language || '';
  fallbackRecognizer = sherpa.createOfflineRecognizer({
    modelConfig: {
      senseVoice: { model: modelPath, language: savedLang || '', useInverseTextNormalization: 1 },
      tokens: tokensPath,
    },
  });
  fallbackRecognizerReady = true;
  console.log('[Main] Fallback recognizer cached');
  return fallbackRecognizer;
}

async function initRecognition(): Promise<void> {
  try {
    const fs = require('fs');

    // Dispose old non-cached provider before re-creating
    if (recognitionProvider && recognitionProvider !== cachedLocalProvider &&
        typeof recognitionProvider.dispose === 'function') {
      try { await recognitionProvider.dispose(); } catch { /* ignore */ }
    }
    recognitionProvider = null;
    recognitionReady = false;

    // Read ASR settings + key from settings.json
    const appSettings = readJSON<any>(getDataPath('settings.json'), {});
    const provider: 'local' | 'cloud' = appSettings.asrProvider || 'local';
    const asrCloudProviderKey: string = appSettings.asrCloudProvider || 'openai';
    const asrCloudModel: string = appSettings.asrCloudModel || 'whisper-1';
    const asrApiKey: string = appSettings.asrCloudApiKey || '';

    if (provider === 'cloud') {

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

      // Use cached provider if already initialized (avoids blocking re-load)
      if (cachedLocalReady && cachedLocalProvider) {
        recognitionProvider = cachedLocalProvider;
        recognitionReady = true;
        console.log('[Main] Using cached local recognizer');
      } else {
        const userModelDir = join(app.getPath('userData'), 'models', 'funasr');
        const userModel = join(userModelDir, 'model.int8.onnx');
        const userTokens = join(userModelDir, 'tokens.txt');

        if (fs.existsSync(userModel)) {
          console.log('[Main] Creating local recognizer from:', userModelDir);
          const appSettings = readJSON<any>(getDataPath('settings.json'), {});
          const provider = new SherpaASRProvider(userModelDir, appSettings.language || '');

          // Defer the blocking C++ model load so the UI doesn't freeze
          recognitionReady = false;
          setTimeout(async () => {
            try {
              const ready = await provider.initialize();
              cachedLocalProvider = provider;
              cachedLocalReady = ready;
              recognitionProvider = cachedLocalProvider;
              recognitionReady = ready;
              console.log('[Main] Local ASR ready:', ready);
            } catch (err: any) {
              console.error('[Main] Local ASR init failed:', err.message);
              recognitionReady = false;
            }
          }, 50);
          console.log('[Main] Local ASR loading deferred');
        } else {
          // Model not found — start background download, don't block app startup
          console.log('[Main] Model not found, starting background download...');
          downloadModel(join(app.getPath('userData'), 'models')).then(() => {
            console.log('[Main] Background model download complete, reinitializing...');
            initRecognition();
          }).catch((err: any) => {
            console.error('[Main] Background model download failed:', err.message);
          });
          recognitionReady = false;
        }
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
  console.log('[Main] initRefinement() called');
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

// ── Pinyin helper ──────────────────────────────────────────────
const pinyinLib = require('pinyin');
const pinyinFn: (text: string) => string[][] = pinyinLib.default || pinyinLib;

/** Convert text to a flat, tone-stripped, lowercased pinyin string for comparison */
function toPinyinFlat(text: string): string {
  const result = pinyinFn(text);
  return result
    .map((p: string[]) => (p[0] || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
    .join('')
    .toLowerCase();
}

/** Split text into characters (Unicode-aware) and return their flat pinyin */
function toCharPinyins(text: string): string[] {
  const chars = [...text];
  return chars.map(c => toPinyinFlat(c));
}

// ── Dictionary correction ──────────────────────────────────────
// Three-layer matching: exact → pinyin (homophones) → Levenshtein (English variants)
function applyDictionary(text: string, dictionary: Array<{word: string; replace: string}>): string {
  // Pre-compute per-character pinyin for the entire text (one conversion pass)
  const charPinyins = toCharPinyins(text);

  for (const entry of dictionary) {
    const { word, replace } = entry;

    // Layer 1: text already contains the correct term — skip
    if (text.includes(replace)) continue;

    const wlen = word.length;
    const targetPinyin = toPinyinFlat(word);
    let matched = false;

    // Layer 2: Pinyin matching — catches Chinese homophone errors
    // Iterate len descending — longer (more complete) matches win
    const minLen2 = Math.max(1, wlen - 1);
    const maxLen2 = Math.min(wlen + 2, charPinyins.length);
    for (let i = 0; i <= charPinyins.length; i++) {
      for (let len = Math.min(maxLen2, charPinyins.length - i); len >= minLen2; len--) {
        const subPinyin = charPinyins.slice(i, i + len).join('');
        const sub = [...text].slice(i, i + len).join('');

        // Exact pinyin match — same sound, wrong characters
        if (subPinyin === targetPinyin) {
          text = text.slice(0, i) + replace + text.slice(i + len);
          matched = true;
          break;
        }

        // Near pinyin match — handles polyphone / tone edge cases
        const pDist = levenshtein(subPinyin, targetPinyin);
        if (pDist <= 1 && pDist < targetPinyin.length * 0.5) {
          text = text.slice(0, i) + replace + text.slice(i + len);
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (matched) continue;

    // Layer 3: Levenshtein on normalized text — only for terms with ASCII letters
    // (Chinese homophones are already handled by pinyin; Levenshtein catches English spelling variants)
    if (!/[a-zA-Z]/.test(word)) continue;

    const maxDist = wlen <= 3 ? 1 : 2;
    const wordNorm = word.toLowerCase().replace(/\s+/g, '');
    const minLen3 = Math.max(1, wlen - 2);
    const maxLen3 = Math.min(wlen + 2, text.length);
    for (let i = 0; i <= text.length; i++) {
      for (let len = Math.min(maxLen3, text.length - i); len >= minLen3; len--) {
        const sub = text.slice(i, i + len);
        const subNorm = sub.toLowerCase().replace(/\s+/g, '');
        const dist = levenshtein(subNorm, wordNorm);
        if (dist <= maxDist && dist < wordNorm.length * 0.6) {
          text = text.slice(0, i) + replace + text.slice(i + len);
          matched = true;
          break;
        }
      }
      if (matched) break;
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
    width: FLOATING_WIN_WIDTH,
    height: FLOATING_WIN_HEIGHT,
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

  // Ensure web contents also has no background + drain pending state
  win.webContents.on('did-finish-load', () => {
    win?.webContents.insertCSS('html,body,#root{background:transparent !important}');
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
  floatingReady = false;

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173/#/');
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
function positionOnActiveDisplay(win: BrowserWindow, width?: number, height?: number): void {
  const w = width ?? FLOATING_WIN_WIDTH;
  const h = height ?? FLOATING_WIN_HEIGHT;
  const d = getCursorDisplay();
  const bounds = d.bounds;
  const wa = d.workArea;
  const taskbarH = (bounds.y + bounds.height) - (wa.y + wa.height);
  const x = Math.round(bounds.x + (bounds.width - w) / 2);
  const y = bounds.y + bounds.height - taskbarH - h - 6;
  win.setBounds({ x, y, width: w, height: h });
}

function showFloatingWindow(): void {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    floatingWindow = createFloatingWindow();
  }
  positionOnActiveDisplay(floatingWindow);
  floatingWindow.showInactive();
  // Override any DWM async adjustment after show
  setImmediate(() => {
    if (floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isVisible()) {
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
  // Clear stuck watchdog when leaving recognizing
  if (state !== 'recognizing' && stuckWatchdog) {
    clearTimeout(stuckWatchdog);
    stuckWatchdog = null;
  }

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

  // Reset sticky translateMode when starting a new recording without modifier.
  // If translateMode was already set (standalone translate hotkey), keep it.
  if (currentState === 'idle') {
    if (!translateMode) translateMode = modifierDown;
  }

  if (recordMode === 'hold') {
    // Hold mode: press to start recording, release to stop
    if (currentState === 'idle') {
      showFloatingWindow();
      if (translateMode) {
        sendToRenderer('voice:translate-mode', { enabled: true });
      }
      setVoiceState('recording');
    } else if (currentState !== 'recording') {
      // Any non-recording state (error/success/stuck recognizing): reset
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
      if (stuckWatchdog) clearTimeout(stuckWatchdog);
      stuckWatchdog = setTimeout(() => {
        if (currentState === 'recognizing') {
          console.error('[Main] Stuck in recognizing, force resetting');
          setVoiceState('idle');
          hideFloatingWindow();
          translateMode = false;
          sendToRenderer('voice:state-change', { state: 'idle' });
        }
        stuckWatchdog = null;
      }, 15000);
      break;
    }
    // Any other state (error/success/recognizing/refining): reset to idle.
    // This handles the case where a previous session got stuck and the
    // hotkey was consumed without triggering — next press resets cleanly.
    default: {
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
setTranslateCallback(() => {
  translateMode = true;
  handleHotkeyPress();
});
setTranslateReleaseCallback(() => {
  handleHotkeyRelease();
});
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
    try {
      const filepath = getDataPath('settings.json');
      const existing = readJSON<any>(filepath, {});
      existing.asrCloudApiKey = key;
      writeJSON(filepath, existing);
    } catch (err: any) {
      console.error('[Main] Failed to save ASR key:', err.message);
    }
  });

  ipcMain.handle('settings:get-asr-cloud-api-key', async () => {
    const settings = readJSON<any>(getDataPath('settings.json'), {});
    return settings.asrCloudApiKey || '';
  });
}

// App Lifecycle
if (app) {
  app.whenReady().then(async () => {
  console.log('[Main] ====== App ready, initializing ======');

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
    const filepath = getDataPath('settings.json');
    const existing = readJSON<any>(filepath, {});
    Object.assign(existing, settings);
    try {
      writeJSON(filepath, existing);
    } catch (err: any) {
      console.error('[Main] Failed to save settings:', err.message);
      throw err; // Propagate to renderer so it knows save failed
    }
    if (typeof settings.recordMode === 'string') {
      recordMode = (settings as any).recordMode;
    }
    if (typeof settings.launchAtStartup === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup as boolean });
    }
    // Notify settings window so its Zustand store stays in sync
    // (tray popup and settings are separate BrowserWindows with separate stores)
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:changed', settings);
    }
  });

  ipcMain.handle('stats:get', () => loadStats());
  ipcMain.handle('stats:overview', () => loadOverview());
  ipcMain.handle('history:get', () => loadHistory());
  ipcMain.handle('history:clear', () => { clearHistory(); });
  // Translate hotkey:
  // - If combo includes recording hotkey VK → modifier mode (hold other key + press hotkey)
  // - Otherwise → independent combo (press all keys together)
  ipcMain.handle('settings:set-translate-hotkey', (_event, hotkey: string) => {
    const parts = hotkey.split(' + ');
    const vks = parts.map(p => VK_NAME_MAP[p] ?? 0).filter(v => v !== 0);
    if (vks.includes(recordingHotkeyVK)) {
      // Contains recording hotkey → modifier mode (legacy)
      const modVks = vks.filter(v => v !== recordingHotkeyVK);
      translateModifierVK = modVks.length > 0 ? modVks[modVks.length - 1] : 0xA1;
      setTranslateCombo([]);
      console.log('[Main] Translate hotkey:', hotkey, '→ modifier mode, modVK =', translateModifierVK);
    } else {
      // Independent combo
      setTranslateCombo(vks);
      translateModifierVK = 0;
      console.log('[Main] Translate hotkey:', hotkey, '→ combo mode, VKs =', vks);
    }
  });

  // Allow renderer to resize the floating window (e.g. error panel expansion)
  ipcMain.handle('floating:resize', (_event, width: number, height: number) => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      positionOnActiveDisplay(floatingWindow, width, height);
    }
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

  // Pause/resume hotkey hook — used when recording a new hotkey in settings
  ipcMain.handle('hotkey:pause', (_event, paused: boolean) => {
    setHookPaused(paused);
    console.log('[Main] Hotkey hook paused:', paused);
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
    const settings = readJSON<any>(getDataPath('settings.json'), {});
    return settings.llmApiKey || '';
  });

  ipcMain.handle('settings:set-api-key', (_event, key: string) => {
    try {
      const filepath = getDataPath('settings.json');
      const existing = readJSON<any>(filepath, {});
      existing.llmApiKey = key;
      writeJSON(filepath, existing);
    } catch (err: any) {
      console.error('[Main] Failed to save LLM key:', err.message);
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
  function findTokensFile(modelDir: string): string | null {
    const fs = require('fs');
    const directPath = join(modelDir, 'tokens.txt');
    if (fs.existsSync(directPath)) return directPath;
    // Search subdirectories (model may have been extracted into a subfolder from tar archive)
    for (const entry of fs.readdirSync(modelDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const p = join(modelDir, entry.name, 'tokens.txt');
        if (fs.existsSync(p)) return p;
      }
    }
    return null;
  }

  ipcMain.handle('model:check', () => {
    const modelDir = join(app.getPath('userData'), 'models', 'funasr');
    const modelPath = join(modelDir, 'model.int8.onnx');
    const fs = require('fs');
    const modelExists = fs.existsSync(modelPath);
    const tokensPath = findTokensFile(modelDir);
    const exists = modelExists && tokensPath !== null;
    return { exists, path: exists ? modelPath : null };
  });

  ipcMain.handle('model:ensure', async () => {
    const modelDir = join(app.getPath('userData'), 'models');
    try {
      const modelPath = await downloadModel(modelDir);
      initRecognition();
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
  // Streaming ASR: process a small chunk, return raw text only (no filter/refine/inject).
  // Always uses the primary recognizer. Never falls back to the fallback instance
  // because it's a single non-thread-safe sherpa-onnx object — concurrent stream
  // creation would corrupt results. If the primary is busy (processing a previous
  // chunk), wait briefly — a 2-second chunk takes <500ms so the wait is minimal.
  ipcMain.handle('voice:asr-chunk', async (_event, wavBuf: ArrayBuffer) => {
    const buf = Buffer.from(wavBuf);
    const numSamples = Math.floor((buf.length - 44) / 2);
    const samples = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) samples[i] = buf.readInt16LE(44 + i * 2) / 32768;

    const userLang = readJSON<any>(getDataPath('settings.json'), {}).language || 'auto';
    const chunkSecs = (numSamples / 16000).toFixed(1);

    if (recognitionReady && recognitionProvider) {
      // Wait for primary recognizer if it's busy (previous chunk still processing).
      const waitStart = Date.now();
      while ((recognitionProvider as any).isBusy && Date.now() - waitStart < 5000) {
        await new Promise(r => setTimeout(r, 50));
      }
      const waitedMs = Date.now() - waitStart;
      if (waitedMs > 100) console.log('[Main] asr-chunk waited', waitedMs, 'ms for primary');

      if (typeof recognitionProvider.transcribeRaw === 'function') {
        try {
          const t0 = Date.now();
          const result = await recognitionProvider.transcribeRaw(samples, 16000, userLang);
          const text = result?.text || '';
          console.log(`[Main] asr-chunk ${chunkSecs}s → ${text.length}chars "${text.slice(0, 60)}" in ${Date.now() - t0}ms`);
          return text;
        } catch (e) {
          console.warn('[Main] asr-chunk transcribeRaw failed:', (e as Error).message);
          return '';
        }
      }
    }

    console.log('[Main] asr-chunk SKIP: ready=', recognitionReady, 'provider=', !!recognitionProvider);
    return '';
  });

  // ── Streaming ASR lifecycle (Volcano WebSocket) ──────────
  // Allows cloud ASR to process audio incrementally during recording,
  // so the result is ready almost instantly when recording stops.
  ipcMain.handle('voice:asr-stream-start', async (_event, sampleRate: number, lang: string) => {
    if (recognitionProvider?.startStream) {
      console.log('[Main] ASR stream start, provider:', recognitionProvider.name);
      try {
        await recognitionProvider.startStream(sampleRate, lang);
      } catch (e) {
        // Session setup failed (e.g. WS closed before handshake) —
        // don't crash the handler; endStream / transcribe will fall back.
        console.error('[Main] ASR stream start failed (non-fatal):', (e as Error).message);
      }
    }
  });

  ipcMain.handle('voice:asr-stream-chunk', async (_event, wavBuf: ArrayBuffer) => {
    if (recognitionProvider?.sendStreamChunk) {
      recognitionProvider.sendStreamChunk(Buffer.from(wavBuf));
    }
  });

  ipcMain.handle('voice:asr-stream-end', async () => {
    if (recognitionProvider?.endStream) {
      const text = await recognitionProvider.endStream();
      console.log('[Main] ASR stream end, text:', text.length, 'chars');
      return text;
    }
    return '';
  });

  ipcMain.handle('voice:transcribe', async (_event, audioBuffer: ArrayBuffer, language?: string, options?: {
    translate?: boolean; translateTarget?: string; dictionary?: Array<{word: string; replace: string}>;
    polishMode?: string; preAsrText?: string;
  }) => {
    // Safety timeout: abort ASR after 20s so a long full-ASR run can't hang
    // forever. The aborted transcribe returns whatever partial text it has; if
    // empty, we fall back to preAsrText below. Never silently drops output.
    // Declared outside try so the catch block can clear it.
    const abortController = new AbortController();
    let safetyTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      safetyTimer = setTimeout(() => {
        console.error('[Main] Transcribe safety timeout — aborting ASR');
        abortController.abort();
      }, 20000);

      const tStart = Date.now();
      console.log('[Main] Transcribe: buffer =', audioBuffer.byteLength, 'bytes, lang =', language, 'translate =', options?.translate, 'target =', options?.translateTarget);
      const buf = Buffer.from(audioBuffer);
      let text = '';

      // Start key-release wait now — runs in parallel with ASR
      const releasePromise = waitForHotkeyRelease(150);

      // Debug WAV save — non-blocking
      setImmediate(() => {
        try {
          const fs = require('fs');
          const debugDir = join(app.getPath('userData'), 'debug_recordings');
          if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
          fs.writeFileSync(join(debugDir, `tingmo_${Date.now()}.wav`), buf);
        } catch { /* ignore */ }
      });

      // ── ASR Inference ────────────────────────────────────
      const asrStart = Date.now();

      // Use streaming preAsrText when available — avoids redundant full ASR re-run.
      // Streaming results come from the same recognizer with same accuracy.
      // Long recordings: trust the streaming result — full ASR on long audio will
      // hit the safety timeout. Only fall back for short audio with a suspiciously
      // empty streaming result.
      let usePreAsr = false;
      let preAsrSaved = '';
      if (options?.preAsrText && options.preAsrText.trim().length > 0) {
        const preAsr = options.preAsrText.trim();
        preAsrSaved = preAsr;
        const audioSecs = (buf.length - 44) / 32000; // WAV bytes to seconds
        const shouldFallback = audioSecs <= 20 && preAsr.length < 4;
        if (shouldFallback) {
          console.log('[Main] Streaming result too short for', audioSecs.toFixed(1), 's audio (got', preAsr.length, 'chars), running full ASR');
        } else {
          usePreAsr = true;
          text = preAsr;
          console.log('[Main] Using pre-asr text, skipping full ASR:', text.length, 'chars —', text.slice(0, 60));
        }
      }
      if (!usePreAsr) {
      const asrMode = readJSON<any>(getDataPath('settings.json'), {}).asrProvider || 'local';
      if (asrMode === 'cloud') {
        if (!recognitionReady || !recognitionProvider) {
          throw new Error('Cloud ASR not ready — please check API key and connection in Settings');
        }
        console.log('[Main] ASR start, provider:', recognitionProvider.name);
        const result = await recognitionProvider.transcribe(buf, 16000, language || 'auto', abortController.signal);
        text = result.text || '';
        console.log('[Main] ASR done in', Date.now() - asrStart, 'ms, text:', text.length, 'chars —', text.slice(0, 60));
      } else {
        if (recognitionReady && recognitionProvider) {
          console.log('[Main] ASR start (local)');
          const result = await recognitionProvider.transcribe(buf, 16000, language || 'auto', abortController.signal);
          text = result.text || '';
          console.log('[Main] ASR done in', Date.now() - asrStart, 'ms, text:', text.length, 'chars —', text.slice(0, 60));
        } else {
          console.log('[Main] ASR start (local fallback)');
          const rec = getFallbackRecognizer();
          if (!rec) {
            throw new Error('Model not found — please download SenseVoice model in Settings');
          }
          const numSamples = Math.floor((buf.length - 44) / 2);
          const samples = new Float32Array(numSamples);
          for (let i = 0; i < numSamples; i++) {
            samples[i] = buf.readInt16LE(44 + i * 2) / 32768;
          }
          const totalSecs = numSamples / 16000;
          if (totalSecs <= 14) {
            const stream = rec.createStream();
            stream.acceptWaveform(16000, samples);
            rec.decode(stream);
            text = rec.getResult(stream).text || '';
            stream.free();
          } else {
            // Chunked for long audio
            const CHUNK = 12 * 16000, OVERLAP = 16000, STEP = CHUNK - OVERLAP;
            const count = Math.ceil((numSamples - OVERLAP) / STEP);
            const parts: string[] = [];
            for (let c = 0; c < count; c++) {
              if (abortController.signal.aborted) break;
              const s = c * STEP, e = Math.min(s + CHUNK, numSamples);
              const st = rec.createStream();
              st.acceptWaveform(16000, samples.slice(s, e));
              rec.decode(st);
              parts.push(rec.getResult(st).text || '');
              st.free();
            }
            let deduped = parts[0] || '';
            for (let i = 1; i < parts.length; i++) {
              let cut = 0;
              for (let len = Math.min(parts[i - 1].length, parts[i].length, 15); len >= 2; len--) {
                if (parts[i].startsWith(parts[i - 1].slice(-len))) { cut = len; break; }
              }
              deduped += cut > 0 ? parts[i].slice(cut) : parts[i];
            }
            text = deduped;
          }
          console.log('[Main] ASR done in', Date.now() - asrStart, 'ms, text:', text.length, 'chars —', text.slice(0, 60));
        }
      }
      // Fallback: ASR aborted/empty but we have streaming preAsrText — use it
      // rather than dropping output entirely (e.g. long recording hit safety timeout).
      if ((!text || text.trim().length === 0) && preAsrSaved) {
        console.log('[Main] ASR returned empty, falling back to preAsrText:', preAsrSaved.length, 'chars');
        text = preAsrSaved;
      }
      } // end else (preAsrText / ASR inference)

      // Filter silence hallucinations — SenseVoice outputs spurious tokens for near-silent input.
      // Two layers: (1) quick full-match on common single-token outputs,
      // (2) ratio check — if ≥80% of characters are hallucination tokens, treat as silence.
      const HALLUCINATION_WORDS = new Set([
        // English single letters (silence artifacts)
        'I', 'a', 'A', 'i',
        // Unambiguous filler / breath tokens
        'um', 'Um', 'uh', 'Uh', 'hmm', 'Hmm', 'Huh',
        'oh', 'Oh', 'ah', 'Ah', 'eh', 'Eh', 'er', 'Er', 'mm', 'Mm',
        // Chinese unambiguous filler
        '嗯', '啊', '哦', '呃', '额', '唔',
        // Punctuation / symbols
        '.', '。', ',', '，', '!', '！', '?', '？', '...', '……',
        '、', '~', '～', '-', '—',
      ]);

      // Quick exact match: text is either empty or exactly matches a known filler token
      const trimmed = text.trim();
      if (trimmed.length < 1 || HALLUCINATION_WORDS.has(trimmed)) {
        console.log('[Main] Silence hallucination filtered (exact):', trimmed);
        clearTimeout(safetyTimer);
        setVoiceState('idle');
        hideFloatingWindow();
        translateMode = false;
        return;
      }

      // Ratio check: if ≥80% of content chars are hallucination tokens, filter it
      const content = text.replace(/[，。？、！，,.!\?\s　…~～—\-、]/g, '').trim();
      if (content.length > 0) {
        // Split into segments by punctuation
        const segments = content.split(/[，。？、！，,.!\?\s　…~～—\-、]+/).filter(s => s.length > 0);
        let hallucinated = 0;
        for (const seg of segments) {
          // A segment is hallucinated if it's a single letter or matches a known filler
          if (seg.length === 1 && /[a-zA-Z]/.test(seg)) { hallucinated++; continue; }
          if (HALLUCINATION_WORDS.has(seg)) { hallucinated++; continue; }
          // All English single letters separated by spaces → hallucination
          if (/^[a-zA-Z](\s+[a-zA-Z])*$/.test(seg)) { hallucinated++; continue; }
        }
        // Only apply ratio filter with enough segments; raise threshold to 85%
        if (segments.length >= 3 && hallucinated >= segments.length * 0.85) {
          console.log('[Main] Silence hallucination filtered (ratio):', text.slice(0, 80));
          clearTimeout(safetyTimer);
          setVoiceState('idle');
          hideFloatingWindow();
          translateMode = false;
          return;
        }
      }

      // Clean spurious punctuation from long pauses:
      // Remove sequences like "，。，" or "。、" → "。"
      // Remove isolated punctuation between valid text segments
      text = text
        .replace(/([，。、！？,\.!\?])([，。、！？,\.!\?\s])+/g, '$1')
        .replace(/([，。、！？,\.!\?])\1+/g, '$1')
        .replace(/^[，。、！？,\.!\?\s]+/, '')
        .replace(/[，。、！？,\.!\?\s]+$/, '')
        // ITN may produce spurious punctuation at chunk boundaries —
        // sentence-ending marks absorb trailing mid-sentence marks
        .replace(/([。！？])([，、。！？,\.!\?]+)/g, '$1')
        // comma before sentence-ending mark → drop the comma
        .replace(/[，,]([。！？])/g, '$1')
        .trim();
      // Dictionary fuzzy correction — always runs, offline or online
      if (options?.dictionary && options.dictionary.length > 0 && text.length > 0) {
        text = applyDictionary(text, options.dictionary);
        console.log('[Main] After dictionary:', text.slice(0, 80));
      }

      // Check if auto-refinement is enabled in settings
      let refineEnabled = false;
      try {
        const fs = require('fs');
        const settingsPath = getDataPath('settings.json');
        if (fs.existsSync(settingsPath)) {
          refineEnabled = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')).refineEnabled ?? false;
        }
      } catch { /* use default */ }

      // LLM Refinement — stream if available, inject raw text first for instant feedback
      let originalText = text;
      const rawText = text;
      const doRefine = refineEnabled && refinementReady && refinementProvider && text.trim().length > 5 && !options?.translate;
      console.log('[Main] Refine check: enabled=', refineEnabled, 'ready=', refinementReady, 'provider=', !!refinementProvider, 'textLen=', text.trim().length, 'translate=', !!options?.translate);

      let refineDone = false;
      let injectResult: any = null;

      if (doRefine) {
        // Stream LLM output directly to cursor — no raw→backspace flicker.
        // Each chunk is injected as it arrives (progressive typewriter effect).
        setVoiceState('refining');
        const ctx = {
          language,
          dictionary: options?.dictionary ?? [],
          polishMode: (options as any)?.polishMode || 'balanced',
        };

        try {
          if (refinementProvider.streamRefine) {
            let fullText = '';
            for await (const chunk of refinementProvider.streamRefine(rawText, ctx)) {
              fullText += chunk;
              injectResult = await injectText(chunk);
            }
            text = fullText.trim() || rawText;
          } else {
            const result = await refinementProvider.refine(rawText, ctx);
            text = result.refinedText || rawText;
            injectResult = await injectText(text);
          }
          refineDone = true;
          console.log('[Main] Refined:', text.slice(0, 80));
        } catch (err: any) {
          console.error('[Main] Refine failed, injecting raw ASR:', err.message);
          sendToRenderer('voice:refine-failed', { error: err.message });
          if (!injectResult) injectResult = await injectText(rawText);
          text = rawText;
        }
        addHistoryEntry(text, text.length, originalText, refinementProvider?.name || null);
      }

      // LLM Translation
      let translationFailed = false;
      if (options?.translate && text.trim()) {
        const target = options.translateTarget || 'en';
        console.log('[Main] Translating to', target, ':', text.slice(0, 40));
        if (refinementReady && refinementProvider) {
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
            sendToRenderer('voice:refine-failed', { error: `翻译失败：${err.message}` });
            translationFailed = true;
          }
        } else {
          console.log('[Main] Translation skipped: LLM not available');
          sendToRenderer('voice:refine-failed', { error: '请先在设置 → 模型中配置 LLM 大模型' });
          translationFailed = true;
        }
      }

      console.log('[Main] Total transcribe time:', Date.now() - tStart, 'ms, injecting:', text.slice(0, 40));
      await releasePromise;

      // Inject text — skip if translation failed
      if (!translationFailed && !refineDone && !injectResult) {
        injectResult = await injectText(text);
      }

      if (!doRefine) {
        const durationMs = Date.now() - recordingStartedAt;
        addRecordingStats(durationMs, text.length);
        addHistoryEntry(text, text.length, originalText, refinementProvider?.name || null);
        clearTimeout(safetyTimer);
        setVoiceState('success');
        sendToRenderer('voice:recognition-done', { charCount: injectResult?.charCount || text.length, durationMs: injectResult?.durationMs || durationMs });
      } else {
        clearTimeout(safetyTimer);
        const durationMs = Date.now() - recordingStartedAt;
        setVoiceState('success');
        sendToRenderer('voice:recognition-done', { charCount: injectResult?.charCount || text.length, durationMs: injectResult?.durationMs || durationMs });
      }
    } catch (err: any) {
      if (safetyTimer) clearTimeout(safetyTimer);
      console.error('[Main] Transcription error:', err.message);
      setVoiceState('idle');
      hideFloatingWindow();
      translateMode = false;
      sendToRenderer('voice:state-change', { state: 'idle' });
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

  // Play system notification sound via Win32 MessageBeep.
  // MB_ICONASTERISK = pleasant high-pitched chime built into Windows.
  let _msgBeep: any = null;
  ipcMain.handle('voice:play-sound', async () => {
    try {
      if (!_msgBeep) {
        const user32 = koffi.load('user32.dll');
        _msgBeep = user32.func('int MessageBeep(int)');
      }
      _msgBeep(0x00000040); // MB_ICONASTERISK
    } catch { /* ignore */ }
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

  // Init recognition and refinement in background
  console.log('[Main] Starting initRecognition + initRefinement...');
  initRecognition();
  initRefinement();
  console.log('[Main] initRecognition + initRefinement dispatched');

  // Load record mode and mute-on-record from persisted settings (one read)
  const loaded = loadAppSettings();
  recordMode = loaded.recordMode;
  muteOnRecord = loaded.muteOnRecord;

  // Init translate hotkey from saved settings
  const initSettings = readJSON<any>(getDataPath('settings.json'), {});
  if (initSettings.translateHotkey) {
    const parts = (initSettings.translateHotkey as string).split(' + ');
    const vks = parts.map((p: string) => VK_NAME_MAP[p] ?? 0).filter((v: number) => v !== 0);
    if (vks.includes(recordingHotkeyVK)) {
      const modVks = vks.filter((v: number) => v !== recordingHotkeyVK);
      translateModifierVK = modVks.length > 0 ? modVks[modVks.length - 1] : 0xA1;
      console.log('[Main] Translate hotkey init:', initSettings.translateHotkey, '→ modifier mode');
    } else {
      setTranslateCombo(vks);
      console.log('[Main] Translate hotkey init:', initSettings.translateHotkey, '→ combo mode');
    }
  }

  const initLocale = app.getLocale()?.startsWith('zh') ? 'zh-CN' : 'en';
  currentLocale = initLocale;
  tray = createTray(
    initLocale,
    createSettingsWindow,
    // ASR provider — read fresh from disk (menu rebuilds each right-click)
    () => (readJSON<any>(getDataPath('settings.json'), {}).asrProvider || 'local') as 'local' | 'cloud',
    (p) => {
      const filepath = getDataPath('settings.json');
      const existing = readJSON<any>(filepath, {});
      existing.asrProvider = p;
      writeJSON(filepath, existing);
      initRecognition();
      // Notify settings window to sync
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:changed', { asrProvider: p });
      }
    },
    // Record mode
    () => recordMode,
    (mode) => {
      recordMode = mode;
      const filepath = getDataPath('settings.json');
      const existing = readJSON<any>(filepath, {});
      existing.recordMode = mode;
      writeJSON(filepath, existing);
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:changed', { recordMode: mode });
      }
    },
    // Mute on record
    () => muteOnRecord,
    (enabled) => {
      muteOnRecord = enabled;
      const filepath = getDataPath('settings.json');
      const existing = readJSON<any>(filepath, {});
      existing.muteOnRecord = enabled;
      writeJSON(filepath, existing);
      sendToRenderer('settings:changed', { muteOnRecord: enabled });
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('settings:changed', { muteOnRecord: enabled });
      }
    },
  );
  // Restore saved hotkey from settings, or default to VK_RMENU (Right Alt)
  const savedHotkeyName = readJSON<any>(getDataPath('settings.json'), {}).hotkey || '';
  const savedVk = savedHotkeyName ? VK_NAME_MAP[savedHotkeyName] : undefined;
  recordingHotkeyVK = savedVk || VK_RMENU;
  startHotkey(recordingHotkeyVK);
  console.log('[Main] Hotkey initialized:', savedHotkeyName || '右 Alt', 'VK =', recordingHotkeyVK);

  // ── App quit IPC ────────────────────────────────────
  ipcMain.handle('app:quit', () => {
    app.quit();
  });
  ipcMain.handle('settings:set-record-mode', (_event, mode: 'toggle' | 'hold') => {
    recordMode = mode;
    const settings = readJSON<any>(getDataPath('settings.json'), {});
    settings.recordMode = mode;
    writeJSON(getDataPath('settings.json'), settings);
  });

  // Open the folder containing a file in Explorer (used by ModelPanel path click)
  ipcMain.handle('shell:open-folder', (_event, filePath: string) => {
    const { shell } = require('electron');
    const path = require('path');
    shell.openPath(path.dirname(filePath));
  });

  // Always show settings window on launch (user expectation when double-clicking desktop icon)
  const settingsPath = getDataPath('settings.json');
  const isFirstLaunch = !require('fs').existsSync(settingsPath);
  createSettingsWindow(isFirstLaunch);
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
