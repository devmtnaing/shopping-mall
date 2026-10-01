// On-screen controls for touch devices: a floating joystick (left half) and Run / Jump buttons.
// The right half of the screen stays free for drag-to-look and pinch-to-zoom (handled by Input).
import type { Input } from './input';

/** Joystick travel in CSS px: dragging this far from where you touched = full speed. */
const RADIUS = 56;
/** Ignore tiny movements so resting your thumb doesn't creep. */
const DEAD_ZONE = 0.12;

/** Drag offset in px → stick vector (x = right, y = forward), length ≤ 1 with a dead zone. */
export function stickFromDrag(dx: number, dy: number, radius = RADIUS): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  const mag = Math.min(1, len / radius);
  if (mag < DEAD_ZONE) return { x: 0, y: 0 };
  const scaled = (mag - DEAD_ZONE) / (1 - DEAD_ZONE);
  return { x: (dx / len) * scaled, y: (-dy / len) * scaled };
}

function el(tag: string, className: string, parent: HTMLElement, text = '') {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  parent.append(e);
  return e;
}

export function createTouchControls(canvas: HTMLCanvasElement, input: Input) {
  const root = el('div', 'touch', document.body);
  const base = el('div', 'joy', root);
  const knob = el('div', 'joy-knob', base);
  const run = el('button', 'touch-btn touch-run', root, 'Run') as HTMLButtonElement;
  const jump = el('button', 'touch-btn touch-jump', root, 'Jump') as HTMLButtonElement;
  run.setAttribute('aria-pressed', 'false');

  let stickId = -1;
  let ox = 0;
  let oy = 0;

  // capture phase: runs before Input sees the pointer, so the joystick thumb never turns the camera
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || stickId !== -1 || e.clientX > innerWidth / 2) return;
      stickId = e.pointerId;
      input.claimed.add(e.pointerId);
      ox = e.clientX;
      oy = e.clientY;
      base.style.transform = `translate(${ox}px, ${oy}px)`;
      knob.style.transform = '';
      base.classList.add('on');
    },
    { capture: true },
  );
  addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const dx = e.clientX - ox;
    const dy = e.clientY - oy;
    const v = stickFromDrag(dx, dy);
    input.stick.x = v.x;
    input.stick.y = v.y;
    const len = Math.hypot(dx, dy);
    const k = len > RADIUS ? RADIUS / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    input.claimed.delete(stickId);
    stickId = -1;
    input.stick.x = 0;
    input.stick.y = 0;
    base.classList.remove('on');
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);

  jump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.keys.press('Space');
  });
  // On pointerdown, like Jump: a phone doesn't send `click` for a second finger while the other is
  // on the joystick, so a click handler would only work standing still. A keyboard or screen
  // reader still clicks it (detail 0); a touch's own click afterwards is ignored.
  const toggleRun = () => {
    input.runToggle = !input.runToggle;
    run.setAttribute('aria-pressed', String(input.runToggle));
  };
  run.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggleRun();
  });
  run.addEventListener('click', (e) => {
    if (e.detail === 0) toggleRun();
  });

  return root;
}
