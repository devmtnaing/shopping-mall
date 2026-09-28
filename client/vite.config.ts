import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    // Three.js alone is ~500 kB minified; real limits are gzip budgets in /budgets.json.
    chunkSizeWarningLimit: 700,
  },
});
