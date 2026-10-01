// Shared state between the game and the UI. The game writes these only when a value changes;
// the UI reads them. UI code never imports three.js, game code never touches the DOM (except the canvas).

import { computed, signal } from '@preact/signals';
import { type AvatarId, DEFAULT_AVATAR, isAvatar } from '@shopping-mall/shared/avatars';
import type { MallMeta } from '@shopping-mall/shared/meta';
import { track } from './analytics';
import { load, save } from './storage';

/** 'landing' shows the welcome screen over an orbiting view; 'playing' hands over control. */
export const phase = signal<'landing' | 'playing'>('landing');

/** Mall meta once the world has loaded (the landing screen shows before it's ready). */
export const mallMeta = signal<MallMeta | null>(null);

/** Colours for your name tag and minimap dot. */
export const BODY_COLORS = ['#e2b857', '#e76f51', '#2a9d8f', '#6d8bff', '#c77dff', '#f4f1ea'] as const;

/** Who the visitor is. Remembered on this device (profiles saved before avatars get the default one). */
export type Profile = { name: string; color: string; avatar: AvatarId };
const saved = load<Partial<Profile>>('profile', {});
export const profile = signal<Profile>({
  name: saved.name ?? '',
  color: saved.color ?? BODY_COLORS[0],
  avatar: isAvatar(saved.avatar) ? saved.avatar : DEFAULT_AVATAR,
});

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

/** Other visitors for the minimap, refreshed twice a second. */
export const others = signal<{ x: number; z: number; floor: number; color: string }[]>([]);

/** 'sit' when a bench is within reach, 'stand' while sitting (drives the seat prompt). */
export const seatPrompt = signal<'sit' | 'stand' | null>(null);
/** At a fruit stand ("pick"), or holding apples ("throw"); `held` is how many (T-507). */
export const applePrompt = signal<{ mode: 'pick' | 'throw' } | null>(null);

/** Id of the shop whose door the player is near (drives the "Visit" prompt). */
export const nearbyShop = signal<string | null>(null);

/** Id of the shop whose panel is open. */
export const panel = signal<string | null>(null);

/** Slot id of the vacant unit whose door the player is near (drives the "Rent" prompt). */
export const nearbyUnit = signal<string | null>(null);
/** Slot id of the vacant unit whose rental form is open. */
export const rentUnit = signal<string | null>(null);

// Units this visitor has applied for in this browser session, so they can't apply twice.
const APPLIED = 'shopping-mall:applied';
const readApplied = (): string[] => {
  try {
    return JSON.parse(sessionStorage.getItem(APPLIED) ?? '[]') as string[];
  } catch {
    return [];
  }
};
export const appliedUnits = signal<string[]>(readApplied());
export function markApplied(slot: string) {
  if (appliedUnits.value.includes(slot)) return;
  appliedUnits.value = [...appliedUnits.value, slot];
  try {
    sessionStorage.setItem(APPLIED, JSON.stringify(appliedUnits.value));
  } catch {
    /* not available: the signal still covers this page load */
  }
}

/** Which modal dialog is open. */
export type DialogId = 'help' | 'directory' | 'character';
export const dialog = signal<DialogId | null>(null);

/** Multiplayer connection state (see net/socket.ts) and how many people are in your room. */
export type NetState = 'off' | 'connecting' | 'online' | 'reconnecting' | 'offline' | 'full' | 'parked';
/** Why you were taken out of the mall, while parked. */
export const parkedFor = signal<'away' | 'idle' | null>(null);
/** You've been idle so long you'll leave the mall soon, unless you move or say something. */
export const idleWarning = signal(false);
export const netStatus = signal<NetState>('off');
export const roomCount = signal(0);

/** Host token for this tab (memory only; signing in again is needed after a reload). */
export const hostToken = signal<string | null>(null);

/** The latest host announcement, shown as a banner for a while. */
export const announcement = signal<{ text: string; key: number } | null>(null);

/** Chat log (newest last) and whether the chat box is open. */
export type ChatLine = {
  key: number;
  kind: 'msg' | 'sys';
  /** Sender's player id (messages only), for mute / report. */
  from?: number;
  name?: string;
  text: string;
  host?: boolean;
  at: number;
};
export const chat = signal<ChatLine[]>([]);
export const chatOpen = signal(false);
let chatKey = 1;
export function addChat(line: Omit<ChatLine, 'key' | 'at'>) {
  chat.value = [...chat.value, { ...line, key: chatKey++, at: Date.now() }].slice(-50);
}

/** People you've muted this visit (by player id): their chat, bubbles and emotes are hidden. */
export const muted = signal<ReadonlySet<number>>(new Set());
export function toggleMute(id: number) {
  const next = new Set(muted.value);
  if (!next.delete(id)) next.add(id);
  muted.value = next;
}

/** The emoji bar (phones open it from the dock; desktop has keys 1–8). */
export const emoteBar = signal(false);

/** Top-down overview camera on/off. */
export const overview = signal(false);
/** The floor the minimap and the overview show; null = the one you're on. */
export const viewFloor = signal<number | null>(null);

/** Full-screen fade used when teleporting (true = faded to black). */
export const faded = signal(false);

/** Short messages at the bottom of the screen. */
export type Toast = { id: number; text: string };
export const toasts = signal<Toast[]>([]);

/** True while the UI owns the keyboard (a dialog is open), so the player shouldn't move. */
export const uiHasFocus = computed(
  () =>
    phase.value !== 'playing' ||
    dialog.value !== null ||
    panel.value !== null ||
    rentUnit.value !== null ||
    chatOpen.value,
);

export function openShop(id: string) {
  panel.value = id;
  track({ e: 'shop', shop: id });
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
