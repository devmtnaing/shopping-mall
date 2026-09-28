// ?debug overlay: fps, frame-time graph, renderer.info, JS heap.
// Loaded with import() only when the query param is present, so it costs nothing otherwise.
import type { WebGLRenderer } from 'three';

const W = 160;
const H = 40;
/** Graph ceiling in ms; the dashed line marks the 16.7 ms (60 fps) budget. */
const MAX_MS = 33.4;

export function createDebugOverlay(renderer: WebGLRenderer) {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;top:8px;left:8px;z-index:99;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.72);' +
    'font:11px/1.35 ui-monospace,Menlo,monospace;color:#cfe;pointer-events:none;white-space:pre';
  const text = document.createElement('div');
  const graph = document.createElement('canvas');
  graph.width = W;
  graph.height = H;
  graph.style.cssText = `display:block;margin-top:4px;width:${W}px;height:${H}px`;
  root.append(text, graph);
  document.body.append(root);

  const g = graph.getContext('2d') as CanvasRenderingContext2D;
  const budgetY = H - (16.7 / MAX_MS) * H;
  const lines: Record<string, string> = {};
  let frames = 0;
  let worst = 0;
  let lastText = performance.now();

  /** Call once per frame after render. `ms` is the frame's CPU time. */
  function update(ms: number) {
    frames++;
    worst = Math.max(worst, ms);

    // scroll the graph one pixel and draw the newest bar
    // 'copy' replaces pixels instead of blending, so old bars scroll away instead of piling up
    g.globalCompositeOperation = 'copy';
    g.drawImage(graph, -1, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(W - 1, 0, 1, H);
    const h = Math.min(ms / MAX_MS, 1) * H;
    g.fillStyle = ms > 16.7 ? '#f66' : '#6d8';
    g.fillRect(W - 1, H - h, 1, h);
    g.fillStyle = '#fff4';
    g.fillRect(W - 1, budgetY, 1, 1);

    const now = performance.now();
    if (now - lastText < 250) return;
    const { render, memory, programs } = renderer.info;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    text.textContent = [
      `fps ${Math.round((frames * 1000) / (now - lastText))}  worst ${worst.toFixed(1)} ms`,
      `calls ${render.calls}  tris ${(render.triangles / 1000).toFixed(1)}k`,
      `geo ${memory.geometries}  tex ${memory.textures}  prog ${programs?.length ?? 0}`,
      heap ? `heap ${(heap.usedJSHeapSize / 1048576).toFixed(0)} MB` : '',
      ...Object.entries(lines).map(([k, v]) => `${k} ${v}`),
    ]
      .filter(Boolean)
      .join('\n');
    frames = 0;
    worst = 0;
    lastText = now;
  }

  /** Extra labelled lines other modules can report (e.g. zone, net KB/s). */
  function set(key: string, value: string) {
    lines[key] = value;
  }

  return { update, set };
}

export type DebugOverlay = ReturnType<typeof createDebugOverlay>;
