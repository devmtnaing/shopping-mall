// pnpm assets — audio: trims the ambience loops in assets-src/audio to fit the audio budget
// (docs/tasks.md T-506: ≤ 250 KB in all) and writes them to client/public/assets/audio/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { duration, frames, trim } from './mp3.ts';

const SRC = resolve(import.meta.dirname, '../../assets-src/audio/higgsfield');
const OUT = resolve(import.meta.dirname, '../../client/public/assets/audio');
/** Seconds to keep of each loop. */
const CLIPS = { ambient: 20, fountain: 6 };

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, seconds] of Object.entries(CLIPS)) {
  const out = trim(new Uint8Array(readFileSync(`${SRC}/${name}.mp3`)), seconds);
  writeFileSync(`${OUT}/${name}.mp3`, out);
  total += out.byteLength;
  console.log(
    `audio: ${name} ${duration(frames(out)).toFixed(1)} s, ${(out.byteLength / 1024).toFixed(0)} KB`,
  );
}
console.log(`audio: ${(total / 1024).toFixed(0)} KB in all`);
