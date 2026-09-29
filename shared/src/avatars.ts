// The avatars visitors can pick from (Kenney Mini Characters, CC0; built by `pnpm assets`).
// The id is the node name in avatars.glb and the preview's file name.
export const AVATARS = [
  'female-a',
  'female-b',
  'female-c',
  'female-d',
  'female-e',
  'female-f',
  'male-a',
  'male-b',
  'male-c',
  'male-d',
  'male-e',
  'male-f',
] as const;

export type AvatarId = (typeof AVATARS)[number];
export const DEFAULT_AVATAR: AvatarId = 'female-a';

export const isAvatar = (id: unknown): id is AvatarId => AVATARS.includes(id as AvatarId);

/** Animation clips shipped in avatars.glb (Kenney's names), in the order the state machine uses them. */
export const CLIPS = [
  'idle',
  'walk',
  'sprint',
  'jump',
  'fall',
  'sit',
  'emote-yes',
  'emote-no',
  'interact-right',
] as const;
export type ClipName = (typeof CLIPS)[number];
