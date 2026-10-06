// pnpm demo:video [--url http://localhost:5173/] — records the ~60 s gameplay tour for the README:
// Mya enters the mall and runs down the concourse to Bo, they wave and dance together, Mya finds a
// café in the directory and steps inside, picks an apple and throws it at Bo, sits on a bench, and
// pops into a restroom cubicle (the door shows engaged). Bo is a second visitor in another browser,
// so run it against a mall with a server. Writes demo/demo.webm; `pnpm demo:media` turns that into
// docs/media/gameplay.webp and .mp4.
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { type Browser, chromium, type Page } from 'playwright';

const { values } = parseArgs({ options: { url: { type: 'string', default: 'http://localhost:5173/' } } });
const OUT = resolve(import.meta.dirname, '../demo');
rmSync(`${OUT}/raw`, { recursive: true, force: true });
mkdirSync(`${OUT}/raw`, { recursive: true });
// a room of their own, so nobody else wanders into the shot
const url = `${values.url}?perf&room=demo-${Date.now().toString(36)}`; // ?perf: the test handle, no overlay

type Vec = { set: (x: number, y: number, z: number) => void };
type Debug = {
  mallDebug: {
    player: { place: (x: number, y: number, z: number, yaw?: number) => void; facing: number; pos: Vec };
    orbit: { yaw: number; pitch: number };
  };
};
const wait = (page: Page, ms: number) => page.waitForTimeout(ms);
const hold = async (page: Page, key: string, ms: number) => {
  await page.keyboard.down(key);
  await wait(page, ms);
  await page.keyboard.up(key);
};
/** Put someone at a spot, facing `yaw`, with the camera behind them (or looking the way `look` says). */
const place = (page: Page, x: number, z: number, yaw: number, pitch?: number, look = yaw) =>
  page.evaluate(
    ([x, z, yaw, pitch, look]) => {
      const { player, orbit } = (window as unknown as Debug).mallDebug;
      player.place(x as number, 0.05, z as number, yaw as number);
      orbit.yaw = look as number;
      if (pitch !== null) orbit.pitch = pitch as number;
    },
    [x, z, yaw, pitch ?? null, look],
  );
/** Swing the camera round to `yaw` (and `pitch`) over `ms`, eased. */
const pan = (page: Page, yaw: number, ms: number, pitch?: number) =>
  page.evaluate(
    ([to, ms, pitchTo]) =>
      new Promise<void>((done) => {
        const { orbit } = (window as unknown as Debug).mallDebug;
        const [y0, p0, t0] = [orbit.yaw, orbit.pitch, performance.now()];
        const dy = Math.atan2(Math.sin((to as number) - y0), Math.cos((to as number) - y0));
        const tick = () => {
          const k = Math.min(1, (performance.now() - t0) / (ms as number));
          const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
          orbit.yaw = y0 + dy * e;
          if (pitchTo !== null) orbit.pitch = p0 + ((pitchTo as number) - p0) * e;
          if (k < 1) requestAnimationFrame(tick);
          else done();
        };
        tick();
      }),
    [yaw, ms, pitch ?? null],
  );
/** Turn on the spot (the body only). */
const turn = (page: Page, yaw: number) =>
  page.evaluate((yaw) => {
    (window as unknown as Debug).mallDebug.player.facing = yaw;
  }, yaw);

async function enter(browser: Browser, name: string, character: number, record: boolean) {
  const ctx = await browser.newContext({
    viewport: record ? { width: 1280, height: 720 } : { width: 480, height: 270 },
    ...(record ? { recordVideo: { dir: `${OUT}/raw`, size: { width: 1280, height: 720 } } } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(url);
  const field = page.getByPlaceholder(/name/i);
  await field.waitFor({ timeout: 60_000 });
  return { ctx, page, field, name, character };
}

// Bo: a second visitor, in a browser of their own (not filmed)
const other = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const bo = await enter(other, 'Bo', 6, false);
await bo.field.fill('Bo');
await bo.page.getByRole('radio', { name: `Character ${bo.character}` }).check();
await bo.page.getByRole('button', { name: /enter/i }).click();
await bo.page.waitForFunction(() => performance.getEntriesByName('playable').length > 0, null, {
  timeout: 120_000,
});
// waiting down the concourse, right of the escalator (clear of the planters), facing the entrance
await place(bo.page, 1.6, -17.5, Math.PI);

const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,760'] });
const mya = await enter(browser, 'Mya', 13, true);
const page = mya.page;
const where = async (label: string) =>
  console.log(
    label,
    await page.evaluate(() => {
      const p = (window as unknown as Debug).mallDebug.player.pos as unknown as { x: number; z: number };
      return `${p.x.toFixed(2)}, ${p.z.toFixed(2)}`;
    }),
  );
await wait(page, 2200); // the landing dolly
await mya.field.pressSequentially('Mya', { delay: 110 });
for (const n of [3, 8, 15, 13]) {
  await page.getByRole('radio', { name: `Character ${n}` }).check();
  await wait(page, 320);
}
await page.getByRole('button', { name: /enter/i }).click();
await wait(page, 3800); // fly down to the entrance

// run down the concourse to Bo, who waves
await page.keyboard.down('ShiftLeft');
await bo.page.keyboard.press('Digit1');
await hold(page, 'KeyW', 1500);
await page.keyboard.up('ShiftLeft');
await hold(page, 'KeyW', 300);
await page.keyboard.press('Digit1');
await wait(page, 1000);
await where('met Bo');
// side by side, the camera swings round to the front of them, and they dance
await place(page, 3, -17.5, Math.PI);
await pan(page, 0, 1400, -0.18);
await page.keyboard.press('Digit7');
await bo.page.keyboard.press('Digit7');
await wait(page, 4500);
await bo.page.keyboard.press('Digit2');
await page.keyboard.press('Digit3');
await wait(page, 1700);

// the directory: find the café and go
await page.keyboard.press('Slash');
await wait(page, 700);
await page.keyboard.type('lumen', { delay: 100 });
await wait(page, 500);
await page.keyboard.press('Tab');
await page.keyboard.press('Enter');
await page.getByRole('dialog').waitFor({ timeout: 20_000 });
await wait(page, 3200);
await page.keyboard.press('Escape');
await wait(page, 500);
await hold(page, 'KeyW', 1500); // step inside: tables and chairs
await wait(page, 1500);

// apples: pick one at the fruit stand and throw it at Bo
// Bo a few steps off to one side; Mya faces him, the camera over her shoulder
const toBo = Math.atan2(2, -4);
await place(bo.page, -0.6, -33, toBo + Math.PI);
await place(page, 1.4, -37, toBo, -0.22, toBo + 0.45);
await wait(page, 1200);
await page.keyboard.press('KeyF'); // pick: turn to the stand, reach, turn back
await wait(page, 1700);
await page.keyboard.press('KeyF'); // throw
await wait(page, 900);
await bo.page.keyboard.press('Digit6'); // wow
await wait(page, 900);
await bo.page.keyboard.press('Digit2'); // and a laugh
await wait(page, 1300);

// a sit on a bench
await place(page, 7.4, -26, Math.PI / 2, -0.2, -Math.PI / 2); // the camera in front
await wait(page, 700);
await page.keyboard.press('KeyE');
await wait(page, 2600);
await page.keyboard.press('KeyE'); // stand up
await wait(page, 400);

// the men's restroom: in through the doorway and into a cubicle; the door shows engaged
await place(page, 8.4, -3.6, -Math.PI / 2, -0.25);
await wait(page, 700);
await hold(page, 'KeyW', 1300);
await where('in the restroom');
// cut to her in a cubicle, the camera up over the partitions, looking down
await place(page, 13.3, -4.9, 0, -1.15);
await wait(page, 900);
await where('in the cubicle');
await page.keyboard.press('KeyE'); // close the door
await wait(page, 2400);
await page.keyboard.press('KeyE'); // and out again
await wait(page, 500);
await hold(page, 'KeyS', 800);
await wait(page, 600);

// back out in the lobby, Bo's waiting for a hug
await place(bo.page, 2.4, -11, -Math.PI / 2);
await place(page, 3.8, -11, Math.PI / 2, -0.18, 0);
await wait(page, 600);
await page.keyboard.press('Digit8');
await wait(page, 300);
await bo.page.keyboard.press('Digit8');
await wait(page, 2600);

// the overview to finish
await page.keyboard.press('KeyM');
await wait(page, 3500);
await mya.ctx.close();
await browser.close();
await other.close();

const [raw] = readdirSync(`${OUT}/raw`);
if (raw) renameSync(`${OUT}/raw/${raw}`, `${OUT}/demo.webm`);
rmSync(`${OUT}/raw`, { recursive: true, force: true });
console.log(`demo: ${OUT}/demo.webm`);
