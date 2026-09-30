// Avatars (T-207/T-209/T-210): avatars.glb holds every character and one shared set of clips.
// Each visitor gets a clone with its own skeleton and mixer; geometry, material and texture are
// shared, so a second avatar of the same character downloads and allocates nothing new.
// Loaded lazily after the mall: capsules stand in until it arrives.

import { type AvatarId, DEFAULT_AVATAR, isAvatar } from '@shopping-mall/shared/avatars';
import { ANIM } from '@shopping-mall/shared/protocol';
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  type Object3D,
  type SkinnedMesh,
  Sphere,
  Vector3,
} from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';

const URL = `${import.meta.env.BASE_URL}assets/avatars/avatars.glb`;
/** Crossfade between states (s). Short enough to feel responsive, long enough not to pop. */
const FADE = 0.18;
/** Ground speed (m/s) at which the walk and sprint cycles' feet don't slide at timeScale 1. */
const WALK_NOMINAL = 2.4;
const RUN_NOMINAL = 5.6;
/** Seat height (m): benches, the island and sofas (tools/greybox/layout.ts). */
const SEAT = 0.46;
/** A held apple is about this wide next to the hand holding it (the apple model is 0.14 m across). */
const HELD_FIT = 0.9;
const APPLE_WIDTH = 0.14;
type Hand = { bone: Object3D; at: Vector3; width: number };
/** Sitting, a character's back stops this far short of the backrest (m). */
const BACK_GAP = 0.03;
/** Each character's body, measured once: how far its back is behind its origin, and its seat's height (m). */
const bodyOf = new Map<string, Body>();
type Body = { back: number; bottom: number };

const BOUNDS = new Sphere(new Vector3(0, 0.3, 0), 0.55);

const CLIP_FOR_STATE: Record<number, string> = {
  [ANIM.idle]: 'idle',
  [ANIM.walk]: 'walk',
  [ANIM.run]: 'sprint',
  [ANIM.jump]: 'jump',
  [ANIM.fall]: 'fall',
  [ANIM.sit]: 'sit',
};
/** Emotes play a gesture while you stand still: a one-shot, or a few bars of dancing. */
const CLIP_FOR_EMOTE: Record<string, string> = { '👋': 'interact-right', '💃': 'dance', '🤗': 'hug' };
/** Bars of dance per 💃 (one bar is a second). */
const DANCE_BARS = 6;

export class Avatar {
  readonly object: Object3D;
  readonly id: AvatarId;
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private current: AnimationAction | null = null;
  private state = -1;
  private playing: AnimationAction | null = null;
  /** The character under `object`, and how far to raise it to sit on a bench (its size varies). */
  private readonly rig: Object3D | undefined;
  private readonly sitLift: number;
  /** How far forward it slides to sit: seats mark the backrest, and characters differ in depth. */
  private readonly sitForward: number;
  /** What's in the right hand (an apple), and where the hand is on its bone. */
  private held: Object3D | null = null;
  private readonly hand: Hand | null;

  constructor(id: AvatarId, object: Object3D, clips: AnimationClip[]) {
    this.id = id;
    this.object = object;
    this.rig = object.children[0];
    let body = bodyOf.get(id);
    if (!body) {
      body = measureBody(object);
      bodyOf.set(id, body);
    }
    this.sitLift = SEAT - body.bottom; // the bottom of the body onto the seat
    this.sitForward = body.back + BACK_GAP;
    this.hand = findHand(object); // at rest, before anything plays
    this.mixer = new AnimationMixer(object);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    for (const name of ['jump', 'emote-yes', 'emote-no', 'interact-right', 'hug', 'throw']) {
      const a = this.actions.get(name);
      if (a) {
        a.setLoop(LoopOnce, 1);
        a.clampWhenFinished = true;
      }
    }
    this.actions.get('dance')?.setLoop(LoopRepeat, DANCE_BARS);
    this.mixer.addEventListener('finished', (e) => {
      if (e.action === this.playing) this.endGesture();
    });
    this.setState(ANIM.idle, 0);
  }

  /** Movement state (ANIM.*) and ground speed; walk and run play faster or slower to match it. */
  setState(state: number, speed: number) {
    // walking off (or sitting down) ends a dance or a hug
    if (state !== this.state && state !== ANIM.idle && this.playing) {
      this.playing.fadeOut(FADE);
      this.playing = null;
    }
    if (state !== this.state) {
      const next = this.actions.get(CLIP_FOR_STATE[state] ?? 'idle');
      if (next && next !== this.current) {
        // coming to a stop during a gesture: idle waits until the gesture ends (endGesture fades to
        // it), rather than blending in and halving the gesture
        if (!(this.playing && state === ANIM.idle)) {
          next.reset().play();
          if (this.current) next.crossFadeFrom(this.current, FADE, false);
        }
        this.current = next;
      }
      this.state = state;
    }
    if (this.current && (state === ANIM.walk || state === ANIM.run)) {
      const nominal = state === ANIM.run ? RUN_NOMINAL : WALK_NOMINAL;
      this.current.timeScale = Math.min(1.6, Math.max(0.5, speed / nominal));
    }
  }

  /** Play an emote's gesture (a nod for the ones without their own). */
  emote(e: string) {
    this.gesture(CLIP_FOR_EMOTE[e] ?? 'emote-yes');
  }

  /**
   * Play a clip once, from `from` seconds in. Emotes only play standing still; `always` plays it
   * anyway (picking and throwing an apple, which hold you still for the moment themselves).
   */
  gesture(clip: string, from = 0, always = false) {
    const a = this.actions.get(clip);
    if (!a || (!always && this.state !== ANIM.idle)) return;
    this.playing?.stop();
    this.playing = a;
    a.reset().play();
    a.time = from;
    if (this.current) a.crossFadeFrom(this.current, FADE, false);
  }

  private endGesture() {
    const g = this.playing;
    this.playing = null;
    if (g && this.current) {
      this.current.reset().play();
      this.current.crossFadeFrom(g, FADE, false);
    }
  }

  /** Put something in the right hand (in world units, e.g. an apple), or empty it with null. */
  hold(item: Object3D | null) {
    this.held?.removeFromParent();
    this.held = item;
    if (!item) return;
    if (!this.hand) return;
    const s = this.hand.bone.getWorldScale(new Vector3()).x || 1;
    // sized to the hand (a small hand, a small apple), inside the character's scale
    const size = Math.min(1.8, Math.max(0.6, (this.hand.width * HELD_FIT) / APPLE_WIDTH));
    item.scale.setScalar(size / s);
    item.position.copy(this.hand.at);
    this.hand.bone.add(item);
  }

  /** Where the right hand is in the world, or null before the character has loaded its hand. */
  handPosition(out: Vector3): Vector3 | null {
    if (!this.hand) return null;
    this.object.updateMatrixWorld(true);
    return this.hand.bone.localToWorld(out.copy(this.hand.at));
  }

  update(dt: number) {
    this.mixer.update(dt);
    // onto the seat as the sit fades in, and back down as it fades out
    const sit = this.actions.get('sit');
    const w = sit?.isRunning() ? sit.getEffectiveWeight() : 0;
    if (this.rig) this.rig.position.set(0, this.sitLift * w, -this.sitForward * w); // up, and forward (−z)
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.object);
    this.object.removeFromParent();
  }
}

/**
 * A character's body, from what its torso bone carries, at rest, in its own space (it faces −z):
 * `bottom`, the lowest point (what sits on a seat), and `back`, how far the back is behind the
 * origin over the bottom 35 cm (where it meets a backrest; a big head or long hair hangs further
 * back higher up, over the backrest).
 */
function measureBody(root: Object3D): Body {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const v = new Vector3();
  const pts: Vector3[] = [];
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const i = mesh.skeleton.bones.findIndex((b) => b.name === 'torso');
    const idx = mesh.geometry.attributes.skinIndex;
    const weight = mesh.geometry.attributes.skinWeight;
    const count = mesh.geometry.attributes.position?.count ?? 0;
    if (i < 0 || !idx || !weight) return;
    mesh.skeleton.update();
    const on = (k: number) => {
      for (let j = 0; j < 4; j++)
        if (idx.getComponent(k, j) === i && weight.getComponent(k, j) > 0.5) return true;
      return false;
    };
    for (let k = 0; k < count; k++)
      if (on(k))
        pts.push(mesh.getVertexPosition(k, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(toRoot).clone());
  });
  if (!pts.length) return { back: 0.2, bottom: 0.33 };
  const bottom = Math.min(...pts.map((p) => p.y));
  const back = Math.max(0, ...pts.filter((p) => p.y < bottom + 0.35).map((p) => p.z));
  return { back, bottom };
}

/**
 * The right hand, in the arm bone's own space, and how wide it is (m): the far end of the arm, along
 * the arm from the shoulder (the characters' base pose is a T-pose, so "lowest" won't do), ignoring
 * anything off to the side of the arm like a bag strap. Measured once, when the character is made.
 */
function findHand(root: Object3D): Hand | null {
  let found: Hand | null = null;
  root.updateMatrixWorld(true);
  const v = new Vector3();
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (found || !mesh.isSkinnedMesh) return;
    const i = mesh.skeleton.bones.findIndex((b) => b.name === 'arm-right');
    const bone = mesh.skeleton.bones[i];
    const idx = mesh.geometry.attributes.skinIndex;
    const weight = mesh.geometry.attributes.skinWeight;
    const count = mesh.geometry.attributes.position?.count ?? 0;
    if (!bone || !idx || !weight) return;
    const onArm = (k: number) => {
      for (let j = 0; j < 4; j++)
        if (idx.getComponent(k, j) === i && weight.getComponent(k, j) > 0.5) return true;
      return false;
    };
    mesh.skeleton.update();
    const pts: Vector3[] = [];
    for (let k = 0; k < count; k++)
      if (onArm(k)) pts.push(mesh.getVertexPosition(k, v).applyMatrix4(mesh.matrixWorld).clone());
    if (!pts.length) return;
    // along the arm: from the shoulder towards the arm's middle. Skip anything well off that line
    // (a bag strap weighted to the arm), then the hand is the far end: the last fifth of the arm
    const shoulder = bone.getWorldPosition(new Vector3());
    const axis = pts
      .reduce((c, p) => c.add(p), new Vector3())
      .divideScalar(pts.length)
      .sub(shoulder)
      .normalize();
    const along = (p: Vector3) => p.clone().sub(shoulder).dot(axis);
    const off = (p: Vector3) => p.clone().sub(shoulder).addScaledVector(axis, -along(p)).length();
    const offs = pts.map(off).sort((x, y) => x - y);
    const limit = (offs[Math.floor(offs.length / 2)] ?? 0) * 2 + 0.02;
    const arm = pts.filter((p) => off(p) <= limit);
    const ts = arm.map(along);
    const [near, far] = [Math.min(...ts), Math.max(...ts)];
    const hand = arm.filter((p) => along(p) >= far - (far - near) * 0.2);
    const mid = hand.reduce((c, p) => c.add(p), new Vector3()).divideScalar(hand.length);
    const width = Math.max(...hand.map((p) => off(p))) * 2;
    // held at the front of the hand (the character faces −z), where fingers would close round it;
    // in the middle a chunky fist would hide it
    mid.z = hand.reduce((z, p) => Math.min(z, p.z), mid.z);
    found = { bone, at: bone.worldToLocal(mid), width };
  });
  return found;
}

export class AvatarKit {
  private readonly templates = new Map<AvatarId, Object3D>();
  private readonly clips: AnimationClip[];

  constructor(scene: Object3D, clips: AnimationClip[]) {
    this.clips = clips;
    for (const child of scene.children) {
      if (!isAvatar(child.name)) continue;
      // GLTFLoader makes node names unique (torso, torso_1, …); every rig needs the plain names
      // the clips were authored against
      child.traverse((o) => {
        o.name = o.name.replace(/_\d+$/, '');
      });
      child.name = child.name.replace(/_\d+$/, '');
      this.templates.set(child.name as AvatarId, child);
    }
  }

  create(id: string | undefined): Avatar {
    const key = isAvatar(id) && this.templates.has(id) ? id : DEFAULT_AVATAR;
    const rig = clone(this.templates.get(key) as Object3D);
    rig.position.set(0, 0, 0);
    rig.rotation.y = Math.PI; // the characters face +Z; in the mall yaw 0 faces −Z
    const object = new Group();
    object.add(rig);
    rig.traverse((o) => {
      // a fixed sphere that holds every pose (in the rig's own units, before the character's scale),
      // instead of recomputing skinned bounds
      if ((o as SkinnedMesh).isSkinnedMesh) (o as SkinnedMesh).boundingSphere = BOUNDS;
    });
    return new Avatar(key, object, this.clips);
  }
}

export async function loadAvatarKit(): Promise<AvatarKit> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(URL);
  return new AvatarKit(gltf.scene, gltf.animations);
}
