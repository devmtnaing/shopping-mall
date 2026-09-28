import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';

/** Max device pixel ratio. Quality tiers lower this later (docs/architecture.md § Quality tiers). */
const MAX_DPR = 2;

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));

  const camera = new PerspectiveCamera(60, 1, 0.1, 400);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  new ResizeObserver(resize).observe(canvas);

  return { renderer, camera };
}
