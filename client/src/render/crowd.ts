// Draws remote players: an animated avatar each once the avatar kit has loaded (capsules in one
// instanced mesh until then), and all name tags as instanced billboards sampling one name atlas.
// The server sends at most the nearest 40 people, so that's at most 40 skinned meshes; the ones far
// away (by quality tier) animate at a third of the rate.
import { PLAYER } from '@shopping-mall/shared/constants';
import { ANIM, animSpeed, animState, FLAG_HOLDING } from '@shopping-mall/shared/protocol';
import {
  BoxGeometry,
  type Camera,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { Avatar, AvatarKit } from '../avatars/kit';
import type { Remote, Remotes } from '../net/remotes';
import { nearestSpot, type SeatSpot } from '../player/seats';
import { TIERS, tier } from '../quality';
import { handApple } from '../world/apples';

const COLS = 4;
const ROWS = 16;
const CELL_W = 256;
const CELL_H = 64;
/** Name tags fade out between these distances (m). */
const FADE_START = 14;
const FADE_END = 24;
const TAG_Y = PLAYER.height + 0.42;

const m = new Matrix4();
const q = new Quaternion();
const pos = new Vector3();
const one = new Vector3(1, 1, 1);
const up = new Vector3(0, 1, 0);
const color = new Color();

export class Crowd {
  readonly group = new Group();
  readonly max: number;
  private readonly bodies: InstancedMesh;
  private readonly noses: InstancedMesh;
  private readonly tags: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly offset: InstancedBufferAttribute;
  private readonly cell: InstancedBufferAttribute;
  private readonly alpha: InstancedBufferAttribute;
  private readonly atlas: HTMLCanvasElement;
  private readonly atlasTex: CanvasTexture;
  /** Atlas cell per player id, only for people currently in view; cells are reused. */
  private readonly cells = new Map<number, number>();
  /** Label currently painted in each cell. */
  private readonly painted: string[] = [];
  private atlasDirty = false;
  private kit: AvatarKit | null = null;
  private readonly avatars = new Map<number, Avatar>();
  private frame = 0;
  private lastTime = 0;

  /** Where people can sit: someone sitting sits on the kind of seat nearest them. */
  seats: readonly SeatSpot[] = [];

  constructor(max = COLS * ROWS) {
    this.max = max;
    const { radius: r, height: h } = PLAYER;
    const body = new CapsuleGeometry(r, h - 2 * r, 4, 12).translate(0, h / 2, 0);
    this.bodies = new InstancedMesh(body, new MeshStandardMaterial({ roughness: 0.5 }), max);
    this.bodies.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bodies.setColorAt(0, color.set('#ffffff')); // allocates instanceColor
    const nose = new BoxGeometry(0.16, 0.1, 0.22).translate(0, h - 0.3, -r);
    this.noses = new InstancedMesh(nose, new MeshStandardMaterial({ color: '#1b1a18' }), max);
    this.noses.instanceMatrix.setUsage(DynamicDrawUsage);
    for (const mesh of [this.bodies, this.noses]) {
      mesh.count = 0;
      mesh.frustumCulled = false; // instances span the whole mall; culling the group box is wrong
    }

    this.atlas = document.createElement('canvas');
    this.atlas.width = COLS * CELL_W;
    this.atlas.height = ROWS * CELL_H;
    this.atlasTex = new CanvasTexture(this.atlas);
    this.atlasTex.colorSpace = SRGBColorSpace;

    const geo = new InstancedBufferGeometry();
    const quad = new PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.offset = new InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(DynamicDrawUsage);
    this.cell = new InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(DynamicDrawUsage);
    this.alpha = new InstancedBufferAttribute(new Float32Array(max), 1).setUsage(DynamicDrawUsage);
    geo.setAttribute('offset', this.offset);
    geo.setAttribute('cell', this.cell);
    geo.setAttribute('alpha', this.alpha);
    geo.instanceCount = 0;
    this.tags = new Mesh(geo, tagMaterial(this.atlasTex));
    this.tags.frustumCulled = false;
    this.tags.renderOrder = 2;

    this.group.add(this.bodies, this.noses, this.tags);
  }

  /** Avatars are ready: from now on everyone gets one instead of a capsule. */
  setKit(kit: AvatarKit) {
    this.kit = kit;
  }

  /** Play an emote's gesture on someone's avatar. */
  emote(id: number, e: string) {
    this.avatars.get(id)?.emote(e);
  }

  /** Play a clip once on someone's avatar (a throw), from `from` seconds in. */
  gesture(id: number, clip: string, from = 0) {
    this.avatars.get(id)?.gesture(clip, from);
  }

  update(remotes: Remotes, camera: Camera, time: number) {
    const dt = Math.min(0.1, time - this.lastTime);
    this.lastTime = time;
    this.frame++;
    this.releaseHidden(remotes);
    let n = 0;
    let capsules = 0;
    for (const r of remotes.players.values()) {
      const avatar = this.avatarFor(r);
      if (!r.visible || n >= this.max) {
        if (avatar) avatar.object.visible = false;
        continue;
      }
      const p = r.pose;
      const state = animState(p.anim);
      const speed = animSpeed(p.anim);
      if (avatar) {
        avatar.object.visible = true;
        avatar.object.position.set(p.x, p.y, p.z);
        avatar.object.rotation.y = p.yaw;
        if (state === ANIM.sit) {
          const spot = nearestSpot(this.seats as SeatSpot[], p);
          if (spot) avatar.sitOn(spot.seat);
        }
        avatar.setState(state, speed);
        const holds = (p.flags & FLAG_HOLDING) !== 0;
        if (holds !== avatar.holding) avatar.hold(holds ? handApple() : null);
        // beyond the tier's distance, animate every third frame
        const far =
          camera.position.distanceToSquared(avatar.object.position) > TIERS[tier.value].animateWithin ** 2;
        if (!far) avatar.update(dt);
        else if ((this.frame + r.id) % 3 === 0) avatar.update(dt * 3);
      } else {
        // capsules until the kit arrives: a little bob so walking still reads
        const bob = state === 1 || state === 2 ? Math.abs(Math.sin(time * speed * 2.4)) * 0.05 : 0;
        q.setFromAxisAngle(up, p.yaw);
        m.compose(pos.set(p.x, p.y + bob, p.z), q, one);
        this.bodies.setMatrixAt(capsules, m);
        this.noses.setMatrixAt(capsules, m);
        this.bodies.setColorAt(capsules, color.set(r.info.look.color));
        capsules++;
      }
      this.writeTag(n, r, camera);
      n++;
    }
    // people who left: drop their avatars
    for (const [id, a] of this.avatars) {
      if (!remotes.players.has(id)) {
        a.dispose();
        this.avatars.delete(id);
      }
    }
    this.bodies.count = this.noses.count = capsules;
    this.tags.geometry.instanceCount = n;
    this.bodies.instanceMatrix.needsUpdate = this.noses.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    this.offset.needsUpdate = this.cell.needsUpdate = this.alpha.needsUpdate = true;
    if (this.atlasDirty) {
      this.atlasTex.needsUpdate = true;
      this.atlasDirty = false;
    }
  }

  /** This person's avatar, created (or re-created after they changed character) on demand. */
  private avatarFor(r: Remote): Avatar | null {
    if (!this.kit) return null;
    let a = this.avatars.get(r.id);
    if (a && r.info.look.avatar && a.id !== r.info.look.avatar) {
      a.dispose();
      a = undefined;
    }
    if (!a) {
      a = this.kit.create(r.info.look.avatar);
      this.avatars.set(r.id, a);
      this.group.add(a.object);
    }
    return a;
  }

  private writeTag(i: number, r: Remote, camera: Camera) {
    const p = r.pose;
    this.offset.setXYZ(i, p.x, p.y + TAG_Y, p.z);
    const c = this.cellFor(r);
    if (c < 0) {
      this.alpha.setX(i, 0); // no free cell (more people in view than the atlas holds): no tag
      return;
    }
    this.cell.setXY(i, (c % COLS) / COLS, 1 - (Math.floor(c / COLS) + 1) / ROWS);
    const d = camera.position.distanceTo(pos.set(p.x, p.y + TAG_Y, p.z));
    const fade = 1 - Math.min(1, Math.max(0, (d - FADE_START) / (FADE_END - FADE_START)));
    // someone whose tab is in the background shows faintly
    this.alpha.setX(i, r.info.name ? fade * (r.info.away ? 0.35 : 1) : 0);
  }

  /** Free the cells of people who left or went out of view, so newcomers can use them. */
  private releaseHidden(remotes: Remotes) {
    for (const id of this.cells.keys()) {
      // the pixels stay painted; the cell is repainted only if someone else takes it
      if (!remotes.players.get(id)?.visible) this.cells.delete(id);
    }
  }

  /** This person's atlas cell, painting their name into a free one if needed. -1 if none free. */
  private cellFor(r: Remote): number {
    const label = `${r.info.host ? '★ ' : ''}${r.info.name}`;
    let c = this.cells.get(r.id);
    if (c === undefined) {
      const used = new Set(this.cells.values());
      // prefer a free cell that already shows this label (someone stepping back into view)
      c = this.painted.findIndex((l, i) => l === label && !used.has(i));
      if (c < 0) for (c = 0; c < COLS * ROWS && used.has(c); c++);
      if (c >= COLS * ROWS) return -1;
      this.cells.set(r.id, c);
    }
    if (this.painted[c] !== label) {
      drawTag(this.atlas.getContext('2d') as CanvasRenderingContext2D, c, label, !!r.info.host);
      this.painted[c] = label;
      this.atlasDirty = true;
    }
    return c;
  }
}

function drawTag(g: CanvasRenderingContext2D, c: number, label: string, host: boolean) {
  const x = (c % COLS) * CELL_W;
  const y = Math.floor(c / COLS) * CELL_H;
  g.clearRect(x, y, CELL_W, CELL_H);
  if (!label.trim()) return;
  g.font = '600 30px "Outfit", "Noto Sans Myanmar", system-ui, sans-serif';
  const w = Math.min(CELL_W - 8, g.measureText(label).width + 36);
  const left = x + (CELL_W - w) / 2;
  g.fillStyle = 'rgba(18,17,15,0.72)';
  g.beginPath();
  g.roundRect(left, y + 8, w, CELL_H - 16, (CELL_H - 16) / 2);
  g.fill();
  g.fillStyle = host ? '#e2b857' : '#f6f1e7';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, x + CELL_W / 2, y + CELL_H / 2 + 1, CELL_W - 44);
}

function tagMaterial(map: CanvasTexture) {
  return new ShaderMaterial({
    uniforms: {
      map: { value: map },
      size: { value: [1.4, 0.35] },
      cellSize: { value: [1 / COLS, 1 / ROWS] },
    },
    transparent: true,
    depthWrite: false,
    clipping: true,
    vertexShader: /* glsl */ `
      #include <clipping_planes_pars_vertex>
      attribute vec3 offset;
      attribute vec2 cell;
      attribute float alpha;
      uniform vec2 size;
      uniform vec2 cellSize;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        // billboard: spread the quad along the camera's right and up axes
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        // shrink tags close to the camera so they never fill the screen
        float near = clamp(distance(offset, cameraPosition) / 9.0, 0.3, 1.0);
        vec3 world = offset + (right * position.x * size.x + camUp * position.y * size.y) * near;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vUv = cell + uv * cellSize;
        vAlpha = alpha;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <clipping_planes_pars_fragment>
      uniform sampler2D map;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        #include <clipping_planes_fragment>
        vec4 c = texture2D(map, vUv);
        if (c.a * vAlpha < 0.02) discard;
        gl_FragColor = vec4(c.rgb, c.a * vAlpha);
        #include <colorspace_fragment>
      }`,
  });
}
