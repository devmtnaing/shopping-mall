// pnpm assets — audio (T-506, #3): builds client/public/assets/audio/ from the generated clips in
// assets-src/audio with ffmpeg (without it, the committed files are kept).
//
// Loops: `seconds` of the source become a seamless loop. The loop's start is crossfaded with what
// follows its end in the source (so the last sample runs straight on into the first), then the
// first LOOP_OVERLAP seconds are appended again. The client overlaps passes on that repeated,
// identical audio, so the join is exact however a browser's MP3 decoder pads the file.
// One-shots (door chime, UI tap): cut from their first sound to where they die away, faded out at
// the end, peak-normalised.
// Everything is re-encoded with LAME at 24 kHz. Budget: ≤ 250 KB in all.
import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUDIO_LOOPS, LOOP_OVERLAP } from '@shopping-mall/shared/constants';

const SRC = resolve(import.meta.dirname, '../../assets-src/audio/higgsfield');
const OUT = resolve(import.meta.dirname, '../../client/public/assets/audio');
const RATE = 24000;
/**
 * Seconds of the source blended into each loop's start. The fountain's is short because its source
 * has one loud splash at 6.75 s, which a longer blend would bring into a loop that repeats every 6 s.
 */
const BLEND: Record<string, number> = { ambient: 3, fountain: 0.6 };
const ONESHOTS = ['chime', 'tap'];

const ffmpeg = (args: string[], input?: Buffer) => {
  const r = spawnSync('ffmpeg', ['-v', 'error', ...args], { input, maxBuffer: 1 << 28 });
  if (r.error || r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.error ?? r.stderr}`);
  return r.stdout;
};
if (spawnSync('ffmpeg', ['-version']).status !== 0) {
  console.log('audio: no ffmpeg on the PATH; keeping the committed files');
  process.exit(0);
}

/** A file's samples, interleaved, at RATE with `channels` channels. */
function decode(name: string, channels: number): Float32Array {
  const raw = ffmpeg([
    '-i',
    `${SRC}/${name}.mp3`,
    '-f',
    'f32le',
    '-ac',
    String(channels),
    '-ar',
    String(RATE),
    '-',
  ]);
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

function encode(name: string, pcm: Float32Array, channels: number, kbps: number) {
  const out = `${OUT}/${name}.mp3`;
  ffmpeg(
    ['-y', '-f', 'f32le', '-ar', String(RATE), '-ac', String(channels), '-i', '-'].concat([
      '-c:a',
      'libmp3lame',
      '-b:a',
      `${kbps}k`,
      '-map_metadata',
      '-1',
      out,
    ]),
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  );
  return statSync(out).size;
}

function loop(src: Float32Array, channels: number, seconds: number, blendSeconds: number): Float32Array {
  const n = seconds * RATE;
  const blend = Math.round(blendSeconds * RATE);
  const extra = LOOP_OVERLAP * RATE;
  if (src.length / channels < n + blend) throw new Error(`audio: source too short for a ${seconds} s loop`);
  const body = new Float32Array(n * channels);
  for (let i = 0; i < n; i++) {
    // equal-power: the source and its continuation are different sound, so their levels add
    const w = i < blend ? Math.sin(((i / blend) * Math.PI) / 2) : 1;
    const v = i < blend ? Math.cos(((i / blend) * Math.PI) / 2) : 0;
    for (let c = 0; c < channels; c++)
      body[i * channels + c] = (src[i * channels + c] ?? 0) * w + (src[(n + i) * channels + c] ?? 0) * v;
  }
  const out = new Float32Array((n + extra) * channels);
  out.set(body);
  out.set(body.subarray(0, extra * channels), n * channels);
  return out;
}

function oneshot(src: Float32Array): Float32Array {
  const peak = src.reduce((p, x) => Math.max(p, Math.abs(x)), 0) || 1;
  let start = src.findIndex((x) => Math.abs(x) > peak * 0.05);
  // the end: the last 10 ms window still clearly above the source's background noise
  const win = Math.round(0.01 * RATE);
  const level = (i: number) => {
    let sum = 0;
    for (let j = i; j < Math.min(src.length, i + win); j++) sum += (src[j] ?? 0) ** 2;
    return Math.sqrt(sum / win);
  };
  let end = src.length - win;
  while (end > start && level(end) < peak * 0.01) end -= win;
  end += win;
  start = Math.max(0, start - Math.round(0.004 * RATE));
  end = Math.min(src.length, end + Math.round(0.03 * RATE));
  const out = src.slice(start, end);
  const fade = Math.min(out.length, Math.round(0.03 * RATE));
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i < fade ? (out.length - i) / fade : 1;
    out[i] = ((out[i] ?? 0) / peak) * 0.7 * tail; // peak at −3 dBFS
  }
  return out;
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, { seconds, stereo }] of Object.entries(AUDIO_LOOPS)) {
  const channels = stereo ? 2 : 1;
  const size = encode(
    name,
    loop(decode(name, channels), channels, seconds, BLEND[name] ?? 1),
    channels,
    stereo ? 64 : 48,
  );
  total += size;
  console.log(`audio: ${name} ${seconds} + ${LOOP_OVERLAP} s loop, ${(size / 1024).toFixed(0)} KB`);
}
for (const name of ONESHOTS) {
  const pcm = oneshot(decode(name, 1));
  const size = encode(name, pcm, 1, 48);
  total += size;
  console.log(`audio: ${name} ${(pcm.length / RATE).toFixed(2)} s, ${(size / 1024).toFixed(1)} KB`);
}
console.log(`audio: ${(total / 1024).toFixed(0)} KB in all`);
