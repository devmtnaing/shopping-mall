// The docs site (T-601): `pnpm docs:dev`, `pnpm docs:build`. Published to GitHub Pages by
// .github/workflows/docs.yml. Pages are the Markdown files in docs/, as written for GitHub.
import { defineConfig } from 'vitepress';

const repo = 'https://github.com/devmtnaing/shopping-mall';

export default defineConfig({
  title: 'Shopping Mall',
  description: 'An open-source, multiplayer 3D shopping mall that runs in the browser.',
  base: '/shopping-mall/',
  cleanUrls: true,
  lastUpdated: true,
  // docs link to source files on GitHub-relative paths (../server/…); those aren't pages here
  ignoreDeadLinks: [/^\.\.\//, /localhost/],
  head: [['meta', { name: 'theme-color', content: '#e2b857' }]],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Contributing', link: '/guide/contributing' },
      { text: 'Live demo', link: 'https://web-production-cc219.up.railway.app' },
    ],
    sidebar: [
      {
        text: 'Run your mall',
        items: [
          { text: 'Quick start', link: '/guide/' },
          { text: 'Shops and products', link: '/guide/shops' },
          { text: 'Configuration', link: '/guide/config' },
          { text: 'Self-hosting and deploying', link: '/deploy' },
          { text: 'Art: building, props, avatars', link: '/art-direction' },
        ],
      },
      {
        text: 'Contribute',
        items: [
          { text: 'Contributing', link: '/guide/contributing' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Performance budget', link: '/performance' },
          { text: 'Greybox layout', link: '/greybox' },
          { text: 'Roadmap', link: '/roadmap' },
          { text: 'Tasks', link: '/tasks' },
        ],
      },
      {
        text: 'Background',
        collapsed: true,
        items: [
          { text: 'Product spec', link: '/spec' },
          { text: 'The reference mall, taken apart', link: '/teardown' },
          { text: 'ADR 0001: three.js', link: '/adr/0001-threejs-over-custom-engine' },
          { text: 'ADR 0002: Preact UI', link: '/adr/0002-preact-ui-outside-render-loop' },
          { text: 'ADR 0003: WebSocket protocol', link: '/adr/0003-websocket-server-binary-protocol' },
          { text: 'ADR 0004: Baked lighting', link: '/adr/0004-baked-lighting-and-authored-world' },
          { text: 'ADR 0005: Railway, Postgres, S3', link: '/adr/0005-railway-postgres-s3' },
          { text: 'ADR 0006: Live content', link: '/adr/0006-live-content-and-swappable-assets' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: repo }],
    editLink: { pattern: `${repo}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    search: { provider: 'local' },
    footer: { message: 'MIT licensed code. Assets CC BY 4.0 unless noted.' },
  },
});
