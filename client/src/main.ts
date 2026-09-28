import config from 'virtual:plaza-config';
import { BoxGeometry, Color, HemisphereLight, Mesh, MeshStandardMaterial, Scene } from 'three';
import { createRenderer } from './render/renderer';
import './style.css';
import type { DebugOverlay } from './render/debug';

document.title = config.mall.name;

const canvas = document.getElementById('gl') as HTMLCanvasElement;
const { renderer, camera } = createRenderer(canvas);

const scene = new Scene();
scene.background = new Color('#12110f');
scene.add(new HemisphereLight('#fff6e6', '#3a3326', 2.5));

const cube = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: '#e2b857' }));
scene.add(cube);
camera.position.set(0, 1.2, 3);
camera.lookAt(0, 0, 0);

let debug: DebugOverlay | undefined;
if (new URLSearchParams(location.search).has('debug')) {
  import('./render/debug').then((m) => {
    debug = m.createDebugOverlay(renderer);
  });
}

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  cube.rotation.y += dt * 0.8;
  cube.rotation.x += dt * 0.3;
  renderer.render(scene, camera);
  debug?.update(performance.now() - now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
