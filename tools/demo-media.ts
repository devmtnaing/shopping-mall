// pnpm demo:media — turns demo/demo.webm (pnpm demo:video) into the README's clip:
// docs/media/gameplay.webp (animated, 800×450 at 12 fps, plays inline on GitHub) and
// docs/media/gameplay.mp4 (720p, for the "watch it as a video" link). Needs ffmpeg and img2webp.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = join(root, 'demo/demo.webm');
const media = join(root, 'docs/media');
/** Skip the blank page before the landing screen draws. */
const START = '1.2';
const FPS = 12;

const run = (cmd: string, args: string[]) => execFileSync(cmd, args, { stdio: 'inherit' });

run('ffmpeg', [
  ...['-y', '-v', 'error', '-ss', START, '-i', src],
  ...['-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p'],
  ...['-r', '25', '-movflags', '+faststart', '-an', join(media, 'gameplay.mp4')],
]);

const frames = mkdtempSync(join(tmpdir(), 'demo-frames-'));
try {
  run('ffmpeg', [
    ...['-v', 'error', '-ss', START, '-i', src],
    ...['-vf', `fps=${FPS},scale=800:450:flags=lanczos`, join(frames, '%04d.png')],
  ]);
  const pngs = readdirSync(frames)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(frames, f));
  run('img2webp', [
    ...['-loop', '0', '-lossy', '-q', '50', '-m', '6', '-d', String(Math.round(1000 / FPS))],
    ...pngs,
    ...['-o', join(media, 'gameplay.webp')],
  ]);
} finally {
  rmSync(frames, { recursive: true, force: true });
}
for (const f of ['gameplay.webp', 'gameplay.mp4'])
  console.log(`${f}: ${(statSync(join(media, f)).size / 1e6).toFixed(1)} MB`);
