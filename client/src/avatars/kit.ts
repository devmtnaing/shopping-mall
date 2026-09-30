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
/** Bench seat height (m, tools/greybox/props.ts), and the hips' height at rest in rig units (every rig). */
const SEAT = 0.45;
const HIPS = 0.176;
/** Held things are drawn this much bigger, so they read at a distance next to the big chibi hands. */
const HELD_SCALE = 1.6;
/** The hip joint sits this far above the bottom of the hips (m). */
const HIP_DEPTH = 0.03;

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
  /** What's in the right hand (an apple), and where the hand is on its bone. */
  private held: Object3D | null = null;
  private hand: { bone: Object3D; at: Vector3 } | null = null;

  constructor(id: AvatarId, object: Object3D, clips: AnimationClip[]) {
    this.id = id;
    this.object = object;
    this.rig = object.children[0];
    this.sitLift = SEAT + HIP_DEPTH - HIPS * (this.rig?.scale.y ?? 2);
    this.mixer = new AnimationMixer(object);
    for (const c of clips) this.actions.set(c.name, this.mixer.clipAction(c));
    for (const name of ['jump', 'emote-yes', 'emote-no', 'interact-right', 'hug']) {
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
        next.reset().play();
        if (this.current) next.crossFadeFrom(this.current, FADE, false);
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

  /** Play a clip once over standing still (throwing an apple uses the reach). */
  gesture(clip: string) {
    const a = this.actions.get(clip);
    if (!a || this.state !== ANIM.idle) return; // gestures only when standing still
    this.playing?.stop();
    this.playing = a;
    a.reset().play();
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
    this.hand ??= findHand(this.object);
    if (!this.hand) return;
    const s = this.hand.bone.getWorldScale(new Vector3()).x || 1;
    item.scale.setScalar(HELD_SCALE / s); // the bone lives inside the character's scale
    item.position.copy(this.hand.at);
    this.hand.bone.add(item);
  }

  update(dt: number) {
    this.mixer.update(dt);
    // onto the seat as the sit fades in, and back down as it fades out
    const sit = this.actions.get('sit');
    if (this.rig) this.rig.position.y = sit?.isRunning() ? this.sitLift * sit.getEffectiveWeight() : 0;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.object);
    this.object.removeFromParent();
  }
}

/**
 * The right hand: near the point of the right arm's mesh farthest from its shoulder, in the arm
 * bone's own space (every character's arm is a different length).
 */
function findHand(root: Object3D): { bone: Object3D; at: Vector3 } | null {
  let found: { bone: Object3D; at: Vector3 } | null = null;
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
    /** True when the arm bone carries most of vertex k (it may sit in any of the four slots). */
    const onArm = (k: number) => {
      for (let j = 0; j < 4; j++)
        if (idx.getComponent(k, j) === i && weight.getComponent(k, j) > 0.5) return true;
      return false;
    };
    // posed vertices in world space, then into the bone's space (the arm is rigid, so any pose will
    // do, as long as the skinning matches the bones: refresh it, it's otherwise a frame behind)
    mesh.skeleton.update();
    const shoulder = bone.getWorldPosition(new Vector3());
    const hand = new Vector3();
    let far = -1;
    for (let k = 0; k < count; k++) {
      if (!onArm(k)) continue;
      mesh.getVertexPosition(k, v).applyMatrix4(mesh.matrixWorld);
      const d = v.distanceToSquared(shoulder);
      if (d > far) {
        far = d;
        hand.copy(v);
      }
    }
    if (far < 0) return;
    // the very tip hangs at the floor: hold things a little way up the hand
    found = { bone, at: bone.worldToLocal(hand).multiplyScalar(0.85) };
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
