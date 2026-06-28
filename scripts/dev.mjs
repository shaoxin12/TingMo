import { spawn } from 'child_process';
import { createServer } from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const VITE_PORT = 5173;
let electronProcess = null;
let viteProcess = null;

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = createServer();
      socket.on('error', () => {
        socket.close();
        resolve();
      });
      socket.listen(port, '127.0.0.1', () => {
        socket.close();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(tryConnect, 300);
        }
      });
    };
    tryConnect();
  });
}

function buildMain() {
  return new Promise((resolve, reject) => {
    console.log('[dev] Building main process...');
    const build = spawn('npm', ['run', 'build:main'], {
      stdio: 'inherit',
      shell: true,
      cwd: ROOT,
    });
    build.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`build:main exited with code ${code}`));
    });
    build.on('error', reject);
  });
}

function startElectron() {
  if (electronProcess) {
    console.log('[dev] Killing old Electron...');
    electronProcess.kill();
    electronProcess = null;
  }

  console.log('[dev] Starting Electron...');
  electronProcess = spawn('npx', ['electron', '.'], {
    stdio: 'inherit',
    shell: true,
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'development' },
  });

  electronProcess.on('close', (code) => {
    console.log(`[dev] Electron exited (code ${code})`);
    electronProcess = null;
    // Don't exit — wait for more file changes or manual Ctrl+C
  });
}

// Start Vite
console.log('[dev] Starting Vite...');
viteProcess = spawn('npx', ['vite', '--port', String(VITE_PORT)], {
  stdio: 'inherit',
  shell: true,
  cwd: ROOT,
});

viteProcess.on('error', (err) => {
  console.error('[dev] Failed to start Vite:', err.message);
  process.exit(1);
});

viteProcess.on('close', (code) => {
  console.log(`[dev] Vite exited (code ${code}), stopping...`);
  if (electronProcess) electronProcess.kill();
  process.exit(0);
});

try {
  console.log('[dev] Waiting for Vite on port', VITE_PORT, '...');
  await waitForPort(VITE_PORT);
  console.log('[dev] Vite ready');

  // Initial build + launch
  await buildMain();
  startElectron();

  // Watch electron/ directory for changes to hot-restart
  const electronDir = path.join(ROOT, 'electron');
  console.log('[dev] Watching', electronDir, 'for changes...');

  const watchedFiles = new Set();
  fs.watch(electronDir, { recursive: true }, (eventType, filename) => {
    if (!filename || !filename.endsWith('.ts')) return;
    // Debounce: skip if we just handled this file
    if (watchedFiles.has(filename)) return;
    watchedFiles.add(filename);
    setTimeout(() => watchedFiles.delete(filename), 500);

    console.log(`[dev] Change detected: ${filename}`);
    buildMain().then(() => {
      startElectron();
    }).catch((err) => {
      console.error('[dev] Build failed:', err.message);
    });
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('[dev] Shutting down...');
    if (electronProcess) electronProcess.kill();
    if (viteProcess) viteProcess.kill();
    process.exit(0);
  });

} catch (err) {
  console.error('[dev]', err.message);
  if (viteProcess) viteProcess.kill();
  process.exit(1);
}
