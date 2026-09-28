import config from 'virtual:plaza-config';
import { Color, DirectionalLight, Fog, HemisphereLight, Scene } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { startLoop } from './loop';
import type { DebugOverlay } from './render/debug';
import { createRenderer } from './render/renderer';
import { loadMall } from './world/mall';
import './style.css';

document.title = config.mall.name;
const debugMode = new URLSearchParams(location.search).has('debug');

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const { renderer, camera } = createRenderer(canvas);

const scene = new Scene();
scene.background = new Color('#12110f');
scene.fog = new Fog('#12110f', 60, 140);
scene.add(new HemisphereLight('#fff6e6', '#6b6152', 2.2));
const sun = new DirectionalLight('#fff1dc', 1.6);
sun.position.set(8, 20, 6);
scene.add(sun);

const mall = await loadMall();
scene.add(mall.visual);

let debug: DebugOverlay | undefined;
if (debugMode) {
  const [{ createDebugOverlay }, { createGizmos }] = await Promise.all([
    import('./render/debug'),
    import('./world/gizmos'),
  ]);
  debug = createDebugOverlay(renderer);
  scene.add(createGizmos(mall.meta));
  // handle for Playwright tests and console poking; never present without ?debug
  Object.assign(window, { plaza: { scene, camera, renderer, mall } });
}

// Temporary free camera until the player controller lands (T-104).
const spawn = mall.meta.spawns[0];
camera.position.set(0, 18, 12);
const controls = new OrbitControls(camera, canvas);
controls.target.set(spawn?.pos[0] ?? 0, 2, (spawn?.pos[2] ?? 0) - 25);
controls.update();

startLoop({
  step: () => {},
  render: () => {
    const t0 = performance.now();
    controls.update();
    renderer.render(scene, camera);
    debug?.update(performance.now() - t0);
  },
});
