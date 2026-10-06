import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
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

/**
 * A fingerprint of every file under public/assets (models, sounds, portraits), written into the page
 * as JSON (not into the JS bundle, which is on a tight budget). The client asks for
 * `mall.glb?v=<fingerprint>`, so a rebuilt file gets a new address and a cache (Cloudflare, the
 * browser) can keep each one for good without ever serving a stale copy. See client/src/assets.ts.
 */
function assetVersions(): Plugin {
  const root = resolve(__dirname, 'public/assets');
  const scan = () => {
    const out: Record<string, string> = {};
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, e.name);
        if (e.isDirectory()) walk(path);
        else
          out[relative(root, path)] = createHash('sha256')
            .update(readFileSync(path))
            .digest('hex')
            .slice(0, 10);
      }
    };
    walk(root);
    return out;
  };
  return {
    name: 'asset-versions',
    transformIndexHtml: {
      order: 'pre',
      handler: (_html, ctx) =>
        // the admin pages (admin/, shop-admin/) load nothing from public/assets that needs it
        ctx.filename.endsWith('admin/index.html')
          ? []
          : [
              {
                tag: 'script',
                attrs: { type: 'application/json', id: 'asset-versions' },
                children: JSON.stringify(scan()),
                injectTo: 'head',
              },
            ],
    },
  };
}

export default defineConfig({
  plugins: [preact(), mallConfig(), assetVersions()],
  build: {
    target: 'es2022',
    // the mall, and the admin (its own bundle, never loaded by visitors) behind two doors: /admin/
    // for the host and /shop-admin/ for shop owners
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        shopAdmin: resolve(__dirname, 'shop-admin/index.html'),
      },
    },
    manifest: true,
    // Three.js alone is ~500 kB minified; real limits are gzip budgets in /budgets.json.
    chunkSizeWarningLimit: 700,
  },
});
