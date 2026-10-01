// Sound (T-506). Nothing loads or plays until the visitor's first click, tap or key press (browsers
// require it, and a silent start is kinder). Then: a soft ambience loop, the fountain as a positional
// source you can walk up to, a gentle tap for buttons and a door chime when a shop opens. The tap
// and chime are short generated clips (11 KB together); until they load, or if they can't, they're
// synthesized. Volumes live in `volume` (Help dialog); `soundOn` mutes everything (N, or the
// speaker button).
import { effect, signal } from '@preact/signals';
import { AUDIO_LOOPS, LOOP_OVERLAP } from '@shopping-mall/shared/constants';
import { asset } from './assets';
import { load, save } from './storage';

export type Volume = { ambience: number; effects: number };
const saved = load<Partial<Volume>>('volume', {});
export const volume = signal<Volume>({ ambience: saved.ambience ?? 0.6, effects: saved.effects ?? 0.7 });
export function setVolume(v: Partial<Volume>) {
  volume.value = { ...volume.value, ...v };
  save('volume', volume.value);
}
export const soundOn = signal(load('soundOn', true));
export function toggleSound() {
  soundOn.value = !soundOn.value;
  save('soundOn', soundOn.value);
}

/** Loudness the loops are normalized to (RMS). The sources are generated quiet and uneven. */
const TARGET_RMS = 0.05;
/** LAME's encoder delay: silence some browsers' MP3 decoders leave at the start of the file. */
const MP3_DELAY = 1105;
/** Peak level of the one-shots: the generated clips come out at very different levels. */
const PEAK = { chime: 0.3, tap: 0.15 };

type Vec = { x: number; y: number; z: number };
export type Sound = {
  /** Every frame: where the ears are and which way they face. */
  listen: (pos: Vec, forward: Vec) => void;
  tap: () => void;
  chime: () => void;
};

let started: Promise<Sound> | null = null;

/** Starts audio on the first interaction. `fountain` places the fountain loop in the world. */
export function soundOnFirstInteraction(fountain: Vec | null, onReady: (s: Sound) => void) {
  const go = () => {
    removeEventListener('pointerdown', go);
    removeEventListener('keydown', go);
    started ??= start(fountain);
    started.then(onReady, (e) => console.warn('audio:', e));
  };
  addEventListener('pointerdown', go);
  addEventListener('keydown', go);
}

async function start(fountain: Vec | null): Promise<Sound> {
  const ctx = new AudioContext();
  const ambience = ctx.createGain();
  const effects = ctx.createGain();
  ambience.connect(ctx.destination);
  effects.connect(ctx.destination);
  effect(() => {
    const on = soundOn.value ? 1 : 0;
    ambience.gain.setTargetAtTime(volume.value.ambience * on, ctx.currentTime, 0.1);
    effects.gain.setTargetAtTime(volume.value.effects * on, ctx.currentTime, 0.1);
  });
  // a hidden tab goes quiet
  document.addEventListener('visibilitychange', () => {
    void (document.hidden ? ctx.suspend() : ctx.resume());
  });

  const decode = async (name: string) => {
    const buf = await ctx.decodeAudioData(await (await fetch(asset(`audio/${name}.mp3`))).arrayBuffer());
    return { buf, gain: TARGET_RMS / rms(buf) };
  };
  const [amb, water] = await Promise.all([decode('ambient'), decode('fountain')]);
  loop(ctx, amb.buf, AUDIO_LOOPS.ambient.seconds, amb.gain, ambience);
  if (fountain) {
    const panner = new PannerNode(ctx, {
      panningModel: 'equalpower',
      distanceModel: 'inverse',
      refDistance: 2.5,
      rolloffFactor: 1.6,
      maxDistance: 60,
      positionX: fountain.x,
      positionY: fountain.y + 1,
      positionZ: fountain.z,
    });
    panner.connect(ambience);
    loop(ctx, water.buf, AUDIO_LOOPS.fountain.seconds, water.gain * 1.5, panner);
  }

  // the one-shots, after the loops (nothing waits on them): synthesized until they're in
  const shots: Partial<Record<keyof typeof PEAK, { buf: AudioBuffer; gain: number; lead: number }>> = {};
  for (const name of ['chime', 'tap'] as const) {
    fetch(asset(`audio/${name}.mp3`))
      .then((r) => r.arrayBuffer())
      .then((bytes) => ctx.decodeAudioData(bytes))
      .then((buf) => {
        shots[name] = { buf, gain: PEAK[name] / peak(buf), lead: lead(buf) };
      })
      .catch((e) => console.warn(`audio: ${name}:`, e));
  }
  const play = (name: keyof typeof PEAK, fallback: () => void) => {
    const shot = shots[name];
    if (!shot) return fallback();
    const src = new AudioBufferSourceNode(ctx, { buffer: shot.buf });
    src.connect(new GainNode(ctx, { gain: shot.gain })).connect(effects);
    src.start(0, shot.lead);
  };

  const l = ctx.listener;
  return {
    listen(pos, fwd) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t);
      l.forwardY.setValueAtTime(fwd.y, t);
      l.forwardZ.setValueAtTime(fwd.z, t);
    },
    tap: () => play('tap', () => tone(ctx, effects, [[1320, 0]], 0.05, 0.12)),
    chime: () =>
      play('chime', () =>
        tone(
          ctx,
          effects,
          [
            [1318.5, 0], // E6
            [1046.5, 0.16], // C6
          ],
          0.9,
          0.22,
        ),
      ),
  };
}

/** Seconds of near-silence before a clip's sound starts (MP3 frames can't be cut any finer). */
function lead(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  const floor = peak(buf) * 0.05;
  const i = d.findIndex((x) => Math.abs(x) > floor);
  return Math.max(0, i / buf.sampleRate - 0.005);
}

/** The highest sample of a buffer's first channel. */
function peak(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let p = 0;
  for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i] ?? 0));
  return p || 1;
}

/** Root-mean-square level of a buffer's first channel. */
function rms(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += (d[i] ?? 0) ** 2;
  return Math.sqrt(s / d.length) || 1;
}

/**
 * Loop a buffer forever. The file is `seconds` of seamless loop plus its first LOOP_OVERLAP seconds
 * again (tools/assets/audio.ts), so each pass overlaps the next on identical audio: a linear
 * crossfade there sums back to exactly the signal, whatever padding the MP3 decoder added.
 */
function loop(ctx: AudioContext, buf: AudioBuffer, seconds: number, level: number, out: AudioNode) {
  // a decoder that keeps the encoder's delay leaves ~46 ms of near-silence first: skip it
  const d = buf.getChannelData(0);
  let quiet = 0;
  while (quiet < MP3_DELAY && Math.abs(d[quiet] ?? 1) < 1e-3) quiet++;
  const offset = quiet >= MP3_DELAY * 0.8 ? MP3_DELAY / buf.sampleRate : 0;
  let next = ctx.currentTime + 0.05;
  const schedule = () => {
    while (next < ctx.currentTime + 4) {
      const src = new AudioBufferSourceNode(ctx, { buffer: buf });
      const g = new GainNode(ctx, { gain: 0 });
      src.connect(g).connect(out);
      g.gain.setValueAtTime(0, next);
      g.gain.linearRampToValueAtTime(level, next + LOOP_OVERLAP);
      g.gain.setValueAtTime(level, next + seconds);
      g.gain.linearRampToValueAtTime(0, next + seconds + LOOP_OVERLAP);
      src.start(next, offset, seconds + LOOP_OVERLAP);
      next += seconds;
    }
  };
  schedule();
  setInterval(schedule, 1000);
}

/** A soft bell: sine partials with a quick attack and exponential decay. [frequency, delay] pairs. */
function tone(ctx: AudioContext, out: AudioNode, notes: [number, number][], decay: number, peak: number) {
  const t0 = ctx.currentTime;
  for (const [freq, delay] of notes) {
    for (const [mult, amp] of [
      [1, 1],
      [2.76, 0.18], // a faint inharmonic partial makes it bell-like
    ] as const) {
      const osc = new OscillatorNode(ctx, { type: 'sine', frequency: freq * mult });
      const g = new GainNode(ctx, { gain: 0 });
      osc.connect(g).connect(out);
      const t = t0 + delay;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * amp, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.start(t);
      osc.stop(t + decay + 0.05);
    }
  }
}
