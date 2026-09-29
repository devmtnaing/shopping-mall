// Reflections (T-212), the cheap way: once the mall and its props are in, render the mall into a
// small cube map from the middle of the concourse and use it as the scene's environment. Glossy
// floors, brass trim and rails then reflect the mall itself, at no cost per frame.
// Low quality leaves it off; Medium and High use it.
import { effect } from '@preact/signals';
import {
  CubeCamera,
  HalfFloatType,
  type Mesh,
  type MeshBasicMaterial,
  MixOperation,
  PMREMGenerator,
  type Scene,
  type Texture,
  type Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { tier } from '../quality';

/** Environment reflections are subtle: the hemisphere light already does the diffuse work. */
const INTENSITY = 0.45;

export function installEnvironment(renderer: WebGLRenderer, scene: Scene, at: Vector3) {
  let env: Texture | null = null;
  const capture = () => {
    const target = new WebGLCubeRenderTarget(128, { type: HalfFloatType });
    const cube = new CubeCamera(0.3, 150, target);
    cube.position.copy(at);
    const fog = scene.fog;
    scene.fog = null; // the fog is for distance, not for reflections
    cube.update(renderer, scene);
    scene.fog = fog;
    const pmrem = new PMREMGenerator(renderer);
    env = pmrem.fromCubemap(target.texture).texture;
    pmrem.dispose();
    target.dispose();
  };
  scene.environmentIntensity = INTENSITY;
  // unlit baked surfaces don't see scene.environment; the reflective ones get it as their envMap
  const reflective: MeshBasicMaterial[] = [];
  scene.traverse((o) => {
    const m = (o as Mesh).material as MeshBasicMaterial | undefined;
    if ((o as Mesh).isMesh && m?.isMeshBasicMaterial && m.userData.reflect) reflective.push(m);
  });
  effect(() => {
    const on = tier.value !== 'low';
    if (on && !env) capture();
    scene.environment = on ? env : null;
    for (const m of reflective) {
      m.envMap = on ? env : null;
      m.combine = MixOperation;
      m.reflectivity = m.userData.reflect as number;
      m.needsUpdate = true;
    }
  });
}
