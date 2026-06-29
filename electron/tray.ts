import { Tray, BrowserWindow, nativeImage, NativeImage, app, screen } from 'electron';
import { join } from 'path';
import { trayT } from './tray-i18n';

type Locale = string;

// Load base icon from assets (also used as app icon)
const baseIconPath = join(__dirname, '../assets/icons/icon.png');
let baseIcon: NativeImage;

function loadBaseIcon(): NativeImage {
  if (!baseIcon) {
    baseIcon = nativeImage.createFromPath(baseIconPath);
  }
  return baseIcon;
}

function createTrayIcon(state: 'default' | 'recording' | 'recognizing'): NativeImage {
  const img = loadBaseIcon().resize({ width: 32, height: 32, quality: 'best' });

  if (state === 'recording') return tintIcon(img, 255, 85, 85);
  if (state === 'recognizing') return tintIcon(img, 74, 144, 255);
  return img;
}

const TINT_ICON_SIZE = 32;
const TINT_RADIUS = 10;
const TINT_THRESHOLD_SQ = 22;

function tintIcon(icon: NativeImage, r: number, g: number, b: number): NativeImage {
  const size = TINT_ICON_SIZE;
  const buf = icon.toBitmap();
  for (let py = size / 2; py < size; py++) {
    for (let px = size / 2; px < size; px++) {
      const dx = px - size + TINT_RADIUS;
      const dy = py - size + TINT_RADIUS;
      if (dx * dx + dy * dy > TINT_THRESHOLD_SQ) continue;
      const idx = (py * size + px) * 4;
      buf[idx] = b;
      buf[idx + 1] = g;
      buf[idx + 2] = r;
      buf[idx + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

// ── Tray popup window ─────────────────────────────────────

const POPUP_WIDTH = 220;
const POPUP_HEIGHT = 316;

let popupWin: BrowserWindow | null = null;

function getPopupPosition(tray: Tray): { x: number; y: number } {
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });
  const workArea = display.workArea;

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2);
  let y = trayBounds.y - POPUP_HEIGHT - 4;

  // Keep within screen bounds
  if (x < workArea.x) x = workArea.x + 4;
  if (x + POPUP_WIDTH > workArea.x + workArea.width) x = workArea.x + workArea.width - POPUP_WIDTH - 4;
  if (y < workArea.y) y = trayBounds.y + trayBounds.height + 4;

  return { x, y };
}

function createPopupWindow(tray: Tray): BrowserWindow {
  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.close();
  }

  const { x, y } = getPopupPosition(tray);

  popupWin = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    x,
    y,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    hasShadow: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  popupWin.setBackgroundColor('#00000000');

  if (process.env.NODE_ENV === 'development') {
    popupWin.loadURL('http://localhost:5173/#/tray-popup');
  } else {
    popupWin.loadFile(join(__dirname, '../dist/index.html'), { hash: '/tray-popup' });
  }

  popupWin.on('blur', () => {
    closePopup();
  });

  return popupWin;
}

function closePopup(): void {
  if (popupWin && !popupWin.isDestroyed()) {
    popupWin.close();
  }
  popupWin = null;
}

export function closeTrayPopup(): void {
  closePopup();
}

// ── Public API ────────────────────────────────────────────

let recordMode: 'toggle' | 'hold' = 'toggle';
let onRecordModeChange: ((mode: 'toggle' | 'hold') => void) | null = null;
let muteOnRecord = true;
let onMuteOnRecordChange: ((enabled: boolean) => void) | null = null;

function handleRecordModeChange(mode: 'toggle' | 'hold'): void {
  recordMode = mode;
  onRecordModeChange?.(mode);
}
function handleMuteOnRecordChange(enabled: boolean): void {
  muteOnRecord = enabled;
  onMuteOnRecordChange?.(enabled);
}

export function createTray(
  locale: Locale,
  openSettings: () => void,
  initialRecordMode: 'toggle' | 'hold',
  onRecordModeChangeCb: (mode: 'toggle' | 'hold') => void,
  initialMuteOnRecord: boolean,
  onMuteOnRecordChangeCb: (enabled: boolean) => void,
): Tray {
  recordMode = initialRecordMode;
  onRecordModeChange = onRecordModeChangeCb;
  muteOnRecord = initialMuteOnRecord;
  onMuteOnRecordChange = onMuteOnRecordChangeCb;
  const icon = createTrayIcon('default');
  const tray = new Tray(icon);
  tray.setToolTip(trayT(locale, 'tray.tooltip'));

  // Right-click → show styled popup
  tray.on('right-click', () => {
    createPopupWindow(tray);
  });

  // Left-click → open settings
  tray.on('click', () => openSettings());

  return tray;
}

export function updateTrayLanguage(tray: Tray | null, locale: Locale, _openSettings: () => void): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(trayT(locale, 'tray.tooltip'));
}

export function updateTrayState(
  existingTray: Tray | null,
  state: 'default' | 'recording' | 'recognizing',
): void {
  if (!existingTray || existingTray.isDestroyed()) return;
  const icon = createTrayIcon(state);
  existingTray.setImage(icon);
}
