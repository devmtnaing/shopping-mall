// Skylight clouds (T-213): the atrium's skylight is an unlit panel; this gives it a sky, pale blue
// near the middle and bright towards the frame, with soft clouds drifting across. Clouds come from
// a few octaves of value noise on the panel's world position, so they're continuous across its
// pieces. Kept bright: the skylight reads as the mall's main light.
import { type Material, type Mesh, type Object3D, ShaderMaterial } from 'three';

const time = { value: 0 };

const sky = new ShaderMaterial({
  uniforms: { time },
  vertexShader: /* glsl */ `
    varying vec3 vWorld;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: /* glsl */ `
    uniform float time;
    varying vec3 vWorld;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float v = 0.0, a = 0.5;
      for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
      return v;
    }
    void main() {
      vec2 p = vWorld.xz * 0.07 + vec2(time * 0.012, time * 0.004);
      float c = smoothstep(0.45, 0.8, fbm(p));
      // brighter towards the long edges, where the sky meets the frame
      float edge = smoothstep(1.2, 3.0, abs(vWorld.x));
      vec3 blue = mix(vec3(0.62, 0.8, 0.97), vec3(0.93, 0.96, 1.0), edge);
      vec3 col = mix(blue, vec3(1.0, 0.99, 0.97), c * 0.85);
      gl_FragColor = vec4(col, 1.0);
    }`,
});

/** Swap the mall's skylight material (named "skylight" by the Blender build) for the sky. */
export function installSky(visual: Object3D): { update(dt: number): void; found: boolean } {
  let found = false;
  visual.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as Material;
    if (!m.name?.startsWith('skylight')) return;
    m.dispose();
    mesh.material = sky;
    found = true;
  });
  return {
    found,
    update(dt) {
      time.value = (time.value + dt) % 10000;
    },
  };
}
