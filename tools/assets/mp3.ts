// Minimal MP3 (MPEG-1/2 Layer III) frame walker: duration and lossless trimming at frame boundaries.
// Enough for trimming ambience loops without an encoder; not a decoder.
const BITRATES: Record<string, number[]> = {
  // [v1 layer III], [v2/v2.5 layer III] in kbps, index 1..14
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};

export type Frame = { offset: number; length: number; samples: number; rate: number; kbps: number };

/** Frames of an MP3 (after any ID3v2 tag). */
export function frames(buf: Uint8Array): Frame[] {
  let o = 0;
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size = ((buf[6] ?? 0) << 21) | ((buf[7] ?? 0) << 14) | ((buf[8] ?? 0) << 7) | (buf[9] ?? 0);
    o = 10 + size;
  }
  const out: Frame[] = [];
  while (o + 4 <= buf.length) {
    const b1 = buf[o + 1] ?? 0;
    const b2 = buf[o + 2] ?? 0;
    if (buf[o] !== 0xff || (b1 & 0xe0) !== 0xe0) {
      o++;
      continue;
    }
    const version = (b1 >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const layer = (b1 >> 1) & 3; // 1 = layer III
    const bi = (b2 >> 4) & 15;
    const ri = (b2 >> 2) & 3;
    const rate = RATES[version]?.[ri];
    if (layer !== 1 || version === 1 || bi === 0 || bi === 15 || !rate) {
      o++;
      continue;
    }
    const kbps = (version === 3 ? BITRATES.v1 : BITRATES.v2)?.[bi] ?? 0;
    const samples = version === 3 ? 1152 : 576;
    const length = Math.floor(((samples / 8) * kbps * 1000) / rate) + ((b2 >> 1) & 1);
    out.push({ offset: o, length, samples, rate, kbps });
    o += length;
  }
  return out;
}

export const duration = (fs: Frame[]) => fs.reduce((t, f) => t + f.samples / f.rate, 0);

/** The first `seconds` of an MP3, cut on a frame boundary (no re-encoding). */
export function trim(buf: Uint8Array, seconds: number): Uint8Array {
  const fs = frames(buf);
  let t = 0;
  let end = fs[0]?.offset ?? 0;
  const start = end;
  for (const f of fs) {
    if (t >= seconds) break;
    t += f.samples / f.rate;
    end = f.offset + f.length;
  }
  return buf.slice(start, end);
}

/** The frames between `from` and `to` seconds, plus one frame before (a frame may borrow bits from the one before it). */
export function slice(buf: Uint8Array, from: number, to: number): Uint8Array {
  const fs = frames(buf);
  let t = 0;
  let start = -1;
  let end = 0;
  for (const [i, f] of fs.entries()) {
    const next = t + f.samples / f.rate;
    if (start < 0 && next > from) start = (fs[Math.max(0, i - 1)] as Frame).offset;
    if (start >= 0 && t < to) end = f.offset + f.length;
    t = next;
  }
  return buf.slice(Math.max(0, start), end);
}
