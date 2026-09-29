import { effect } from '@preact/signals';
import { ACESFilmicToneMapping, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { TIERS, tier } from '../quality';

export function createRenderer(canvas: HTMLCanvasElement) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  const camera = new PerspectiveCamera(60, 1, 0.1, 400);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  // the quality tier caps the pixel ratio, live
  effect(() => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, TIERS[tier.value].dpr));
    resize();
  });
  new ResizeObserver(resize).observe(canvas);

  return { renderer, camera };
}
