// Speech bubbles and emotes above heads. A small DOM overlay (there are only ever a few, briefly),
// positioned each frame by projecting the head into screen space. Text is set with textContent.
import { PLAYER } from '@plaza/shared/constants';
import { type Camera, Vector3 } from 'three';

const SAY_MS = 5000;
const EMOTE_MS = 2500;
/** Bubbles further away than this (m) aren't shown. */
const MAX_DIST = 25;
const MAX_BUBBLES = 10;

type Bubble = { el: HTMLDivElement; until: number; key: number | 'me' };

const head = new Vector3();

export class Bubbles {
  private readonly root: HTMLDivElement;
  private readonly live: Bubble[] = [];

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'bubbles';
    this.root.setAttribute('aria-hidden', 'true'); // chat is announced by the chat log already
    document.body.append(this.root);
  }

  /** Show `text` over player `key` ('me' for the local player). Emotes are big and short-lived. */
  show(key: number | 'me', text: string, emote = false) {
    // one bubble per person: a new one replaces the old
    const old = this.live.findIndex((b) => b.key === key && b.el.classList.contains('emote') === emote);
    if (old >= 0) this.remove(old);
    if (this.live.length >= MAX_BUBBLES) this.remove(0);
    const el = document.createElement('div');
    el.className = emote ? 'bubble emote' : 'bubble';
    el.textContent = text;
    this.root.append(el);
    this.live.push({ el, key, until: performance.now() + (emote ? EMOTE_MS : SAY_MS) });
  }

  /** Position every bubble. `feet(key)` gives the player's feet position, or null if not visible. */
  update(camera: Camera, width: number, height: number, feet: (key: number | 'me') => Vector3 | null) {
    const now = performance.now();
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i] as Bubble;
      if (now > b.until) {
        this.remove(i);
        continue;
      }
      const f = feet(b.key);
      const lift = b.el.classList.contains('emote') ? 0.55 : 0.75;
      const d = f ? camera.position.distanceTo(f) : Number.POSITIVE_INFINITY;
      if (!f || d > MAX_DIST) {
        b.el.style.opacity = '0';
        continue;
      }
      head
        .copy(f)
        .setY(f.y + PLAYER.height + lift)
        .project(camera);
      if (head.z > 1) {
        b.el.style.opacity = '0'; // behind the camera
        continue;
      }
      const x = (head.x * 0.5 + 0.5) * width;
      const y = (-head.y * 0.5 + 0.5) * height;
      b.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(Math.min(1, (b.until - now) / 400, 1 - d / MAX_DIST + 0.35));
    }
  }

  private remove(i: number) {
    this.live[i]?.el.remove();
    this.live.splice(i, 1);
  }
}
