// Serve client/dist with vite preview on a free-ish port for the browser tools (perf, a11y,
// screenshots). Run `pnpm build` first.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

export async function serveDist(): Promise<{ url: string; stop: () => void }> {
  const port = 4300 + Math.floor(Math.random() * 1000);
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
  throw new Error('vite preview did not start (did you run pnpm build?)');
}
