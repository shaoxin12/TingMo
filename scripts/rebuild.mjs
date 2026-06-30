import { connect } from 'net';
const PORT = 5174;
const HOST = '127.0.0.1';

const socket = connect(PORT, HOST, () => {
  // flush data before exit — wait for socket to fully close
  socket.end('rebuild', () => {
    console.log('[rebuild] Trigger sent to dev.mjs');
    process.exit(0);
  });
  // safety timeout
  setTimeout(() => process.exit(1), 5000);
});

// connection timeout — fail fast if dev.mjs is not running
socket.setTimeout(3000);
socket.on('timeout', () => {
  console.error('[rebuild] Connection timed out. Is dev server running?');
  socket.destroy();
  process.exit(1);
});

socket.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    console.error('[rebuild] No dev.mjs listening on ' + HOST + ':' + PORT + ' (npm run dev not running?)');
  } else {
    console.error('[rebuild] Error:', err.message);
  }
  process.exit(1);
});
