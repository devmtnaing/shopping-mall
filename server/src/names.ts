import { CHAT_MAX, NAME_MAX, NAME_MIN } from '@plaza/shared/protocol';

/** Clean up a display name: NFC, no control or zero-width characters, single spaces. Null if unusable. */
export function cleanName(raw: string): string | null {
  const name = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '') // control + format chars (zero-width joiners, RTL overrides…)
    .replace(/\s+/g, ' ')
    .trim();
  const length = [...name].length;
  return length >= NAME_MIN && length <= NAME_MAX ? name : null;
}

/** Tidy a chat message: NFC, no control/format characters, single spaces, at most CHAT_MAX characters. */
export function cleanChat(raw: string): string {
  const text = raw
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...text].slice(0, CHAT_MAX).join('');
}
