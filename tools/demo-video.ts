// pnpm demo:video [--url http://localhost:5173] — records the ~60 s demo tour for the README and
// releases (T-604): landing, picking a character, walking the mall, the directory, a shop, sitting
// on a bench, the overview. Run it against a mall with a server (for the crowd, start `pnpm bots`).
// Writes demo/demo.webm.
import { mkdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:5173/' } } });
const OUT = resolve(import.meta.dirname, '../demo');
rmSync(`${OUT}/raw`, { recursive: true, force: true });
mkdirSync(`${OUT}/raw`, { recursive: true });

const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,760'] });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: `${OUT}/raw`, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
const wait = (ms: number) => page.waitForTimeout(ms);
const hold = async (key: string, ms: number) => {
  await page.keyboard.down(key);
  await wait(ms);
  await page.keyboard.up(key);
};

await page.goto(`${values.url}?perf`); // ?perf: the test handle, without the debug overlay
const name = page.getByPlaceholder(/name/i);
await name.waitFor();
await wait(2500); // the landing dolly
await name.pressSequentially('Mya', { delay: 120 });
for (const n of [3, 5, 8, 11]) {
  await page.getByRole('radio', { name: `Character ${n}` }).check();
  await wait(350);
}
await page.getByRole('button', { name: /enter/i }).click();
await wait(4000); // fly down
await hold('KeyW', 2500); // stroll down the concourse
await hold('KeyD', 500);
await hold('KeyW', 1500);
await page.keyboard.press('Digit1'); // wave
await wait(1500);
await page.keyboard.press('Slash'); // directory
await wait(900);
await page.keyboard.type('paper', { delay: 90 });
await wait(600);
await page.keyboard.press('Tab');
await page.keyboard.press('Enter'); // travel to the shop
await page.getByRole('dialog').waitFor({ timeout: 20_000 });
await wait(4000);
await page.keyboard.press('Escape');
await wait(600);
await page.keyboard.press('KeyM'); // overview
await wait(4000);
await page.keyboard.press('KeyM');
await wait(2500);
await page.evaluate(() => {
  const d = (window as unknown as { mallDebug?: { player: { place: (...a: number[]) => void } } }).mallDebug;
  d?.player.place(3.6, 0.05, -20, Math.PI / 2); // next to a bench
});
await wait(800);
await page.keyboard.press('KeyE'); // sit
await wait(4000);
await ctx.close();
await browser.close();

const [raw] = (await import('node:fs')).readdirSync(`${OUT}/raw`);
if (raw) renameSync(`${OUT}/raw/${raw}`, `${OUT}/demo.webm`);
rmSync(`${OUT}/raw`, { recursive: true, force: true });
console.log(`demo: ${OUT}/demo.webm`);
