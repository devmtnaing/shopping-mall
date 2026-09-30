// Dance and hug (T-507): Kenney's pack has no clips for them, so they're keyframed here, on the same
// seven bones, and added to avatars.glb next to Kenney's clips. Like Kenney's, they rotate the bones
// (plus the root's height), so they play on every character, generated ones included. Sit replaces
// Kenney's, which sits on the floor: in the mall you sit on a bench.
//
// Kenney's conventions, read off its clips: at rest the arms hang at ±45° about Z (arm-left −45,
// arm-right +45); raising an arm turns it towards 0 and past; a rotation about Y swings an arm
// forward (negative for the left arm, positive for the right); a negative X lifts a leg forward.
import type { Document, Node } from '@gltf-transform/core';

const FPS = 30;
const D = Math.PI / 180;

/** Euler angles (degrees, XYZ order, as three.js uses) to a quaternion. */
function quat(x: number, y: number, z: number): number[] {
  const [c1, c2, c3] = [Math.cos((x * D) / 2), Math.cos((y * D) / 2), Math.cos((z * D) / 2)];
  const [s1, s2, s3] = [Math.sin((x * D) / 2), Math.sin((y * D) / 2), Math.sin((z * D) / 2)];
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

const smooth = (a: number, b: number, t: number) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

type Pose = Record<string, [number, number, number]>; // bone → euler degrees
type Clip = { name: string; duration: number; pose: (t: number) => Pose; lift?: (t: number) => number };

const CLIPS: Clip[] = [
  {
    // on a bench, legs out in front (they're one bone each: no knees to bend), hands forward on the
    // lap. The root stays put: characters differ in size, so the client lifts each onto the seat.
    name: 'sit',
    duration: 1,
    pose: () => ({
      torso: [-4, 0, 0],
      'arm-left': [0, -30, -38],
      'arm-right': [0, 30, 38],
      'leg-left': [-72, 0, -4],
      'leg-right': [-72, 0, 4],
    }),
    lift: () => 0,
  },
  {
    // one bar of a happy dance: arms pumping in turn, a bounce on each beat, a sway, a knee lift
    name: 'dance',
    duration: 1,
    pose: (t) => {
      const s = Math.sin(2 * Math.PI * t);
      return {
        torso: [0, 12 * s, 8 * s],
        head: [0, 0, -10 * s],
        'arm-left': [0, 0, -45 + 105 * (0.5 + 0.5 * s)],
        'arm-right': [0, 0, 45 - 105 * (0.5 - 0.5 * s)],
        'leg-left': [-18 * Math.max(0, s), 0, 0],
        'leg-right': [-18 * Math.max(0, -s), 0, 0],
      };
    },
    lift: (t) => 0.0125 * (1 - Math.cos(4 * Math.PI * t)),
  },
  {
    // reach out, hold (with a little rock from side to side), let go
    name: 'hug',
    duration: 1.8,
    pose: (t) => {
      const e = smooth(0, 0.35, t) * (1 - smooth(1.4, 1.8, t));
      const rock =
        6 * Math.sin((2 * Math.PI * (t - 0.35)) / 1.05) * smooth(0.3, 0.5, t) * (1 - smooth(1.2, 1.4, t));
      return {
        torso: [10 * e, rock, 0],
        head: [-5 * e, 0, 8 * e],
        'arm-left': [0, -80 * e, -45 + 35 * e],
        'arm-right': [0, 80 * e, 45 - 35 * e],
      };
    },
  },
];

/** Kenney's clips of the same name are replaced. */
export const SOCIAL_CLIPS = CLIPS.map((c) => c.name);

/** Adds the clips to `doc`, animating the joints in `joints` (bone name → node). */
export function addSocialClips(doc: Document, joints: Map<string, Node>) {
  const buffer = doc.getRoot().listBuffers()[0];
  for (const clip of CLIPS) {
    const n = Math.round(clip.duration * FPS) + 1;
    const times = Float32Array.from({ length: n }, (_, i) => i / FPS);
    const input = doc
      .createAccessor(`${clip.name}-t`)
      .setType('SCALAR')
      .setArray(times)
      .setBuffer(buffer ?? null);
    const anim = doc.createAnimation(clip.name);
    const poses = [...times].map((t) => clip.pose(t));
    const channel = (
      node: Node,
      path: 'rotation' | 'translation',
      values: Float32Array<ArrayBuffer>,
      type: 'VEC4' | 'VEC3',
    ) => {
      const output = doc
        .createAccessor(`${clip.name}-${node.getName()}-${path}`)
        .setType(type)
        .setArray(values)
        .setBuffer(buffer ?? null);
      const sampler = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation('LINEAR');
      anim
        .addSampler(sampler)
        .addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
    };
    for (const bone of Object.keys(poses[0] ?? {})) {
      const node = joints.get(bone);
      if (!node) throw new Error(`social clips: no joint "${bone}"`);
      channel(
        node,
        'rotation',
        Float32Array.from(poses.flatMap((p) => quat(...(p[bone] ?? [0, 0, 0])))),
        'VEC4',
      );
    }
    if (clip.lift) {
      const root = joints.get('root');
      if (!root) throw new Error('social clips: no root joint');
      channel(
        root,
        'translation',
        Float32Array.from([...times].flatMap((t) => [0, clip.lift?.(t) ?? 0, 0])),
        'VEC3',
      );
    }
  }
}
