import { resolve } from 'node:path';
import { parseConfig } from '@plaza/shared/config';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import rawConfig from '../plaza.config';
import { renderDirectory } from './build/directory';

const CONFIG_FILE = resolve(__dirname, '../plaza.config.ts');
const VIRTUAL_ID = 'virtual:plaza-config';

/**
 * Validates plaza.config.ts once (build fails with a readable error) and serves the parsed,
 * defaults-filled result as `virtual:plaza-config`. zod stays out of the client bundle.
 */
function plazaConfig(): Plugin {
  const config = parseConfig(rawConfig);
  const json = JSON.stringify(config);
  return {
    name: 'plaza-config',
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
  plugins: [preact(), plazaConfig()],
  build: {
    target: 'es2022',
    manifest: true,
    // Three.js alone is ~500 kB minified; real limits are gzip budgets in /budgets.json.
    chunkSizeWarningLimit: 700,
  },
});
