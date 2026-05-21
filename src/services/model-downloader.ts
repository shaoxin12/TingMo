// Main-process model downloader — downloads Paraformer + CT-Transformer on first launch

import https from 'https';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const MODEL_URL = 'https://github.com/shaoxin12/tingmo/releases/download/v0.2/tingmo-models-v0.2.tar.gz';

export interface DownloadProgress {
  stage: 'downloading' | 'extracting' | 'done' | 'error';
  percent: number;
  error?: string;
}

function fail(reject: (e: Error) => void, onProgress: (p: DownloadProgress) => void, msg: string): void {
  const err = new Error(msg);
  onProgress({ stage: 'error', percent: 0, error: msg });
  reject(err);
}

function request(
  url: string,
  onProgress: (p: DownloadProgress) => void,
  resolve: (f: string) => void,
  reject: (e: Error) => void,
  destDir: string,
  tmpFile: string,
  modelFile: string,
): void {
  https.get(url, (res) => {
    // Follow redirect
    if (res.statusCode === 301 || res.statusCode === 302) {
      const location = res.headers.location;
      if (!location) {
        fail(reject, onProgress, 'Redirect without Location header');
        return;
      }
      request(location, onProgress, resolve, reject, destDir, tmpFile, modelFile);
      return;
    }

    // Reject non-2xx responses (404, 403, 500, etc.)
    if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
      fail(reject, onProgress, `Model download failed: HTTP ${res.statusCode}. The model file may not be published yet.`);
      return;
    }

    pipeDownload(res, tmpFile, onProgress, () => {
      extract(destDir, tmpFile, modelFile, onProgress, resolve, reject);
    }, reject);
  }).on('error', (err) => {
    fail(reject, onProgress, err.message);
  });
}

export function ensureModel(
  modelDir: string,
  onProgress: (p: DownloadProgress) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const funasrDir = path.join(modelDir, 'funasr');
    const asrModel = path.join(funasrDir, 'paraformer-large-int8.onnx');
    const punctModel = path.join(funasrDir, 'ct-transformer.onnx');

    // Both models present — skip download
    if (fs.existsSync(asrModel) && fs.existsSync(punctModel)) {
      onProgress({ stage: 'done', percent: 100 });
      resolve(asrModel);
      return;
    }

    fs.mkdirSync(funasrDir, { recursive: true });
    const tmpFile = path.join(modelDir, 'tingmo-models-v0.2.tar.gz');

    onProgress({ stage: 'downloading', percent: 0 });
    request(MODEL_URL, onProgress, resolve, reject, funasrDir, tmpFile, asrModel);
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
  destDir: string,
  tmpFile: string,
  modelFile: string,
  onProgress: (p: DownloadProgress) => void,
  resolve: (f: string) => void,
  reject: (e: Error) => void,
): void {
  try {
    onProgress({ stage: 'extracting', percent: 100 });
    execSync(`tar -xzf "${tmpFile}" -C "${destDir}"`, { stdio: 'pipe' });
    fs.unlinkSync(tmpFile);
    onProgress({ stage: 'done', percent: 100 });
    resolve(modelFile);
  } catch (err: any) {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    fail(reject, onProgress, err.message);
  }
}
