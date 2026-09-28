// Shared state between the game and the UI. The game writes these only when a value changes;
// the UI reads them. UI code never imports three.js, game code never touches the DOM (except the canvas).
import { signal } from '@preact/signals-core';

/** The zone the player is in: its id and display name ("Main hall", a shop's name, …). */
export const zone = signal<{ id: string; name: string } | null>(null);
