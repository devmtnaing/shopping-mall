// "You are in <zone>" at the top of the screen. Plain DOM for now; becomes a Preact component in T-301.
import { effect } from '@preact/signals-core';
import { zone } from '../state';

export function mountZoneLabel() {
  const root = document.createElement('div');
  root.className = 'zone-label';
  root.setAttribute('aria-live', 'polite');
  const eyebrow = document.createElement('div');
  eyebrow.className = 'zone-eyebrow';
  eyebrow.textContent = 'You are in';
  const name = document.createElement('div');
  name.className = 'zone-name';
  root.append(eyebrow, name);
  document.body.append(root);
  effect(() => {
    const z = zone.value;
    root.hidden = !z;
    name.textContent = z?.name ?? '';
    // replay the fade-in each time the zone changes
    root.classList.remove('fresh');
    void root.offsetWidth;
    root.classList.add('fresh');
  });
}
