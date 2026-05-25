// Main-process model downloader — downloads SenseVoiceSmall ONNX model on first launch
// Multi-source with fallback + HTTP Range resume + speed logging
// Raw sources download files directly (no extraction needed); archive sources use tar.bz2

import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface DownloadSource {
  name: string;
  type: 'raw' | 'archive';
  baseUrl?: string;
  files?: string[];
  archiveUrl?: string;
}

// Multiple download sources, tried in order (fastest first).
// Raw sources download model files directly — no tar extraction needed.
const MODEL_SOURCES: DownloadSource[] = [
  {
    name: 'hf-mirror',
    type: 'raw',
    baseUrl: 'https://hf-mirror.com/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main',
    files: ['model.int8.onnx', 'tokens.txt'],
  },
  {
    name: 'huggingface',
    type: 'raw',
    baseUrl: 'https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main',
    files: ['model.int8.onnx', 'tokens.txt'],
  },
  {
    name: 'github',
    type: 'archive',
    archiveUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2',
  },
];
const MAX_RETRIES = 2;

export interface DownloadProgress {
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  error?: string;
}

function extractTarBz2(tarPath: string, destDir: string): void {
  try {
    execSync(`tar -xjf "${tarPath}" -C "${destDir}"`, {
      stdio: 'pipe',
      timeout: 180000,
    });
  } catch (e: any) {
    const msg = e.stderr?.toString() || e.message || 'tar extraction failed';
    throw new Error(`tar extraction failed: ${msg}. Ensure tar is available in PATH.`);
  }
}

function formatSpeed(bytesPerSec: number): string {
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  const kb = bytesPerSec / 1024;
  return `${kb.toFixed(0)} KB/s`;
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

// Download a file from url to dest, with Range resume if partial file exists.
function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const hostname = new URL(url).hostname;

    // Check for partial file to resume
    const existingSize = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
    let resumeFrom = existingSize;

    function attempt(redirectUrl: string, retriesLeft: number): void {
      const parsed = new URL(redirectUrl);
      const headers: Record<string, string | undefined> = {};
      if (resumeFrom > 0) {
        headers['Range'] = `bytes=${resumeFrom}-`;
      }
      const options: https.RequestOptions = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers,
      };

      const req = https.get(options, (res) => {
        // Follow redirect
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          const location = res.headers.location;
          if (!location) {
            if (retriesLeft > 0) { setTimeout(() => attempt(redirectUrl, retriesLeft - 1), 1000); return; }
            reject(new Error('Redirect without Location header'));
            return;
          }
          // Consume response to free socket, then follow
          res.resume();
          // Resolve relative redirect against current request URL
          const resolved = new URL(location, redirectUrl).href;
          const destHost = (() => { try { return new URL(resolved).hostname; } catch { return '?'; } })();
          console.log(`[ModelDL] Redirect to ${destHost}`);
          attempt(resolved, retriesLeft);
          return;
        }

        // Handle Range Not Satisfiable — file already complete
        if (res.statusCode === 416) {
          resolve();
          return;
        }

        if (res.statusCode !== 200 && res.statusCode !== 206) {
          const err = new Error(`HTTP ${res.statusCode}`);
          if (retriesLeft > 0) {
            console.log(`[ModelDL] ${err.message} from ${hostname}, retrying... (${retriesLeft} left)`);
            resumeFrom = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
            setTimeout(() => attempt(redirectUrl, retriesLeft - 1), 2000);
            return;
          }
          reject(err);
          return;
        }

        // 206 = resume OK; 200 when we tried to resume = server ignored Range, restart
        const isFresh = res.statusCode === 200 && resumeFrom > 0;
        const writeFlag = isFresh ? 'w' : (resumeFrom > 0 ? 'a' : 'w');
        const initialBytes = isFresh ? 0 : resumeFrom;

        const total = parseInt(res.headers['content-length'] || '0', 10) + initialBytes;
        let received = initialBytes;

        const file = fs.createWriteStream(dest, { flags: writeFlag });
        const startTime = Date.now();
        let lastLogTime = startTime;
        let lastLogBytes = received;

        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastLogTime >= 2000) {
            const speed = ((received - lastLogBytes) / (now - lastLogTime)) * 1000;
            console.log(`[ModelDL] ${formatSpeed(speed)} — ${hostname}`);
            lastLogTime = now;
            lastLogBytes = received;
          }
          if (total > 0 && onProgress) {
            onProgress(Math.round((received / total) * 100));
          }
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
          const elapsed = (Date.now() - startTime) / 1000;
          const avgSpeed = received / (elapsed || 1);
          console.log(`[ModelDL] Downloaded ${formatBytes(received)} in ${elapsed.toFixed(1)}s (avg ${formatSpeed(avgSpeed)}) — ${hostname}`);
          resolve();
        });

        file.on('error', (err) => {
          if (retriesLeft > 0) {
            console.log(`[ModelDL] Write error: ${err.message}, retrying... (${retriesLeft} left)`);
            resumeFrom = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
            setTimeout(() => attempt(redirectUrl, retriesLeft - 1), 2000);
            return;
          }
          reject(err);
        });

        res.on('error', (err) => {
          if (retriesLeft > 0) {
            console.log(`[ModelDL] Stream error: ${err.message}, retrying... (${retriesLeft} left)`);
            resumeFrom = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
            setTimeout(() => attempt(redirectUrl, retriesLeft - 1), 2000);
            return;
          }
          reject(err);
        });
      });

      req.on('error', (err: NodeJS.ErrnoException) => {
        if (retriesLeft > 0) {
          console.log(`[ModelDL] Connection error: ${err.message}, retrying... (${retriesLeft} left)`);
          setTimeout(() => attempt(redirectUrl, retriesLeft - 1), 2000);
          return;
        }
        reject(err);
      });

      req.setTimeout(30000, () => {
        req.destroy(new Error('Request timeout'));
      });

      req.end();
    }

    attempt(url, MAX_RETRIES);
  });
}

export function ensureModel(
  modelDir: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const funasrDir = path.join(modelDir, 'funasr');
    const asrModel = path.join(funasrDir, 'model.int8.onnx');
    const tokensFile = path.join(funasrDir, 'tokens.txt');

    // Model already present — skip download
    if (fs.existsSync(asrModel) && fs.existsSync(tokensFile)) {
      onProgress({ stage: 'done', percent: 100 });
      resolve(asrModel);
      return;
    }

    fs.mkdirSync(funasrDir, { recursive: true });
    const tmpFile = path.join(modelDir, 'sensevoice-models.tar.bz2');

    onProgress({ stage: 'downloading', percent: 0 });

    // Try each source in order
    async function trySources(index: number): Promise<void> {
      if (index >= MODEL_SOURCES.length) {
        throw new Error(`All ${MODEL_SOURCES.length} download sources failed`);
      }

      const source = MODEL_SOURCES[index];
      console.log(`[ModelDL] Trying source ${index + 1}/${MODEL_SOURCES.length}: ${source.name}`);

      try {
        if (source.type === 'raw') {
          // Download each file directly (resume supported)
          const files = source.files!;
          const baseUrl = source.baseUrl!;
          for (let i = 0; i < files.length; i++) {
            const fileName = files[i];
            const destPath = path.join(funasrDir, fileName);
            if (fs.existsSync(destPath)) continue; // already have this file

            console.log(`[ModelDL] Downloading ${fileName} from ${source.name}`);
            await downloadFile(
              `${baseUrl}/${fileName}`,
              destPath,
              (pct) => {
                // Weight: first file (model) = 0-90%, rest = 90-100%
                const fileWeight = 90 / files.length;
                const overall = Math.round(i * fileWeight + (pct / 100) * fileWeight);
                onProgress({ stage: 'downloading', percent: Math.min(overall, 99) });
              },
            );
          }

          // Verify both files exist
          if (!fs.existsSync(asrModel) || !fs.existsSync(tokensFile)) {
            throw new Error('Model files missing after raw download');
          }
        } else {
          // Archive source — download tar.bz2 and extract
          await downloadFile(
            source.archiveUrl!,
            tmpFile,
            (pct) => onProgress({ stage: 'downloading', percent: pct }),
          );

          onProgress({ stage: 'extracting', percent: 100 });
          extractTarBz2(tmpFile, funasrDir);
          try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }

          if (!fs.existsSync(asrModel)) {
            throw new Error('Model file not found after extraction');
          }
        }

        onProgress({ stage: 'done', percent: 100 });
        resolve(asrModel);
      } catch (err: any) {
        console.log(`[ModelDL] Source ${source.name} failed: ${err.message}`);
        // Clean up temp archive file, but keep any successfully downloaded raw files
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        trySources(index + 1);
      }
    }

    trySources(0).catch((err) => {
      onProgress({ stage: 'error', percent: 0, error: err.message });
      reject(err);
    });
  });
}
