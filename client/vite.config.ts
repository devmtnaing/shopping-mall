import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { parseConfig } from '@shopping-mall/shared/config';
import { renderDirectory } from '@shopping-mall/shared/directory';
import { defineConfig, type Plugin } from 'vite';
import rawConfig from '../mall.config';

const CONFIG_FILE = resolve(__dirname, '../mall.config.ts');
const VIRTUAL_ID = 'virtual:mall-config';

/**
 * Validates mall.config.ts once (build fails with a readable error) and serves the parsed,
 * defaults-filled result as `virtual:mall-config`. zod stays out of the client bundle.
 */
function mallConfig(): Plugin {
  const config = parseConfig(rawConfig);
  const json = JSON.stringify(config);
  return {
    name: 'mall-config',
    resolveId: (id) => (id === VIRTUAL_ID ? `\0${VIRTUAL_ID}` : undefined),
    load: (id) => (id === `\0${VIRTUAL_ID}` ? `export default ${json};` : undefined),
    // plain-HTML shop directory at /directory/ (no JS: for crawlers, screen readers, no-WebGL devices)
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'directory/index.html', source: renderDirectory(config) });
    },
    configureServer(server) {
      server.middlewares.use('/directory/', (req, res, next) => {
        if (req.url !== '/' && req.url !== '') return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(renderDirectory(config));
      });
      server.watcher.add(CONFIG_FILE);
      server.watcher.on('change', (file) => {
        if (file === CONFIG_FILE) server.restart();
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), mallConfig()],
  build: {
    target: 'es2022',
    // two pages: the mall, and the host's admin (its own bundle, never loaded by visitors)
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html'), admin: resolve(__dirname, 'admin/index.html') },
    },
    manifest: true,
    // Three.js alone is ~500 kB minified; real limits are gzip budgets in /budgets.json.
    chunkSizeWarningLimit: 700,
  },
});
