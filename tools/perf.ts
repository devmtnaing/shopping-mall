// pnpm perf — the performance gate (docs/performance.md § Measuring). Builds nothing: run `pnpm build`
// first. Serves client/dist, opens it in Chromium throttled to Fast 4G + 4× CPU, enters the mall as
// soon as it can, walks a scripted route, and checks the budgets. Writes a Markdown table to stdout
// (and to $GITHUB_STEP_SUMMARY in CI). Exits 1 if a budget is exceeded.
//
//   pnpm perf            headless, software GL: frame times are reported but not enforced
//   pnpm perf --gpu      headed with the real GPU: frame times are enforced too
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const { values: args } = parseArgs({
  options: { gpu: { type: 'boolean', default: false }, url: { type: 'string' }, seconds: { type: 'string' } },
});
const WALK_S = Number(args.seconds ?? 12);

/** Budgets from docs/performance.md. `gpu` ones only count with --gpu. */
const BUDGETS = {
  playableMs: { max: 6000, label: 'Time to playable (Fast 4G, 4× CPU)', unit: 'ms' },
  playableKB: { max: 2500, label: 'Downloaded before playable', unit: 'KB' },
  drawCalls: { max: 120, label: 'Draw calls (max while walking)', unit: '' },
  triangles: { max: 350_000, label: 'Triangles (max while walking)', unit: '' },
  heapMB: { max: 120, label: 'JS heap after the walk', unit: 'MB' },
  frameP90: { max: 16.7, label: 'Frame time p90', unit: 'ms', gpu: true },
} as const;
type Key = keyof typeof BUDGETS;

async function serve(): Promise<{ url: string; stop: () => void }> {
  if (args.url) return { url: args.url, stop: () => {} };
  const port = 4300 + Math.floor(Math.random() * 500);
  const vite = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: resolve(import.meta.dirname, '../client'),
    stdio: 'ignore',
  });
  const url = `http://localhost:${port}/`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => vite.kill() };
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  vite.kill();
  throw new Error('perf: vite preview did not start (did you run pnpm build?)');
}

const { url, stop } = await serve();
const browser = await chromium.launch({
  headless: !args.gpu,
  args: args.gpu ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const results: Partial<Record<Key, number>> = {};
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const cdp = await page.context().newCDPSession(page);
  // DevTools' "Fast 4G" preset, and a mid-range phone's CPU
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 60,
    downloadThroughput: (9 * 1024 * 1024) / 8,
    uploadThroughput: (1.5 * 1024 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // budgets are for Medium: pin it, so Auto's pick on this machine doesn't move the numbers
  await page.addInitScript(() => localStorage.setItem('shopping-mall:quality', '"medium"'));
  await page.goto(`${url}?perf`);
  const name = page.getByPlaceholder(/name/i);
  await name.fill('Perf');
  await name.press('Enter'); // enter as soon as the form is there; the mall opens when it's ready
  await page.waitForFunction(() => performance.getEntriesByName('playable').length > 0, null, {
    timeout: 60_000,
  });
  const load = await page.evaluate(() => {
    const t = performance.getEntriesByName('playable')[0]?.startTime ?? 0;
    const entries = [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ] as PerformanceResourceTiming[];
    const bytes = entries
      .filter((e) => e.responseEnd <= t)
      .reduce((n, e) => n + (e.transferSize || e.encodedBodySize), 0);
    return { t, bytes };
  });
  results.playableMs = Math.round(load.t);
  results.playableKB = Math.round(load.bytes / 1024);

  // the walk: CPU throttling off (it measures loading, not the render loop), network no longer matters
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.waitForTimeout(2500); // the intro fly-down
  await page.evaluate(() => {
    const w = window as unknown as {
      mallDebug: { renderer: { info: { render: { calls: number; triangles: number } } } };
      __perf: { calls: number; tris: number; frames: number[] };
    };
    const info = w.mallDebug.renderer.info.render;
    const s = { calls: 0, tris: 0, frames: [] as number[] };
    w.__perf = s;
    let last = performance.now();
    const tick = (now: number) => {
      s.calls = Math.max(s.calls, info.calls);
      s.tris = Math.max(s.tris, info.triangles);
      s.frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.keyboard.down('KeyW');
  for (let t = 0; t < WALK_S; t += 2) {
    await page.keyboard.down(t % 4 === 0 ? 'KeyA' : 'KeyD');
    await page.waitForTimeout(600);
    await page.keyboard.up(t % 4 === 0 ? 'KeyA' : 'KeyD');
    await page.waitForTimeout(1400);
  }
  await page.keyboard.up('KeyW');
  const walk = await page.evaluate(() => {
    const s = (window as unknown as { __perf: { calls: number; tris: number; frames: number[] } }).__perf;
    const f = s.frames.slice(10).sort((a, b) => a - b);
    const heap =
      (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    return { calls: s.calls, tris: s.tris, p90: f[Math.floor(f.length * 0.9)] ?? 0, heap };
  });
  results.drawCalls = walk.calls;
  results.triangles = walk.tris;
  results.frameP90 = +walk.p90.toFixed(1);
  results.heapMB = Math.round(walk.heap / 1024 / 1024);
} finally {
  await browser.close();
  stop();
}

let failed = false;
const lines = [
  `### Performance${args.gpu ? '' : ' (headless, software GL: frame time not enforced)'}`,
  '',
  '| Metric | Result | Budget | |',
  '|---|---|---|---|',
];
for (const [key, b] of Object.entries(BUDGETS) as [Key, (typeof BUDGETS)[Key]][]) {
  const v = results[key];
  const enforced = !('gpu' in b) || args.gpu;
  const over = v !== undefined && v > b.max;
  if (over && enforced) failed = true;
  const mark = v === undefined ? '–' : over ? (enforced ? '❌' : '⚠️') : '✅';
  lines.push(`| ${b.label} | ${v ?? '–'} ${b.unit} | ≤ ${b.max} ${b.unit} | ${mark} |`);
}
const table = lines.join('\n');
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
process.exit(failed ? 1 : 0);
