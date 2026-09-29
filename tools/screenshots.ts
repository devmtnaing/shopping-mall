// pnpm screenshots — the phone layout check (T-505): landing, HUD, directory and a shop panel on an
// iPhone 13 (portrait and landscape, with its safe areas) and a Pixel 7. Writes PNGs to screenshots/
// for eyeballing and for pull requests. Run `pnpm build` first.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, devices } from 'playwright';
import { serveDist } from './serve.ts';

const OUT = resolve(import.meta.dirname, '../screenshots');
mkdirSync(OUT, { recursive: true });
const { url, stop } = await serveDist();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [label, device] of [
    ['iphone-portrait', devices['iPhone 13']],
    ['iphone-landscape', devices['iPhone 13 landscape']],
    ['pixel-portrait', devices['Pixel 7']],
  ] as const) {
    const ctx = await browser.newContext({ ...device });
    const page = await ctx.newPage();
    const shot = (name: string) => page.screenshot({ path: `${OUT}/${label}-${name}.png` });
    await page.goto(url);
    const name = page.getByPlaceholder(/name/i);
    await name.waitFor();
    await shot('1-landing');
    await name.fill('Mya');
    await name.press('Enter');
    await page.waitForFunction(() => performance.getEntriesByName('playable').length > 0, null, {
      timeout: 60_000,
    });
    await page.waitForTimeout(3000);
    await shot('2-hud');
    await page.getByRole('button', { name: /shops/i }).first().tap();
    await page.waitForTimeout(600);
    await shot('3-directory');
    await page.getByRole('button', { name: /lumen/i }).first().tap();
    await page.getByRole('dialog', { name: /lumen/i }).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await shot('4-shop');
    await ctx.close();
  }
} finally {
  await browser.close();
  stop();
}
console.log(`screenshots: ${OUT}`);
