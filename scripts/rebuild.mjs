import { connect } from 'net';
const PORT = 5174;
const HOST = '127.0.0.1';

const socket = connect(PORT, HOST, () => {
  socket.end('rebuild');
  setTimeout(() => {
    console.log('[rebuild] Trigger sent to dev.mjs');
    process.exit(0);
  }, 100);
});

socket.on('error', (err) => {
  if (err.code === 'ECONNREFUSED') {
    console.error('[rebuild] No dev.mjs listening on ' + HOST + ':' + PORT + ' (npm run dev not running?)');
  } else {
    console.error('[rebuild] Error:', err.message);
  }
  process.exit(1);
});
