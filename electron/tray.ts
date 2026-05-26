import { Tray, Menu, nativeImage, NativeImage, app } from 'electron';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { trayT } from './tray-i18n';

type Locale = string;

let asrProvider: 'local' | 'cloud' = 'local';
let onAsrProviderChange: (() => void) | null = null;

export function setOnAsrProviderChange(cb: () => void): void {
  onAsrProviderChange = cb;
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'data', 'settings.json');
}

function loadAsrProvider(): 'local' | 'cloud' {
  try {
    const p = getSettingsPath();
    if (existsSync(p)) {
      const s = JSON.parse(readFileSync(p, 'utf-8'));
      return s.asrProvider || 'local';
    }
  } catch { /* ignore */ }
  return 'local';
}

function saveAsrProvider(provider: 'local' | 'cloud'): void {
  try {
    const dir = join(app.getPath('userData'), 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const p = getSettingsPath();
    let existing: any = {};
    if (existsSync(p)) {
      try { existing = JSON.parse(readFileSync(p, 'utf-8')); } catch { /* ignore */ }
    }
    existing.asrProvider = provider;
    writeFileSync(p, JSON.stringify(existing, null, 2));
  } catch { /* ignore */ }
}

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

function tintIcon(icon: NativeImage, r: number, g: number, b: number): NativeImage {
  const size = 32;
  const buf = icon.toBitmap();
  for (let py = size / 2; py < size; py++) {
    for (let px = size / 2; px < size; px++) {
      const dx = px - size + 10;
      const dy = py - size + 10;
      if (dx * dx + dy * dy > 22) continue;
      const idx = (py * size + px) * 4;
      buf[idx] = r;
      buf[idx + 1] = g;
      buf[idx + 2] = b;
      buf[idx + 3] = 255;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

function buildMenu(
  locale: Locale,
  openSettings: () => void,
  recordMode: 'toggle' | 'hold',
  onRecordModeChange: (mode: 'toggle' | 'hold') => void,
  muteOnRecord: boolean,
  onMuteOnRecordChange: (enabled: boolean) => void,
): Menu {
  const t = (key: string) => trayT(locale, key);

  return Menu.buildFromTemplate([
    {
      label: t('tray.voiceMode'),
      submenu: [
        {
          label: t('tray.voiceMode.local'),
          type: 'radio',
          checked: asrProvider === 'local',
          click: () => {
            asrProvider = 'local';
            saveAsrProvider('local');
            onAsrProviderChange?.();
          },
        },
        {
          label: t('tray.voiceMode.cloud'),
          type: 'radio',
          checked: asrProvider === 'cloud',
          click: () => {
            asrProvider = 'cloud';
            saveAsrProvider('cloud');
            onAsrProviderChange?.();
          },
        },
      ],
    },
    {
      label: t('tray.recordMode'),
      submenu: [
        {
          label: t('tray.recordMode.toggle'),
          type: 'radio',
          checked: recordMode === 'toggle',
          click: () => onRecordModeChange('toggle'),
        },
        {
          label: t('tray.recordMode.hold'),
          type: 'radio',
          checked: recordMode === 'hold',
          click: () => onRecordModeChange('hold'),
        },
      ],
    },
    { type: 'separator' },
    {
      label: t('tray.muteOnRecord'),
      type: 'checkbox',
      checked: muteOnRecord,
      click: () => onMuteOnRecordChange(!muteOnRecord),
    },
    { type: 'separator' },
    {
      label: t('tray.settings'),
      click: () => openSettings(),
    },
    { type: 'separator' },
    {
      label: t('tray.quit'),
      click: () => {
        const { app } = require('electron');
        app.quit();
      },
    },
  ]);
}

let recordMode: 'toggle' | 'hold' = 'toggle';
let onRecordModeChange: ((mode: 'toggle' | 'hold') => void) | null = null;
let muteOnRecord = true;
let onMuteOnRecordChange: ((enabled: boolean) => void) | null = null;

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

  const menu = buildMenu(locale, openSettings, recordMode, (mode) => {
    recordMode = mode;
    onRecordModeChange?.(mode);
  }, muteOnRecord, (enabled) => {
    muteOnRecord = enabled;
    onMuteOnRecordChange?.(enabled);
  });
  tray.setContextMenu(menu);
  tray.on('click', () => openSettings());

  return tray;
}

export function updateTrayLanguage(tray: Tray | null, locale: Locale, openSettings: () => void): void {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(trayT(locale, 'tray.tooltip'));
  const menu = buildMenu(locale, openSettings, recordMode, (mode) => {
    recordMode = mode;
    onRecordModeChange?.(mode);
  }, muteOnRecord, (enabled) => {
    muteOnRecord = enabled;
    onMuteOnRecordChange?.(enabled);
  });
  tray.setContextMenu(menu);
}

export function updateTrayState(
  existingTray: Tray | null,
  state: 'default' | 'recording' | 'recognizing',
): void {
  if (!existingTray || existingTray.isDestroyed()) return;
  const icon = createTrayIcon(state);
  existingTray.setImage(icon);
}
