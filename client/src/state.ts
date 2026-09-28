// Shared state between the game and the UI. The game writes these only when a value changes;
// the UI reads them. UI code never imports three.js, game code never touches the DOM (except the canvas).
import type { MallMeta } from '@plaza/shared/meta';
import { computed, signal } from '@preact/signals';
import { load, save } from './storage';

/** 'landing' shows the welcome screen over an orbiting view; 'playing' hands over control. */
export const phase = signal<'landing' | 'playing'>('landing');

/** Mall meta once the world has loaded (the landing screen shows before it's ready). */
export const mallMeta = signal<MallMeta | null>(null);

/** Body colours offered until real outfits arrive (Phase 2). */
export const BODY_COLORS = ['#e2b857', '#e76f51', '#2a9d8f', '#6d8bff', '#c77dff', '#f4f1ea'] as const;

/** Who the visitor is. Remembered on this device. */
export type Profile = { name: string; color: string };
export const profile = signal<Profile>(load('profile', { name: '', color: BODY_COLORS[0] }));

export function saveProfile(p: Profile) {
  profile.value = p;
  save('profile', p);
}

/**
 * The zone the player is in. `area` is the translation id for mall areas ("main-hall", "vacant");
 * null means a shop, whose `name` is shown as written in the config.
 */
export const zone = signal<{ id: string; name: string; area: string | null } | null>(null);

/** Player position for the minimap, updated at most 10× a second. `floor` indexes meta.floors. */
export const pose = signal({ x: 0, z: 0, yaw: 0, floor: 0 });

/** Id of the shop whose door the player is near (drives the "Visit" prompt). */
export const nearbyShop = signal<string | null>(null);

/** Id of the shop whose panel is open. */
export const panel = signal<string | null>(null);

/** Which modal dialog is open. */
export type DialogId = 'help' | 'directory';
export const dialog = signal<DialogId | null>(null);

/** Top-down overview camera on/off. */
export const overview = signal(false);

/** Full-screen fade used when teleporting (true = faded to black). */
export const faded = signal(false);

/** Short messages at the bottom of the screen. */
export type Toast = { id: number; text: string };
export const toasts = signal<Toast[]>([]);

/** True while the UI owns the keyboard (a dialog is open), so the player shouldn't move. */
export const uiHasFocus = computed(
  () => phase.value !== 'playing' || dialog.value !== null || panel.value !== null,
);

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
