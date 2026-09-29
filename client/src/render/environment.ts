// Reflections (T-212), the cheap way: once the mall and its props are in, render the mall into a
// small cube map from the middle of the concourse and use it as the scene's environment. Glossy
// floors, brass trim and rails then reflect the mall itself, at no cost per frame.
// Low quality leaves it off; Medium and High use it.
import { effect } from '@preact/signals';
import {
  CubeCamera,
  HalfFloatType,
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
  effect(() => {
    if (tier.value === 'low') {
      scene.environment = null;
      return;
    }
    if (!env) capture();
    scene.environment = env;
  });
}
