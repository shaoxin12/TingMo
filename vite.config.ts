import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'fix-checker-runtime',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.includes('/@vite-plugin-checker-runtime')) {
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end('export default {};');
          return;
        }
        next();
      });
    },
  }],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});