// The avatars visitors can pick from (Kenney Mini Characters, CC0, and characters generated with
// Higgsfield on the same rig; built by `pnpm assets`).
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
  'burmese-woman',
  'burmese-man',
  'student',
] as const;

export type AvatarId = (typeof AVATARS)[number];
export const DEFAULT_AVATAR: AvatarId = 'female-a';

export const isAvatar = (id: unknown): id is AvatarId => AVATARS.includes(id as AvatarId);

/** Animation clips shipped in avatars.glb (Kenney's names; sit, dance, hug and throw are keyframed in tools/assets/social-clips.ts). */
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
  'dance',
  'hug',
  'throw',
] as const;
export type ClipName = (typeof CLIPS)[number];

/** When the apple leaves the hand in the `throw` clip (s): the client launches it then. */
export const THROW_RELEASE = 0.4;
