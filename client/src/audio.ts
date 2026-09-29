// Sound (T-506). Nothing loads or plays until the visitor's first click, tap or key press (browsers
// require it, and a silent start is kinder). Then: a soft ambience loop, the fountain as a positional
// source you can walk up to, a gentle tap for buttons and a door chime when a shop opens. The tap
// and chime are synthesized, so they cost no download. Volumes live in `volume` (Help dialog).
import { effect, signal } from '@preact/signals';
import { load, save } from './storage';

export type Volume = { ambience: number; effects: number };
const saved = load<Partial<Volume>>('volume', {});
export const volume = signal<Volume>({ ambience: saved.ambience ?? 0.6, effects: saved.effects ?? 0.7 });
export function setVolume(v: Partial<Volume>) {
  volume.value = { ...volume.value, ...v };
  save('volume', volume.value);
}

const BASE = `${import.meta.env.BASE_URL}assets/audio/`;
/** Loudness the loops are normalized to (RMS). The sources are generated quiet and uneven. */
const TARGET_RMS = 0.05;
/** Crossfade at the loop point (s): the clips are trimmed, not made seamless. */
const FADE = 1.5;

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
    ambience.gain.setTargetAtTime(volume.value.ambience, ctx.currentTime, 0.1);
    effects.gain.setTargetAtTime(volume.value.effects, ctx.currentTime, 0.1);
  });
  // a hidden tab goes quiet
  document.addEventListener('visibilitychange', () => {
    void (document.hidden ? ctx.suspend() : ctx.resume());
  });

  const decode = async (name: string) => {
    const buf = await ctx.decodeAudioData(await (await fetch(`${BASE}${name}.mp3`)).arrayBuffer());
    return { buf, gain: TARGET_RMS / rms(buf) };
  };
  const [amb, water] = await Promise.all([decode('ambient'), decode('fountain')]);
  loop(ctx, amb.buf, amb.gain, ambience);
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
    loop(ctx, water.buf, water.gain * 1.5, panner);
  }

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
    tap: () => tone(ctx, effects, [[1320, 0]], 0.05, 0.12),
    chime: () =>
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
  };
}

/** Root-mean-square level of a buffer's first channel. */
function rms(buf: AudioBuffer): number {
  const d = buf.getChannelData(0);
  let s = 0;
  for (let i = 0; i < d.length; i++) s += (d[i] ?? 0) ** 2;
  return Math.sqrt(s / d.length) || 1;
}

/** Loop a buffer forever, overlapping each pass by FADE seconds with equal-power fades. */
function loop(ctx: AudioContext, buf: AudioBuffer, level: number, out: AudioNode) {
  const period = buf.duration - FADE;
  let next = ctx.currentTime + 0.05;
  const schedule = () => {
    while (next < ctx.currentTime + 4) {
      const src = new AudioBufferSourceNode(ctx, { buffer: buf });
      const g = new GainNode(ctx, { gain: 0 });
      src.connect(g).connect(out);
      g.gain.setValueCurveAtTime(fadeIn(level), next, FADE);
      g.gain.setValueCurveAtTime(fadeOut(level), next + period, FADE);
      src.start(next);
      src.stop(next + buf.duration);
      next += period;
    }
  };
  schedule();
  setInterval(schedule, 1000);
}
const curve = (level: number, f: (x: number) => number) =>
  Float32Array.from({ length: 32 }, (_, i) => level * f(i / 31));
const fadeIn = (level: number) => curve(level, (x) => Math.sin((x * Math.PI) / 2));
const fadeOut = (level: number) => curve(level, (x) => Math.cos((x * Math.PI) / 2));

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
