// Shared state between the game and the UI. The game writes these only when a value changes;
// the UI reads them. UI code never imports three.js, game code never touches the DOM (except the canvas).
import { computed, signal } from '@preact/signals';

/** The zone the player is in: its id and display name ("Main hall", a shop's name, …). */
export const zone = signal<{ id: string; name: string } | null>(null);

/** Id of the shop whose door the player is near (drives the "Visit" prompt). */
export const nearbyShop = signal<string | null>(null);

/** Id of the shop whose panel is open. */
export const panel = signal<string | null>(null);

/** Which modal dialog is open. */
export type DialogId = 'help';
export const dialog = signal<DialogId | null>(null);

/** Short messages at the bottom of the screen. */
export type Toast = { id: number; text: string };
export const toasts = signal<Toast[]>([]);

/** True while the UI owns the keyboard (a dialog is open), so the player shouldn't move. */
export const uiHasFocus = computed(() => dialog.value !== null || panel.value !== null);

export function openShop(id: string) {
  panel.value = id;
}

let nextToast = 1;
/** Show a toast for `ms` milliseconds. */
export function toast(text: string, ms = 2600) {
  const id = nextToast++;
  toasts.value = [...toasts.value, { id, text }].slice(-3);
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, ms);
}
