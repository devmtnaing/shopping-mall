// Fountain water (T-213): the fountain model's water is painted on, so this adds moving water on
// top: a rippling surface in each basin and a curtain falling from each rim into the tier below.
// Unlit and transparent, like the baked mall around it; one small shader, animated by `time`.
// The levels and radii were measured off the fountain model at its placed size (4.4 m across,
// tools/greybox/props.ts): basins at 0.5, 2.2 and 3.3 m, rims at r 1.87, 0.83 and 0.37 m.
import {
  AdditiveBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  type Object3D,
  RingGeometry,
  ShaderMaterial,
} from 'three';

/** [height, inner radius, outer radius] of each basin's water. */
const POOLS: [number, number, number][] = [
  [0.56, 0.3, 1.9],
  [2.26, 0.22, 0.84],
  [3.36, 0.1, 0.36],
];
/** [top height, bottom height, top radius, bottom radius] of each falling curtain. */
const FALLS: [number, number, number, number][] = [
  [2.4, 0.58, 0.97, 1.12],
  [3.48, 2.28, 0.5, 0.58],
];

const time = { value: 0 };

const surface = new ShaderMaterial({
  uniforms: { time },
  transparent: true,
  depthWrite: false,
  clipping: true, // the overview cuts away what's above the floor
  vertexShader: /* glsl */ `
    varying vec2 vPos;
    #include <clipping_planes_pars_vertex>
    void main() {
      vPos = position.xy; // the ring lies in its own xy plane
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
    }`,
  fragmentShader: /* glsl */ `
    #include <clipping_planes_pars_fragment>
    uniform float time;
    varying vec2 vPos;
    void main() {
      #include <clipping_planes_fragment>
      float r = length(vPos);
      float a = atan(vPos.y, vPos.x);
      // rings spreading out from where the water falls, plus a slow cross-hatch of small waves
      float rings = sin(r * 22.0 - time * 3.2) * 0.5 + 0.5;
      float chop = sin(vPos.x * 9.0 + time * 1.3) * sin(vPos.y * 8.0 - time * 1.1) * 0.5 + 0.5;
      float sparkle = pow(max(0.0, sin(a * 7.0 + r * 13.0 - time * 2.0)), 18.0);
      vec3 deep = vec3(0.36, 0.62, 0.72);
      vec3 light = vec3(0.78, 0.93, 0.97);
      vec3 col = mix(deep, light, rings * 0.45 + chop * 0.35) + sparkle * 0.35;
      gl_FragColor = vec4(col, 0.72);
    }`,
});

const falling = new ShaderMaterial({
  uniforms: { time },
  transparent: true,
  depthWrite: false,
  clipping: true, // the overview cuts away what's above the floor
  side: DoubleSide,
  blending: AdditiveBlending,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    #include <clipping_planes_pars_vertex>
    void main() {
      vUv = uv;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform float time;
    varying vec2 vUv;
    #include <clipping_planes_pars_fragment>
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      #include <clipping_planes_fragment>
      // streaks round the curtain, each falling at its own speed, fading in at the lip and out at the splash
      float col = floor(vUv.x * 90.0);
      float speed = 1.4 + hash(col) * 0.8;
      float streak = fract(vUv.y * 3.0 + time * speed + hash(col + 7.0));
      float across = 1.0 - abs(fract(vUv.x * 90.0) - 0.5) * 2.0; // thin threads, not blocks
      float strand = smoothstep(0.0, 0.35, streak) * smoothstep(0.1, 0.9, across) * (0.4 + 0.6 * hash(col + 3.0));
      float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
      gl_FragColor = vec4(vec3(0.62, 0.82, 0.9) * strand * edge * 0.7, 1.0);
    }`,
});

/** Water for one fountain, in its own frame (add it where the fountain stands). */
function water(): Group {
  const g = new Group();
  for (const [y, inner, outer] of POOLS) {
    const pool = new Mesh(new RingGeometry(inner, outer, 48, 1), surface);
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = y;
    pool.renderOrder = 1;
    g.add(pool);
  }
  for (const [top, bottom, rTop, rBottom] of FALLS) {
    const curtain = new Mesh(new CylinderGeometry(rTop, rBottom, top - bottom, 48, 1, true), falling);
    curtain.position.y = (top + bottom) / 2;
    curtain.renderOrder = 2;
    g.add(curtain);
  }
  return g;
}

export type FountainWater = { group: Group; update(dt: number): void };

/** Water for every fountain in `placements` (the mall's props). */
export function fountainWater(placements: { kind: string; pos: number[]; yaw: number }[]): FountainWater {
  const group = new Group();
  for (const p of placements) {
    if (p.kind !== 'fountain') continue;
    const w: Object3D = water();
    w.position.set(p.pos[0] ?? 0, p.pos[1] ?? 0, p.pos[2] ?? 0);
    w.rotation.y = p.yaw;
    group.add(w);
  }
  return {
    group,
    update(dt) {
      time.value = (time.value + dt) % 1000;
    },
  };
}
