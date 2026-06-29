import { spawn } from 'child_process';
import { createServer, connect } from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chokidar from 'chokidar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const VITE_PORT = 5173;
const TRIGGER_PORT = 5174;
let electronProcess = null;
let viteProcess = null;
let isBuilding = false;
let pendingRestart = false;

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

async function startElectron() {
  if (electronProcess) {
    console.log('[dev] Killing old Electron...');
    try { spawn('taskkill', ['/f', '/t', '/pid', String(electronProcess.pid)], { shell: true }); } catch {}
    try { electronProcess.kill(); } catch {}
    electronProcess = null;
  }

  // Brief delay to let ports release before starting new instance
  await new Promise(r => setTimeout(r, 500));

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
  });
}

let restartScheduled = false;
function scheduleRestart() {
  if (restartScheduled) return;
  restartScheduled = true;

  if (isBuilding) {
    pendingRestart = true;
    return;
  }

  restartScheduled = false;
  isBuilding = true;
  pendingRestart = false;

  buildMain()
    .then(() => { isBuilding = false; startElectron(); })
    .catch((err) => { isBuilding = false; console.error('[dev] Build failed:', err.message); })
    .finally(() => {
      if (pendingRestart) {
        pendingRestart = false;
        scheduleRestart();
      }
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

// TCP trigger listener for manual rebuild signals
const triggerServer = createServer((socket) => {
  socket.on('data', () => {});
  socket.on('end', () => {
    console.log('[dev] Manual rebuild triggered via TCP');
    scheduleRestart();
  });
  socket.end();
});
triggerServer.listen(TRIGGER_PORT, '127.0.0.1');
triggerServer.on('error', (err) => {
  console.error(`[dev] Trigger port ${TRIGGER_PORT} unavailable:`, err.message);
});

try {
  console.log('[dev] Waiting for Vite on port', VITE_PORT, '...');
  await waitForPort(VITE_PORT);
  console.log('[dev] Vite ready');

  // Initial build + launch
  await buildMain();
  startElectron();

  // Watch with chokidar (reliable cross-platform file watching)
  console.log('[dev] Watching electron/ for changes (chokidar)...');

  let watchTimer = null;
  const watcher = chokidar.watch([
    path.join(ROOT, 'electron/**/*.ts'),
  ], {
    cwd: ROOT,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
  });

  const onFileChange = (filepath) => {
    if (!filepath.endsWith('.ts')) return;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      console.log(`[dev] 🔄 Change: ${filepath}`);
      scheduleRestart();
    }, 300);
  };

  watcher.on('change', onFileChange);
  watcher.on('add', onFileChange);

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('[dev] Shutting down...');
    watcher.close();
    triggerServer.close();
    if (electronProcess) electronProcess.kill();
    if (viteProcess) viteProcess.kill();
    process.exit(0);
  });

} catch (err) {
  console.error('[dev]', err.message);
  if (viteProcess) viteProcess.kill();
  process.exit(1);
}
