// Main-process model downloader — downloads sensevoice-small model on first launch

import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MODEL_URL = 'https://github.com/hreplo/tingmo/releases/download/v0.1.0/sensevoice-small.tar.gz';

export interface DownloadProgress {
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  error?: string;
}

export function ensureModel(
  modelDir: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const modelFile = path.join(modelDir, 'sensevoice-small', 'model.onnx');

    if (fs.existsSync(modelFile)) {
      onProgress({ stage: 'done', percent: 100 });
      resolve(modelFile);
      return;
    }

    fs.mkdirSync(modelDir, { recursive: true });
    const tmpFile = path.join(modelDir, 'sensevoice-small.tar.gz');

    onProgress({ stage: 'downloading', percent: 0 });

    https.get(MODEL_URL, (res) => {
      // Follow redirect
      if (res.statusCode === 302 || res.statusCode === 301) {
        https.get(res.headers.location!, (redirectRes) => {
          pipeDownload(redirectRes, tmpFile, onProgress, () => {
            extract(modelDir, tmpFile, modelFile, onProgress, resolve, reject);
          }, reject);
        }).on('error', reject);
        return;
      }
      pipeDownload(res, tmpFile, onProgress, () => {
        extract(modelDir, tmpFile, modelFile, onProgress, resolve, reject);
      }, reject);
    }).on('error', (err) => {
      onProgress({ stage: 'error', percent: 0, error: err.message });
      reject(err);
    });
  });
}

function pipeDownload(
  res: any,
  dest: string,
  onProgress: (p: DownloadProgress) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): void {
  const total = parseInt(res.headers['content-length'] || '0', 10);
  let received = 0;
  const file = fs.createWriteStream(dest);

  res.on('data', (chunk: Buffer) => {
    received += chunk.length;
    if (total > 0) {
      onProgress({ stage: 'downloading', percent: Math.round((received / total) * 100) });
    }
  });

  file.on('finish', () => {
    file.close();
    onDone();
  });

  res.pipe(file);
  res.on('error', onError);
}

function extract(
  modelDir: string,
  tmpFile: string,
  modelFile: string,
  onProgress: (p: DownloadProgress) => void,
  resolve: (f: string) => void,
  reject: (e: Error) => void,
): void {
  try {
    onProgress({ stage: 'extracting', percent: 100 });
    execSync(`tar -xzf "${tmpFile}" -C "${modelDir}"`, { stdio: 'pipe' });
    fs.unlinkSync(tmpFile);
    onProgress({ stage: 'done', percent: 100 });
    resolve(modelFile);
  } catch (err: any) {
    onProgress({ stage: 'error', percent: 0, error: err.message });
    reject(err);
  }
}
