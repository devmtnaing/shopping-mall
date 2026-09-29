// pnpm assets — audio: trims the ambience loops in assets-src/audio to fit the audio budget
// (docs/tasks.md T-506: ≤ 250 KB in all), cuts the one-shots (door chime, UI tap) out of their
// generated clips, and writes them all to client/public/assets/audio/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { duration, frames, slice, trim } from './mp3.ts';

const SRC = resolve(import.meta.dirname, '../../assets-src/audio/higgsfield');
const OUT = resolve(import.meta.dirname, '../../client/public/assets/audio');
/** Seconds to keep of each loop. */
const CLIPS = { ambient: 20, fountain: 6 };
/** One-shots: the seconds [from, to] of each generated clip that hold the sound (the rest is silence). */
const ONESHOTS: Record<string, [number, number]> = { chime: [0.25, 1.8], tap: [0.66, 0.85] };

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
for (const [name, [from, to]] of Object.entries(ONESHOTS)) {
  const out = slice(new Uint8Array(readFileSync(`${SRC}/${name}.mp3`)), from, to);
  writeFileSync(`${OUT}/${name}.mp3`, out);
  total += out.byteLength;
  console.log(
    `audio: ${name} ${duration(frames(out)).toFixed(2)} s, ${(out.byteLength / 1024).toFixed(1)} KB`,
  );
}
console.log(`audio: ${(total / 1024).toFixed(0)} KB in all`);
