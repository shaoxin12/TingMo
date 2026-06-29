// Tray menu translation — 5 languages, used in main process

type Locale = 'zh-CN' | 'zh-TW' | 'en' | 'ja' | 'ko';

const dict: Record<string, Record<Locale, string>> = {
  'tray.tooltip':           { 'zh-CN': '听墨',   'zh-TW': '聽墨',   en: 'TingMo',  ja: 'TingMo', ko: 'TingMo' },
  'tray.voiceMode':         { 'zh-CN': '语音模式','zh-TW': '語音模式',en: 'Voice mode', ja: '音声モード', ko: '음성 모드' },
  'tray.voiceMode.local':   { 'zh-CN': '本地',   'zh-TW': '本地',   en: 'Local',    ja: 'ローカル', ko: '로컬' },
  'tray.voiceMode.cloud':   { 'zh-CN': 'API',    'zh-TW': 'API',    en: 'API',      ja: 'API',       ko: 'API' },
  'tray.recordMode':        { 'zh-CN': '录音模式','zh-TW': '錄音模式',en: 'Record mode',ja: '録音モード', ko: '녹음 모드' },
  'tray.recordMode.toggle': { 'zh-CN': '按下',   'zh-TW': '按下',   en: 'Press',    ja: '押下',    ko: '누르기' },
  'tray.recordMode.hold':   { 'zh-CN': '按住',   'zh-TW': '按住',   en: 'Hold',     ja: '長押し',  ko: '길게 누르기' },
  'tray.settings':          { 'zh-CN': '设置',   'zh-TW': '設定',   en: 'Settings', ja: '設定',    ko: '설정' },
  'tray.muteOnRecord':      { 'zh-CN': '录音时静音','zh-TW':'錄音時靜音',en:'Mute while recording',ja:'録音中ミュート',ko:'녹음 중 음소거' },
  'tray.quit':              { 'zh-CN': '退出',   'zh-TW': '退出',   en: 'Quit',     ja: '終了',    ko: '종료' },
};

export function trayT(locale: string, key: string): string {
  return dict[key]?.[locale as Locale] ?? key;
}
