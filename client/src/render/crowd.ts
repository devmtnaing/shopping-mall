// Draws remote players cheaply: all bodies in one instanced mesh (per-player colour), and all name
// tags as instanced billboards sampling one name atlas. 40 people ≈ 3 draw calls.
import { PLAYER } from '@plaza/shared/constants';
import { unpackAnim } from '@plaza/shared/protocol';
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
import type { Remote, Remotes } from '../net/remotes';

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
  /** Atlas cell per player id; freed cells are reused. */
  private readonly cells = new Map<number, number>();
  private readonly drawn = new Map<number, string>();
  private version = -1;

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

  update(remotes: Remotes, camera: Camera, time: number) {
    if (remotes.version !== this.version) this.syncTags(remotes);
    let n = 0;
    for (const r of remotes.players.values()) {
      if (!r.visible || n >= this.max) continue;
      const p = r.pose;
      // a little bob while walking so movement reads even on capsules (real animation in Phase 2)
      const { state, speed } = unpackAnim(p.anim);
      const bob = state === 1 || state === 2 ? Math.abs(Math.sin(time * speed * 2.4)) * 0.05 : 0;
      q.setFromAxisAngle(up, p.yaw);
      m.compose(pos.set(p.x, p.y + bob, p.z), q, one);
      this.bodies.setMatrixAt(n, m);
      this.noses.setMatrixAt(n, m);
      this.bodies.setColorAt(n, color.set(r.info.look.color));
      this.writeTag(n, r, camera);
      n++;
    }
    this.bodies.count = this.noses.count = n;
    this.tags.geometry.instanceCount = n;
    this.bodies.instanceMatrix.needsUpdate = this.noses.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    this.offset.needsUpdate = this.cell.needsUpdate = this.alpha.needsUpdate = true;
  }

  private writeTag(i: number, r: Remote, camera: Camera) {
    const p = r.pose;
    this.offset.setXYZ(i, p.x, p.y + TAG_Y, p.z);
    const c = this.cells.get(r.id) ?? 0;
    this.cell.setXY(i, (c % COLS) / COLS, 1 - (Math.floor(c / COLS) + 1) / ROWS);
    const d = camera.position.distanceTo(pos.set(p.x, p.y + TAG_Y, p.z));
    const fade = 1 - Math.min(1, Math.max(0, (d - FADE_START) / (FADE_END - FADE_START)));
    this.alpha.setX(i, r.info.name ? fade : 0);
  }

  /** Give new players an atlas cell and draw their names; free cells of those who left. */
  private syncTags(remotes: Remotes) {
    this.version = remotes.version;
    for (const id of [...this.cells.keys()]) {
      if (!remotes.players.has(id)) {
        this.cells.delete(id);
        this.drawn.delete(id);
      }
    }
    const used = new Set(this.cells.values());
    const g = this.atlas.getContext('2d') as CanvasRenderingContext2D;
    let changed = false;
    for (const r of remotes.players.values()) {
      let c = this.cells.get(r.id);
      if (c === undefined) {
        c = 0;
        while (used.has(c) && c < COLS * ROWS) c++;
        if (c >= COLS * ROWS) continue; // atlas full: this player just has no tag
        this.cells.set(r.id, c);
        used.add(c);
      }
      const label = `${r.info.host ? '★ ' : ''}${r.info.name}`;
      if (this.drawn.get(r.id) === label) continue;
      drawTag(g, c, label, !!r.info.host);
      this.drawn.set(r.id, label);
      changed = true;
    }
    if (changed) this.atlasTex.needsUpdate = true;
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
        vec3 world = offset + right * position.x * size.x + camUp * position.y * size.y;
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
