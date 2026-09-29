// Keyboard, mouse and touch → a small input state the game reads once per step.
// Drag (any button, or one finger) looks around; a quick click or tap is reported for tap-to-walk.
// Rules: typing in a text field never moves the player; browser shortcuts (Ctrl/⌘ + key) always pass through.

import { EMOTES } from '@shopping-mall/shared/protocol';

/** Keys the game owns (their default browser action is suppressed while playing). */
const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Space',
  'KeyC',
  'KeyE',
  'KeyM',
  'KeyF',
  ...EMOTES.map((_, i) => `Digit${i + 1}`), // emotes: 1, 2, 3…
]);

type KeyEventLike = {
  code: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  target?: unknown;
  preventDefault(): void;
};

/** True when the event comes from somewhere the user is typing. */
export function isTyping(target: unknown): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  return (
    el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable
  );
}

/** Held keys plus one-shot presses. Pure, so it's unit-tested without a DOM. */
export class KeyState {
  private readonly held = new Set<string>();
  private readonly presses = new Set<string>();

  down(e: KeyEventLike) {
    if (isTyping(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser/OS shortcut: not ours
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault();
    if (!e.repeat) this.presses.add(e.code);
    this.held.add(e.code);
  }

  up(e: { code: string }) {
    this.held.delete(e.code);
  }

  /** Release everything, e.g. when the window loses focus (otherwise keys stick). */
  clear() {
    this.held.clear();
    this.presses.clear();
  }

  isDown(code: string) {
    return this.held.has(code);
  }

  /** A press from an on-screen button (touch). */
  press(code: string) {
    this.presses.add(code);
  }

  /** True once per physical press. */
  consume(code: string) {
    return this.presses.delete(code);
  }

  /** Movement from keys: x = strafe right, y = forward. Each in [−1, 1]. */
  axis(): { x: number; y: number } {
    const k = (a: string, b: string) => (this.held.has(a) || this.held.has(b) ? 1 : 0);
    return {
      x: k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'),
      y: k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown'),
    };
  }
}

/** Radians of camera turn per pixel of mouse / finger movement. */
const LOOK_SPEED = 0.0042;
/** Zoom units per wheel "line" and per pixel of pinch. */
const WHEEL_ZOOM = 0.0025;
const PINCH_ZOOM = 0.012;
/** A press that moves less than this (px) and lifts within TAP_TIME (ms) is a tap, not a drag. */
const TAP_SLOP = 8;
const TAP_TIME = 350;

export class Input {
  readonly keys = new KeyState();
  /** Joystick vector set by touch controls (T-107): x = strafe right, y = forward. */
  readonly stick = { x: 0, y: 0 };
  /** Run toggled on by the touch Run button. */
  runToggle = false;
  /** Pointers owned by something else (the joystick); they never turn the camera. */
  readonly claimed = new Set<number>();
  private lookX = 0;
  private lookY = 0;
  private zoom = 0;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  /** The pointer that might become a tap: where and when it went down. */
  private down: { id: number; x: number; y: number; t: number } | null = null;
  private tap: { x: number; y: number } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => this.keys.down(e));
    addEventListener('keyup', (e) => this.keys.up(e));
    addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    addEventListener('pointermove', (e) => this.onMove(e));
    addEventListener('pointerup', (e) => this.onUp(e));
    addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** A quick tap/click (not a drag) since the last call, in client pixels, or null. */
  takeTap(): { x: number; y: number } | null {
    const t = this.tap;
    this.tap = null;
    return t;
  }

  get run() {
    return this.runToggle || this.keys.isDown('ShiftLeft') || this.keys.isDown('ShiftRight');
  }

  /** True once per jump press (Space or the touch button). */
  jump() {
    return this.keys.consume('Space');
  }

  /** Combined movement (keys + joystick), clamped to length 1. */
  move(): { x: number; y: number } {
    const k = this.keys.axis();
    const x = k.x + this.stick.x;
    const y = k.y + this.stick.y;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }

  /** Camera turn since the last call, in radians: yaw (+ = turn left), pitch (+ = look up). */
  takeLook(): { yaw: number; pitch: number } {
    const out = { yaw: -this.lookX * LOOK_SPEED, pitch: -this.lookY * LOOK_SPEED };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  /** Zoom since the last call (+ = zoom out). */
  takeZoom(): number {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }

  private onDown(e: PointerEvent) {
    this.canvas.focus();
    if (this.claimed.has(e.pointerId)) return;
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.down = e.button === 0 ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp } : null;
    if (this.pointers.size === 2) this.pinchDist = this.spread();
  }

  private onMove(e: PointerEvent) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.lookX += dx;
      this.lookY += dy;
    } else if (this.pointers.size === 2) {
      const d = this.spread();
      this.zoom -= (d - this.pinchDist) * PINCH_ZOOM;
      this.pinchDist = d;
    }
  }

  private onUp(e: PointerEvent) {
    const d = this.down;
    if (d && d.id === e.pointerId && this.pointers.size === 1) {
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (moved < TAP_SLOP && e.timeStamp - d.t < TAP_TIME) this.tap = { x: e.clientX, y: e.clientY };
    }
    this.down = null;
    this.pointers.delete(e.pointerId);
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const lines = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoom += lines * WHEEL_ZOOM;
  }

  private spread() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
