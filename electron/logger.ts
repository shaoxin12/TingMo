import { app } from 'electron';
import { join } from 'path';
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'fs';

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_LOG_FILES = 3;

function ensureLogDir(): string {
  const dir = join(app.getPath('userData'), 'logs');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function getLogPath(): string {
  const dir = ensureLogDir();
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return join(dir, `tingmo-${dateStr}.log`);
}

function rotateIfNeeded(filepath: string): void {
  try {
    if (existsSync(filepath) && statSync(filepath).size > MAX_LOG_SIZE) {
      for (let i = MAX_LOG_FILES - 1; i >= 0; i--) {
        const old = filepath + '.' + i;
        const next = filepath + '.' + (i + 1);
        if (i === MAX_LOG_FILES - 1) {
          if (existsSync(old)) unlinkSync(old);
        } else if (existsSync(old)) {
          renameSync(old, next);
        }
      }
      renameSync(filepath, filepath + '.0');
    }
  } catch { /* rotation is best-effort */ }
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function log(level: 'INFO' | 'WARN' | 'ERROR', source: string, message: string, data?: unknown): void {
  const line = `[${timestamp()}] [${level}] [${source}] ${message}${data !== undefined ? ' ' + JSON.stringify(data) : ''}\n`;

  // Console
  const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  fn(`[${source}] ${message}`);

  // File
  try {
    const fp = getLogPath();
    rotateIfNeeded(fp);
    appendFileSync(fp, line, 'utf-8');
  } catch { /* log failure is silent */ }
}

export const logger = {
  info: (source: string, message: string, data?: unknown) => log('INFO', source, message, data),
  warn: (source: string, message: string, data?: unknown) => log('WARN', source, message, data),
  error: (source: string, message: string, data?: unknown) => log('ERROR', source, message, data),
};
