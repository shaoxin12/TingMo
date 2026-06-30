import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs';

// ── Types ───────────────────────────────────────────────────────
export interface HistoryEntry {
  id: string;
  text: string;
  charCount: number;
  timestamp: number;
  originalText?: string;
  provider?: string;
}

export interface Stats {
  totalDurationMs: number;
  totalCharCount: number;
  totalSessions: number;
}

export interface DailyStats {
  date: string;    // YYYY-MM-DD
  durationMs: number;
  charCount: number;
  sessions: number;
}

export interface OverviewStats extends Stats {
  todayDurationMs: number;
  todayCharCount: number;
  todaySessions: number;
  recentDays: DailyStats[];
}

// ── Paths ───────────────────────────────────────────────────────
function dataDir(): string {
  const dir = join(app.getPath('userData'), 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function statsPath(): string { return join(dataDir(), 'stats.json'); }
function dailyPath(): string { return join(dataDir(), 'daily_stats.json'); }
function historyPath(): string { return join(dataDir(), 'history.json'); }

// ── Helper ──────────────────────────────────────────────────────
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function atomicWrite(filepath: string, data: unknown): void {
  const tmp = filepath + '.tmp';
  writeFileSync(tmp, JSON.stringify(data), 'utf-8');
  try {
    // renameSync is atomic on NTFS within the same directory
    renameSync(tmp, filepath);
  } catch {
    // Fallback: direct write
    writeFileSync(filepath, JSON.stringify(data), 'utf-8');
    try { unlinkSync(tmp); } catch { /* ignore */ }
  }
}

// ── Stats ───────────────────────────────────────────────────────
let statsCache: Stats | null = null;

export function loadStats(): Stats {
  if (statsCache) return statsCache;
  try {
    statsCache = JSON.parse(readFileSync(statsPath(), 'utf-8'));
  } catch {
    statsCache = { totalDurationMs: 0, totalCharCount: 0, totalSessions: 0 };
  }
  return statsCache as Stats;
}

function saveStats(s: Stats): void {
  statsCache = s;
  atomicWrite(statsPath(), s);
}

// ── Daily stats ─────────────────────────────────────────────────
let dailyCache: DailyStats[] | null = null;

function loadDaily(): DailyStats[] {
  if (dailyCache) return dailyCache;
  try {
    dailyCache = JSON.parse(readFileSync(dailyPath(), 'utf-8'));
  } catch {
    dailyCache = [];
  }
  return dailyCache as DailyStats[];
}

function saveDaily(d: DailyStats[]): void {
  dailyCache = d;
  atomicWrite(dailyPath(), d);
}

function getTodayStats(): DailyStats {
  const key = todayKey();
  const daily = loadDaily();
  let today = daily.find((d) => d.date === key);
  if (!today) {
    today = { date: key, durationMs: 0, charCount: 0, sessions: 0 };
    daily.push(today);
    saveDaily(daily);
  }
  return today;
}

// ── Overview ────────────────────────────────────────────────────
export function loadOverview(): OverviewStats {
  const total = loadStats();
  const today = getTodayStats();
  const daily = loadDaily();
  return {
    ...total,
    todayDurationMs: today.durationMs,
    todayCharCount: today.charCount,
    todaySessions: today.sessions,
    recentDays: daily.slice(-7).reverse(), // last 7 days, newest first
  };
}

// ── Recording ───────────────────────────────────────────────────
export function addRecordingStats(durationMs: number, charCount: number): void {
  // Total
  const s = loadStats();
  s.totalDurationMs += durationMs;
  s.totalCharCount += charCount;
  s.totalSessions += 1;
  saveStats(s);

  // Today
  const today = getTodayStats();
  today.durationMs += durationMs;
  today.charCount += charCount;
  today.sessions += 1;
  saveDaily(loadDaily());
}

// ── History ─────────────────────────────────────────────────────
let historyCache: HistoryEntry[] | null = null;

export function loadHistory(): HistoryEntry[] {
  if (historyCache) return historyCache;
  try {
    historyCache = JSON.parse(readFileSync(historyPath(), 'utf-8'));
  } catch {
    historyCache = [];
  }
  return historyCache as HistoryEntry[];
}

const MAX_HISTORY = 10000;

function saveHistory(h: HistoryEntry[]): void {
  // Cap to prevent unbounded growth over months of use
  if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
  historyCache = h;
  atomicWrite(historyPath(), h);
}

export function addHistoryEntry(text: string, charCount: number, originalText?: string, provider?: string | null): HistoryEntry {
  const entry: HistoryEntry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text,
    charCount,
    timestamp: Date.now(),
    ...(originalText ? { originalText } : {}),
    ...(provider ? { provider } : {}),
  };
  const h = loadHistory();
  h.unshift(entry);
  saveHistory(h);
  return entry;
}

export function clearHistory(): void {
  saveHistory([]);
}

export function clearAllStats(): void {
  statsCache = { totalDurationMs: 0, totalCharCount: 0, totalSessions: 0 };
  saveStats(statsCache);
  dailyCache = [];
  saveDaily([]);
}
