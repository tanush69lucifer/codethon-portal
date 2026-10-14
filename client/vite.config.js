import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite on :5173 proxies /api to the API on :5000.
// Prod: `npm run build` -> client/dist, served by the API itself (same origin).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:5000', '/health': 'http://localhost:5000' },
  },
  build: {
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: { manualChunks: { monaco: ['monaco-editor/esm/vs/editor/edcore.main'] } },
    },
  },
});
