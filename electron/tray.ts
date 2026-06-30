import { Tray, Menu, nativeImage, NativeImage } from 'electron';
import { join } from 'path';
import { trayT } from './tray-i18n';

type Locale = string;

// ── Tray icon creation ────────────────────────────────────

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

// ── Native context menu ───────────────────────────────────

export function createTray(
  locale: Locale,
  openSettings: () => void,
  getAsrProvider: () => 'local' | 'cloud',
  onAsrProviderChange: (p: 'local' | 'cloud') => void,
  getRecordMode: () => 'toggle' | 'hold',
  onRecordModeChange: (mode: 'toggle' | 'hold') => void,
  getMuteOnRecord: () => boolean,
  onMuteOnRecordChange: (enabled: boolean) => void,
): Tray {
  const icon = createTrayIcon('default');
  const tray = new Tray(icon);
  tray.setToolTip(trayT(locale, 'tray.tooltip'));

  // Build the context menu fresh each right-click so checked/radio state is current
  const buildMenu = (): Menu => {
    const asrProvider = getAsrProvider();
    const recordMode = getRecordMode();
    const muteOnRecord = getMuteOnRecord();

    return Menu.buildFromTemplate([
      {
        label: trayT(locale, 'tray.voiceMode.local'),
        type: 'radio',
        checked: asrProvider === 'local',
        click: () => onAsrProviderChange('local'),
      },
      {
        label: trayT(locale, 'tray.voiceMode.cloud'),
        type: 'radio',
        checked: asrProvider === 'cloud',
        click: () => onAsrProviderChange('cloud'),
      },
      { type: 'separator' },
      {
        label: trayT(locale, 'tray.recordMode.toggle'),
        type: 'radio',
        checked: recordMode === 'toggle',
        click: () => onRecordModeChange('toggle'),
      },
      {
        label: trayT(locale, 'tray.recordMode.hold'),
        type: 'radio',
        checked: recordMode === 'hold',
        click: () => onRecordModeChange('hold'),
      },
      { type: 'separator' },
      {
        label: trayT(locale, 'tray.muteOnRecord'),
        type: 'checkbox',
        checked: muteOnRecord,
        click: (mi) => onMuteOnRecordChange(mi.checked),
      },
      { type: 'separator' },
      {
        label: trayT(locale, 'tray.settings'),
        click: () => openSettings(),
      },
      { type: 'separator' },
      {
        label: trayT(locale, 'tray.quit'),
        click: () => {
          const { app } = require('electron');
          app.quit();
        },
      },
    ]);
  };

  // Right-click → native Windows context menu (OS handles position & dismissal)
  tray.on('right-click', () => {
    tray.popUpContextMenu(buildMenu());
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
