// pnpm a11y — accessibility check (T-504). Serves client/dist (run `pnpm build` first), walks the
// main screens in Chromium, runs axe-core on each and fails on any serious or critical issue.
// Also checks the directory → shop → link flow works from the keyboard alone.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { chromium, type Page } from 'playwright';

const port = 4800 + Math.floor(Math.random() * 500);
const vite = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: resolve(import.meta.dirname, '../client'),
  stdio: 'ignore',
});
const url = `http://localhost:${port}/`;
for (let i = 0; i < 50; i++) {
  try {
    if ((await fetch(url)).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
type Row = { screen: string; issues: string[] };
const rows: Row[] = [];

async function scan(page: Page, screen: string) {
  // the 3D canvas is decoration; everything it shows is also in the HUD, directory and panels
  const result = await new AxeBuilder({ page }).exclude('#gl').analyze();
  const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  rows.push({
    screen,
    issues: bad.map((v) => `${v.impact}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ') ?? ''}`),
  });
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(url);
  const name = page.getByPlaceholder(/name/i);
  await name.waitFor();
  await scan(page, 'Landing');

  await name.fill('Axe');
  await name.press('Enter');
  await page.waitForFunction(() => performance.getEntriesByName('playable').length > 0, null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  await scan(page, 'In the mall (HUD)');

  // keyboard only from here: / opens the directory, type to search, Enter opens the shop
  await page.keyboard.press('Slash');
  await page.getByRole('dialog').waitFor();
  await scan(page, 'Directory');
  await page.keyboard.type('lumen');
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
  if (!/lumen/i.test(focused))
    throw new Error(`a11y: Tab from the search didn't reach the shop (got "${focused}")`);
  await page.keyboard.press('Enter');
  // the player walks (or fades) to the door; the panel opens on arrival
  const panel = page.getByRole('dialog', { name: /lumen/i });
  await panel.waitFor({ timeout: 30_000 });
  await scan(page, 'Shop panel');
  const links = await panel.locator('a[href]').count();
  if (links === 0) throw new Error('a11y: the shop panel has no links to reach');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Shift+Slash'); // ?
  await page.getByRole('dialog').waitFor();
  await scan(page, 'Help');
  await page.keyboard.press('Escape');

  await page.keyboard.press('Enter'); // chat
  await page.waitForTimeout(300);
  await scan(page, 'Chat');
} finally {
  await browser.close();
  vite.kill();
}

const failed = rows.some((r) => r.issues.length);
const lines = ['### Accessibility (axe-core, serious + critical)', '', '| Screen | Issues |', '|---|---|'];
for (const r of rows) lines.push(`| ${r.screen} | ${r.issues.length ? r.issues.join('<br>') : '✅ none'} |`);
const table = lines.join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
process.exit(failed ? 1 : 0);
