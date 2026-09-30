// Planar floor reflection for High (T-212): a mirror layer over the concourse's polished stone.
// It renders the mall mirrored in the floor at half resolution each frame and lays it faintly over
// the baked floor, stronger at grazing angles (Fresnel), so the stone still reads through. Medium
// keeps only the cube-map environment reflection (render/environment.ts); Low has neither.
import { effect } from '@preact/signals';
import { PlaneGeometry, type Scene, type WebGLRenderer } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { tier } from '../quality';

/** How much of the reflection shows, looking straight down and along the floor. */
const STRAIGHT = 0.05;
const GRAZING = 0.3;
/** The concourse's floor: x ±6 from the entrance (z 0) to the flagship (z −54), just above y 0. */
const FLOOR = { width: 12, depth: 54, z: -27, y: 0.004 };

const shader = {
  name: 'FloorMirror',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec3 view = normalize(cameraPosition - vWorld);
      float fresnel = pow(1.0 - clamp(view.y, 0.0, 1.0), 3.0);
      vec4 r = texture2DProj(tDiffuse, vUv);
      gl_FragColor = vec4(r.rgb, mix(${STRAIGHT.toFixed(3)}, ${GRAZING.toFixed(3)}, fresnel));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function installFloorMirror(renderer: WebGLRenderer, scene: Scene) {
  let mirror: Reflector | null = null;
  const size = () => {
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    return [Math.max(256, Math.round(w / 2)), Math.max(144, Math.round(h / 2))] as const;
  };
  const create = () => {
    const [w, h] = size();
    const m = new Reflector(new PlaneGeometry(FLOOR.width, FLOOR.depth), {
      textureWidth: w,
      textureHeight: h,
      clipBias: 0.003,
      multisample: 0,
      shader,
    });
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, FLOOR.y, FLOOR.z);
    const mat = m.material as import('three').ShaderMaterial;
    mat.transparent = true;
    mat.depthWrite = false;
    m.renderOrder = 1;
    return m;
  };
  effect(() => {
    const on = tier.value === 'high';
    if (on && !mirror) {
      mirror = create();
      scene.add(mirror);
    } else if (!on && mirror) {
      scene.remove(mirror);
      mirror.dispose();
      mirror = null;
    }
  });
  // follow the canvas (and dynamic resolution) at half size
  let last = '';
  return {
    /** Every frame; `show` false hides it (and skips its render) for the frame. */
    update(show = true) {
      if (!mirror) return;
      mirror.visible = show;
      const [w, h] = size();
      const key = `${w}x${h}`;
      if (key !== last) {
        mirror.getRenderTarget().setSize(w, h);
        last = key;
      }
    },
  };
}
